import crypto from 'node:crypto';
import assert from 'node:assert';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as tar from 'tar';
import { PbxDatabase } from '../model/database';
import { SecretCipher } from '../security/crypto';

export const BACKUP_FORMAT_VERSION = 1;

interface ManifestEntry {
  path: string;
  type: 'file' | 'symlink';
  size: number;
  sha256: string;
  linkTarget?: string;
}

export interface BackupManifest {
  formatVersion: number;
  product: 'Essentials+ Calls';
  productVersion: string;
  createdAt: string;
  masterKeyIncluded: false;
  secretKeyIds: string[];
  entries: ManifestEntry[];
}

function sha256(data: Buffer | string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

function copyIfExists(source: string, destination: string): void {
  if (fs.existsSync(source)) fs.cpSync(source, destination, { recursive: true, dereference: false, verbatimSymlinks: true });
  else fs.mkdirSync(destination, { recursive: true });
}

function collectEntries(root: string, relative = ''): ManifestEntry[] {
  const directory = path.join(root, relative);
  const entries: ManifestEntry[] = [];
  for (const name of fs.readdirSync(directory).sort()) {
    const childRelative = path.posix.join(relative.split(path.sep).join(path.posix.sep), name);
    if (childRelative === 'manifest.json') continue;
    const full = path.join(root, ...childRelative.split('/'));
    const stat = fs.lstatSync(full);
    if (stat.isDirectory()) {
      entries.push(...collectEntries(root, childRelative));
    } else if (stat.isSymbolicLink()) {
      const target = fs.readlinkSync(full);
      entries.push({ path: childRelative, type: 'symlink', size: Buffer.byteLength(target), sha256: sha256(target), linkTarget: target });
    } else if (stat.isFile()) {
      entries.push({ path: childRelative, type: 'file', size: stat.size, sha256: sha256(fs.readFileSync(full)) });
    }
  }
  return entries;
}

function safeArchivePath(value: string): boolean {
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  return !path.posix.isAbsolute(normalized) && normalized !== '..' && !normalized.startsWith('../');
}

function assertSafeExtractedTree(root: string): void {
  for (const entry of collectEntries(root)) {
    if (!safeArchivePath(entry.path)) throw new Error(`Unsicherer Backup-Pfad: ${entry.path}`);
    if (entry.type === 'symlink') {
      const full = path.join(root, ...entry.path.split('/'));
      const resolved = path.resolve(path.dirname(full), entry.linkTarget!);
      const relative = path.relative(root, resolved);
      if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Symlink verlässt das Backup: ${entry.path}`);
    }
  }
}

export async function createBackup(options: {
  database: PbxDatabase;
  soundsDir: string;
  configDir: string;
  outputPath: string;
  productVersion?: string;
}): Promise<BackupManifest> {
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-backup-'));
  try {
    fs.mkdirSync(path.join(staging, 'database'), { recursive: true });
    await options.database.db.backup(path.join(staging, 'database', 'essentials-calls.sqlite3'));
    copyIfExists(options.soundsDir, path.join(staging, 'sounds'));
    copyIfExists(options.configDir, path.join(staging, 'generated'));
    const keyRows = options.database.db.prepare('SELECT DISTINCT key_id FROM sip_secrets ORDER BY key_id').all() as Array<{ key_id: string }>;
    const manifest: BackupManifest = {
      formatVersion: BACKUP_FORMAT_VERSION,
      product: 'Essentials+ Calls',
      productVersion: options.productVersion ?? '0.2.0',
      createdAt: new Date().toISOString(),
      masterKeyIncluded: false,
      secretKeyIds: keyRows.map((row) => row.key_id),
      entries: collectEntries(staging),
    };
    fs.writeFileSync(path.join(staging, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
    fs.mkdirSync(path.dirname(path.resolve(options.outputPath)), { recursive: true });
    await tar.c(
      { cwd: staging, file: options.outputPath, gzip: true, portable: true, noMtime: true },
      ['manifest.json', 'database', 'sounds', 'generated']
    );
    options.database.audit({ id: null, username: 'backup-cli' }, 'backup.create', path.basename(options.outputPath), 'success', {
      formatVersion: BACKUP_FORMAT_VERSION,
      entries: manifest.entries.length,
      masterKeyIncluded: false,
    });
    return manifest;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}

function assertEmpty(directory: string, label: string): void {
  if (!fs.existsSync(directory)) return;
  if (fs.readdirSync(directory).length > 0) throw new Error(`${label} muss für einen Restore leer sein: ${directory}`);
}

export async function restoreBackup(options: {
  archivePath: string;
  dataDir: string;
  soundsDir: string;
  configDir: string;
  cipher: SecretCipher;
}): Promise<BackupManifest> {
  assertEmpty(options.dataDir, 'DATA_DIR');
  assertEmpty(options.soundsDir, 'SOUNDS_DIR');
  assertEmpty(options.configDir, 'CONFIG_OUT_DIR');
  const staging = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-restore-'));
  try {
    await tar.x({
      cwd: staging,
      file: options.archivePath,
      strict: true,
      preservePaths: false,
      filter: (entryPath) => {
        if (!safeArchivePath(entryPath)) throw new Error(`Unsicherer Pfad im Backup: ${entryPath}`);
        return true;
      },
    });
    assertSafeExtractedTree(staging);
    const manifestPath = path.join(staging, 'manifest.json');
    if (!fs.existsSync(manifestPath)) throw new Error('Backup enthält kein Versionsmanifest.');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BackupManifest;
    if (
      manifest.product !== 'Essentials+ Calls' ||
      manifest.formatVersion !== BACKUP_FORMAT_VERSION ||
      manifest.masterKeyIncluded !== false ||
      !Array.isArray(manifest.entries)
    ) {
      throw new Error('Backup-Manifest ist inkompatibel oder manipuliert.');
    }
    const actual = collectEntries(staging);
    assert.deepStrictEqual(actual, manifest.entries, 'Backup-Prüfsummen oder Dateiliste stimmen nicht.');

    const extractedDatabase = path.join(staging, 'database', 'essentials-calls.sqlite3');
    if (!fs.existsSync(extractedDatabase)) throw new Error('Backup enthält keine SQLite-Datenbank.');
    const verificationDatabase = new PbxDatabase(path.join(staging, 'verification-data'), options.cipher, {
      databasePath: extractedDatabase,
    });
    verificationDatabase.materializedTopology();
    verificationDatabase.db.prepare('DELETE FROM sessions').run();
    verificationDatabase.audit({ id: null, username: 'restore-cli' }, 'backup.restore', path.basename(options.archivePath), 'success', {
      formatVersion: manifest.formatVersion,
      sourceCreatedAt: manifest.createdAt,
    });
    verificationDatabase.close();

    fs.mkdirSync(options.dataDir, { recursive: true });
    fs.copyFileSync(extractedDatabase, path.join(options.dataDir, 'essentials-calls.sqlite3'));
    fs.mkdirSync(options.soundsDir, { recursive: true });
    fs.mkdirSync(options.configDir, { recursive: true });
    copyIfExists(path.join(staging, 'sounds'), options.soundsDir);
    copyIfExists(path.join(staging, 'generated'), options.configDir);
    return manifest;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
