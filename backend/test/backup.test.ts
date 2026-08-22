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

function syntheticWav(): Buffer {
  const samples = 80;
  const output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + samples * 2, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(8000, 24);
  output.writeUInt32LE(16000, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(samples * 2, 40);
  return output;
}

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
    const saved = database.saveTopology(changed, current.revision, { id: 'editor', username: 'editor', role: 'editor' }, 'backup evidence');
    database.markDeploymentActive(saved.revision);
    const systemActor = { id: null, username: 'backup-test' };
    const admin = database.createUser('recovery-admin', 'synthetic-hash', 'admin', systemActor);
    database.createUser('recovery-editor', 'synthetic-hash', 'editor', systemActor);
    database.createUser('recovery-viewer', 'synthetic-hash', 'viewer', systemActor);
    database.createSession(admin.id, 'synthetic-session-hash', 'synthetic-csrf', Date.now(), Date.now() + 60_000);
    const sounds = path.join(source, 'sounds');
    fs.mkdirSync(sounds, { mode: 0o750 });
    fs.writeFileSync(path.join(sounds, 'synthetic.wav'), syntheticWav(), { mode: 0o640 });
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
    const readerGid = process.getgid?.();
    await restoreBackup({
      archivePath: archive,
      dataDir: targetData,
      soundsDir: targetSounds,
      configDir: targetGenerated,
      cipher: key,
      soundsReaderGid: readerGid,
    });
    // These modes must be established by restore itself, before constructing a
    // PbxDatabase can normalize them as a startup side effect.
    assert.equal(fs.statSync(targetData).mode & 0o777, 0o700);
    assert.equal(fs.statSync(path.join(targetData, 'essentials-calls.sqlite3')).mode & 0o777, 0o600);
    assert.equal(fs.statSync(targetSounds).mode & 0o777, 0o750);
    assert.equal(fs.statSync(path.join(targetSounds, 'synthetic.wav')).mode & 0o777, 0o640);
    if (readerGid !== undefined) {
      assert.equal(fs.statSync(targetSounds).gid, readerGid);
      assert.equal(fs.statSync(path.join(targetSounds, 'synthetic.wav')).gid, readerGid);
    }
    const restored = new PbxDatabase(targetData, key);
    assert.equal(restored.currentTopology().topology.name, 'Backed up revision');
    assert.equal(restored.currentTopology().activeRevision, saved.revision);
    assert.equal(restored.currentTopology().lastGoodRevision, saved.revision);
    assert.equal(restored.materializedTopology().nodes.find((node) => node.id === 'ext-101')?.type === 'extension' &&
      restored.materializedTopology().nodes.find((node) => node.id === 'ext-101')!.properties.sipPassword, 'synthetic-alice-101');
    assert.ok(restored.listRevisions().length >= 2);
    assert.ok(restored.listAudit().some((entry) => entry.action === 'backup.restore'));
    assert.deepEqual(new Set(restored.listUsers().map((user) => user.role)), new Set(['admin', 'editor', 'viewer']));
    assert.equal((restored.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count, 0);
    assert.equal(fs.readFileSync(path.join(targetSounds, 'synthetic.wav')).subarray(0, 4).toString('ascii'), 'RIFF');
    assert.equal(fs.readlinkSync(path.join(targetGenerated, 'current')), 'versions/good');
    const tableNames = (restored.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>).map((row) => row.name);
    assert.equal(tableNames.some((name) => /^(ami|runtime|node_status)/i.test(name)), false);
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

  test('validates permissions before target writes and rolls back a failed population', async () => {
    const source = root();
    const database = new PbxDatabase(path.join(source, 'data'), key);
    const sounds = path.join(source, 'sounds');
    fs.mkdirSync(sounds);
    fs.writeFileSync(path.join(sounds, 'synthetic.wav'), syntheticWav());
    const archive = path.join(source, 'backup.tar.gz');
    await createBackup({ database, soundsDir: sounds, configDir: path.join(source, 'generated'), outputPath: archive });
    database.close();

    const invalidPermissions = root();
    await assert.rejects(
      restoreBackup({
        archivePath: archive,
        dataDir: path.join(invalidPermissions, 'data'),
        soundsDir: path.join(invalidPermissions, 'sounds'),
        configDir: path.join(invalidPermissions, 'generated'),
        cipher: key,
        soundsReaderGid: -1,
      }),
      /SOUNDS_READER_GID/
    );
    assert.deepEqual(fs.readdirSync(invalidPermissions), []);

    const failedPopulation = root();
    const targetData = path.join(failedPopulation, 'data');
    fs.mkdirSync(targetData, { mode: 0o711 });
    fs.chmodSync(targetData, 0o711);
    const blockedParent = path.join(failedPopulation, 'not-a-directory');
    fs.writeFileSync(blockedParent, 'keep');
    await assert.rejects(
      restoreBackup({
        archivePath: archive,
        dataDir: targetData,
        soundsDir: path.join(blockedParent, 'sounds'),
        configDir: path.join(failedPopulation, 'generated'),
        cipher: key,
      })
    );
    assert.deepEqual(fs.readdirSync(targetData), []);
    assert.equal(fs.statSync(targetData).mode & 0o777, 0o711);
    assert.equal(fs.readFileSync(blockedParent, 'utf8'), 'keep');
    assert.equal(fs.existsSync(path.join(failedPopulation, 'generated')), false);
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

  test('rehearses A to C rotation, wrong-key failure and a new empty restore', async () => {
    const encodedA = Buffer.alloc(32, 21).toString('base64');
    const encodedB = Buffer.alloc(32, 22).toString('base64');
    const encodedC = Buffer.alloc(32, 23).toString('base64');
    const cipherA = SecretCipher.fromEncoded(encodedA);
    const cipherB = SecretCipher.fromEncoded(encodedB);
    const cipherC = SecretCipher.fromEncoded(encodedC);
    const source = root();
    const database = new PbxDatabase(path.join(source, 'data'), cipherA);
    const backupA = path.join(source, 'backup-a.tar.gz');
    await createBackup({ database, soundsDir: path.join(source, 'sounds'), configDir: path.join(source, 'generated'), outputPath: backupA });

    const wrongB = root();
    await assert.rejects(
      restoreBackup({
        archivePath: backupA,
        dataDir: path.join(wrongB, 'data'),
        soundsDir: path.join(wrongB, 'sounds'),
        configDir: path.join(wrongB, 'generated'),
        cipher: cipherB,
      }),
      SecretDecryptionError
    );
    assert.equal(fs.existsSync(path.join(wrongB, 'data', 'essentials-calls.sqlite3')), false);

    const restoredA = root();
    await restoreBackup({
      archivePath: backupA,
      dataDir: path.join(restoredA, 'data'),
      soundsDir: path.join(restoredA, 'sounds'),
      configDir: path.join(restoredA, 'generated'),
      cipher: cipherA,
    });
    const readableA = new PbxDatabase(path.join(restoredA, 'data'), cipherA);
    assert.doesNotThrow(() => readableA.materializedTopology());
    readableA.close();

    const rotated = database.rotateSecrets(cipherA, cipherC, { id: null, username: 'rotation-rehearsal' });
    assert.ok(rotated > 0);
    assert.doesNotThrow(() => database.materializedTopology());
    const rotationAudit = database.listAudit().find((entry) => entry.action === 'secret.rotate-master-key');
    assert.ok(rotationAudit);
    const auditText = JSON.stringify(rotationAudit);
    assert.ok(!auditText.includes(encodedA) && !auditText.includes(encodedC));

    const backupC = path.join(source, 'backup-c.tar.gz');
    const manifestC = await createBackup({
      database,
      soundsDir: path.join(source, 'sounds'),
      configDir: path.join(source, 'generated'),
      outputPath: backupC,
    });
    assert.deepEqual(manifestC.secretKeyIds, [cipherC.id]);
    database.close();

    const oldA = root();
    await assert.rejects(
      restoreBackup({
        archivePath: backupC,
        dataDir: path.join(oldA, 'data'),
        soundsDir: path.join(oldA, 'sounds'),
        configDir: path.join(oldA, 'generated'),
        cipher: cipherA,
      }),
      SecretDecryptionError
    );

    const restoredC = root();
    await restoreBackup({
      archivePath: backupC,
      dataDir: path.join(restoredC, 'data'),
      soundsDir: path.join(restoredC, 'sounds'),
      configDir: path.join(restoredC, 'generated'),
      cipher: cipherC,
    });
    const readableC = new PbxDatabase(path.join(restoredC, 'data'), cipherC);
    assert.doesNotThrow(() => readableC.materializedTopology());
    assert.ok(readableC.listAudit().some((entry) => entry.action === 'secret.rotate-master-key'));
    readableC.close();

    assert.throws(() => {
      const stale = new PbxDatabase(path.join(restoredC, 'data'), cipherA);
      try {
        stale.materializedTopology();
      } finally {
        stale.close();
      }
    }, SecretDecryptionError);
  });
});
