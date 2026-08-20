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

function applySoundPermissions(directory: string, readerGid?: number, includeRoot = true): void {
  if (readerGid !== undefined && (!Number.isSafeInteger(readerGid) || readerGid < 0)) {
    throw new Error('SOUNDS_READER_GID muss eine nichtnegative Ganzzahl sein.');
  }
  const visit = (entryPath: string, isRoot = false): void => {
    const entry = fs.lstatSync(entryPath);
    if (entry.isSymbolicLink()) return;
    if (entry.isDirectory()) {
      for (const child of fs.readdirSync(entryPath)) visit(path.join(entryPath, child));
      if (isRoot && !includeRoot) return;
      fs.chmodSync(entryPath, 0o750);
      if (readerGid !== undefined) fs.chownSync(entryPath, -1, readerGid);
    } else if (entry.isFile()) {
      fs.chmodSync(entryPath, 0o640);
      if (readerGid !== undefined) fs.chownSync(entryPath, -1, readerGid);
    }
  };
  visit(directory, true);
}

interface RestoreTarget {
  directory: string;
  existed: boolean;
  originalMode?: number;
  writtenEntries: string[];
}

function inspectRestoreTarget(directory: string, label: string): RestoreTarget {
  assertEmpty(directory, label);
  const existed = fs.existsSync(directory);
  const stat = existed ? fs.statSync(directory) : undefined;
  return {
    directory,
    existed,
    originalMode: stat ? stat.mode & 0o777 : undefined,
    writtenEntries: [],
  };
}

function createRestoreTarget(target: RestoreTarget, mode?: number): void {
  fs.mkdirSync(target.directory, { recursive: true, ...(mode === undefined ? {} : { mode }) });
  if (mode !== undefined) fs.chmodSync(target.directory, mode);
}

function copyRestoreEntries(source: string, target: RestoreTarget): void {
  for (const name of fs.readdirSync(source)) {
    target.writtenEntries.push(name);
    fs.cpSync(path.join(source, name), path.join(target.directory, name), {
      recursive: true,
      dereference: false,
      verbatimSymlinks: true,
    });
  }
}

function rollBackRestoreTarget(target: RestoreTarget): void {
  for (const name of target.writtenEntries.reverse()) {
    fs.rmSync(path.join(target.directory, name), { recursive: true, force: true });
  }
  if (!fs.existsSync(target.directory)) return;
  if (target.existed) {
    if (target.originalMode !== undefined) fs.chmodSync(target.directory, target.originalMode);
    return;
  }
  try {
    fs.rmdirSync(target.directory);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOTEMPTY') throw error;
  }
}

export async function restoreBackup(options: {
  archivePath: string;
  dataDir: string;
  soundsDir: string;
  configDir: string;
  cipher: SecretCipher;
  soundsReaderGid?: number;
}): Promise<BackupManifest> {
  const dataTarget = inspectRestoreTarget(options.dataDir, 'DATA_DIR');
  const soundsTarget = inspectRestoreTarget(options.soundsDir, 'SOUNDS_DIR');
  const configTarget = inspectRestoreTarget(options.configDir, 'CONFIG_OUT_DIR');
  const targets = [dataTarget, soundsTarget, configTarget];
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
    try {
      verificationDatabase.materializedTopology();
      verificationDatabase.db.prepare('DELETE FROM sessions').run();
      verificationDatabase.audit({ id: null, username: 'restore-cli' }, 'backup.restore', path.basename(options.archivePath), 'success', {
        formatVersion: manifest.formatVersion,
        sourceCreatedAt: manifest.createdAt,
      });
    } finally {
      verificationDatabase.close();
    }

    const extractedSounds = path.join(staging, 'sounds');
    const extractedConfig = path.join(staging, 'generated');
    fs.chmodSync(extractedDatabase, 0o600);
    applySoundPermissions(extractedSounds, options.soundsReaderGid);

    // Re-check immediately before populating the targets. Permission and key
    // validation above therefore cannot leave a half-restored installation.
    assertEmpty(options.dataDir, 'DATA_DIR');
    assertEmpty(options.soundsDir, 'SOUNDS_DIR');
    assertEmpty(options.configDir, 'CONFIG_OUT_DIR');
    try {
      createRestoreTarget(dataTarget, 0o700);
      dataTarget.writtenEntries.push('essentials-calls.sqlite3');
      fs.copyFileSync(extractedDatabase, path.join(options.dataDir, 'essentials-calls.sqlite3'));
      fs.chmodSync(path.join(options.dataDir, 'essentials-calls.sqlite3'), 0o600);

      createRestoreTarget(soundsTarget, 0o750);
      copyRestoreEntries(extractedSounds, soundsTarget);
      // fs.cpSync does not promise to preserve ownership across filesystems.
      // Re-apply the validated reader group inside the rollback boundary. The
      // target root itself stays untouched until every other target is ready.
      applySoundPermissions(options.soundsDir, options.soundsReaderGid, false);

      createRestoreTarget(configTarget);
      copyRestoreEntries(extractedConfig, configTarget);

      fs.chmodSync(options.soundsDir, 0o750);
      if (options.soundsReaderGid !== undefined) fs.chownSync(options.soundsDir, -1, options.soundsReaderGid);
    } catch (error) {
      for (const target of targets.reverse()) rollBackRestoreTarget(target);
      throw error;
    }
    return manifest;
  } finally {
    fs.rmSync(staging, { recursive: true, force: true });
  }
}
