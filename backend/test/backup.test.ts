import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createBackup, restoreBackup } from '../src/backup/archive';
import { PbxDatabase } from '../src/model/database';
import { SecretCipher, SecretDecryptionError } from '../src/security/crypto';

const roots: string[] = [];
const key = SecretCipher.fromEncoded(Buffer.alloc(32, 11).toString('base64'));

function root(): string {
  const value = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-backup-test-'));
  roots.push(value);
  return value;
}

afterEach(() => {
  for (const value of roots.splice(0)) fs.rmSync(value, { recursive: true, force: true });
});

describe('backup and empty restore', () => {
  test('restores SQLite, encrypted secrets, sounds, config links, audit and revisions with checksums', async () => {
    const source = root();
    const database = new PbxDatabase(path.join(source, 'data'), key);
    const current = database.currentTopology();
    const changed = structuredClone(current.topology);
    changed.name = 'Backed up revision';
    database.saveTopology(changed, current.revision, { id: 'editor', username: 'editor', role: 'editor' }, 'backup evidence');
    const sounds = path.join(source, 'sounds');
    fs.mkdirSync(sounds);
    fs.writeFileSync(path.join(sounds, 'synthetic.wav'), Buffer.from('synthetic-audio-placeholder'));
    const generated = path.join(source, 'generated');
    fs.mkdirSync(path.join(generated, 'versions', 'good'), { recursive: true });
    fs.writeFileSync(path.join(generated, 'versions', 'good', 'extensions_generated.conf'), '[internal]\n');
    fs.symlinkSync('versions/good', path.join(generated, 'current'), 'dir');
    fs.symlinkSync('versions/good', path.join(generated, 'last-good'), 'dir');
    const archive = path.join(source, 'backup.tar.gz');
    const manifest = await createBackup({ database, soundsDir: sounds, configDir: generated, outputPath: archive });
    assert.equal(manifest.masterKeyIncluded, false);
    assert.ok(manifest.entries.some((entry) => entry.path === 'database/essentials-calls.sqlite3'));
    assert.ok(!manifest.entries.some((entry) => /key/i.test(entry.path)));
    database.close();

    const target = root();
    const targetData = path.join(target, 'data');
    const targetSounds = path.join(target, 'sounds');
    const targetGenerated = path.join(target, 'generated');
    await restoreBackup({ archivePath: archive, dataDir: targetData, soundsDir: targetSounds, configDir: targetGenerated, cipher: key });
    const restored = new PbxDatabase(targetData, key);
    assert.equal(restored.currentTopology().topology.name, 'Backed up revision');
    assert.equal(restored.materializedTopology().nodes.find((node) => node.id === 'ext-101')?.type === 'extension' &&
      restored.materializedTopology().nodes.find((node) => node.id === 'ext-101')!.properties.sipPassword, 'synthetic-alice-101');
    assert.ok(restored.listRevisions().length >= 2);
    assert.ok(restored.listAudit().some((entry) => entry.action === 'backup.restore'));
    assert.equal(fs.readFileSync(path.join(targetSounds, 'synthetic.wav'), 'utf8'), 'synthetic-audio-placeholder');
    assert.equal(fs.readlinkSync(path.join(targetGenerated, 'current')), 'versions/good');
    restored.close();
  });

  test('fails closed with a wrong key or non-empty target', async () => {
    const source = root();
    const database = new PbxDatabase(path.join(source, 'data'), key);
    const archive = path.join(source, 'backup.tar.gz');
    await createBackup({ database, soundsDir: path.join(source, 'sounds'), configDir: path.join(source, 'generated'), outputPath: archive });
    database.close();

    const wrongTarget = root();
    await assert.rejects(
      restoreBackup({
        archivePath: archive,
        dataDir: path.join(wrongTarget, 'data'),
        soundsDir: path.join(wrongTarget, 'sounds'),
        configDir: path.join(wrongTarget, 'generated'),
        cipher: SecretCipher.fromEncoded(Buffer.alloc(32, 12).toString('base64')),
      }),
      SecretDecryptionError
    );
    assert.equal(fs.existsSync(path.join(wrongTarget, 'data', 'essentials-calls.sqlite3')), false);

    const nonEmpty = root();
    fs.mkdirSync(path.join(nonEmpty, 'data'));
    fs.writeFileSync(path.join(nonEmpty, 'data', 'existing'), 'keep');
    await assert.rejects(
      restoreBackup({
        archivePath: archive,
        dataDir: path.join(nonEmpty, 'data'),
        soundsDir: path.join(nonEmpty, 'sounds'),
        configDir: path.join(nonEmpty, 'generated'),
        cipher: key,
      }),
      /muss.*leer/
    );
    assert.equal(fs.readFileSync(path.join(nonEmpty, 'data', 'existing'), 'utf8'), 'keep');
  });

  test('detects archive corruption before touching targets', async () => {
    const source = root();
    const database = new PbxDatabase(path.join(source, 'data'), key);
    const archive = path.join(source, 'backup.tar.gz');
    await createBackup({ database, soundsDir: path.join(source, 'sounds'), configDir: path.join(source, 'generated'), outputPath: archive });
    database.close();
    const bytes = fs.readFileSync(archive);
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    fs.writeFileSync(archive, bytes);
    const target = root();
    await assert.rejects(
      restoreBackup({
        archivePath: archive,
        dataDir: path.join(target, 'data'),
        soundsDir: path.join(target, 'sounds'),
        configDir: path.join(target, 'generated'),
        cipher: key,
      })
    );
    assert.equal(fs.existsSync(path.join(target, 'data', 'essentials-calls.sqlite3')), false);
  });
});
