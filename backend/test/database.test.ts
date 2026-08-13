import { strict as assert } from 'node:assert';
import { afterEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fixtures, redactTopology } from '@visual-pbx/shared';
import { PbxDatabase, PlaintextSecretError, RevisionConflictError } from '../src/model/database';
import { SecretCipher, SecretDecryptionError } from '../src/security/crypto';

const directories: string[] = [];
const cipher = (byte = 7) => SecretCipher.fromEncoded(Buffer.alloc(32, byte).toString('base64'));

function tempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-db-'));
  directories.push(dir);
  return dir;
}

afterEach(() => {
  for (const directory of directories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('SQLite topology migration and revisions', () => {
  test('backs up a legacy topology unchanged and removes plaintext secrets from revisions', () => {
    const dir = tempDir();
    const legacy = fixtures.topology({ nodes: [fixtures.extension('ext-a', '101', { sipPassword: 'synthetic-legacy-secret' })] });
    const raw = `${JSON.stringify(legacy, null, 2)}\n`;
    fs.writeFileSync(path.join(dir, 'topology.json'), raw);
    const database = new PbxDatabase(dir, cipher());
    const backup = path.join(dir, 'topology.json.pre-sqlite-migration');
    assert.equal(fs.readFileSync(backup, 'utf8'), raw);
    assert.equal(fs.statSync(backup).mode & 0o777, 0o600);
    assert.equal(fs.existsSync(path.join(dir, 'topology.json')), false, 'plaintext migration source must be removed after commit');
    assert.equal(fs.statSync(database.databasePath).mode & 0o777, 0o600);
    const row = database.db.prepare('SELECT topology_json FROM topology_revisions').get() as { topology_json: string };
    assert.ok(!row.topology_json.includes('synthetic-legacy-secret'));
    assert.equal(database.currentTopology().topology.nodes[0].type, 'extension');
    assert.equal(database.materializedTopology().nodes[0].type === 'extension' && database.materializedTopology().nodes[0].properties.sipPassword, 'synthetic-legacy-secret');
    database.close();
  });

  test('preserves encrypted secrets through masked saves and rejects last-write-wins', () => {
    const database = new PbxDatabase(tempDir(), cipher());
    const initial = database.currentTopology();
    const masked = redactTopology(initial.topology);
    masked.name = 'Edited safely';
    const saved = database.saveTopology(masked, initial.revision, { id: 'u1', username: 'editor', role: 'editor' });
    assert.equal(database.materializedTopology().nodes.find((node) => node.id === 'ext-101')?.type === 'extension' &&
      database.materializedTopology().nodes.find((node) => node.id === 'ext-101')!.properties.sipPassword, 'synthetic-alice-101');
    assert.throws(
      () => database.saveTopology(masked, initial.revision, { id: 'u2', username: 'parallel', role: 'editor' }),
      RevisionConflictError
    );
    assert.equal(saved.revision, initial.revision + 1);
    database.close();
  });

  test('rejects plaintext in normal saves but migrates explicit legacy imports atomically', () => {
    const database = new PbxDatabase(tempDir(), cipher());
    const initial = database.currentTopology();
    const imported = fixtures.topology({ nodes: [fixtures.extension('legacy', '333', { sipPassword: 'synthetic-import-333' })] });
    assert.throws(
      () => database.saveTopology(imported, initial.revision, { id: 'admin', username: 'admin', role: 'admin' }),
      PlaintextSecretError
    );
    assert.equal(database.currentTopology().revision, initial.revision, 'failed write must not create a partial revision');
    const saved = database.saveTopology(imported, initial.revision, { id: 'admin', username: 'admin', role: 'admin' }, 'legacy', 'import', true);
    assert.equal(saved.topology.nodes[0].type === 'extension' && saved.topology.nodes[0].properties.sipPassword, undefined);
    assert.equal(database.materializedTopology().nodes[0].type === 'extension' && database.materializedTopology().nodes[0].properties.sipPassword, 'synthetic-import-333');
    database.close();
  });

  test('rolls an old immutable revision forward as a new revision', () => {
    const database = new PbxDatabase(tempDir(), cipher());
    const first = database.currentTopology();
    const secondTopology = structuredClone(first.topology);
    secondTopology.name = 'Second';
    const second = database.saveTopology(secondTopology, first.revision, { id: 'editor', username: 'editor', role: 'editor' });
    const rolled = database.rollbackTopology(first.revision, second.revision, { id: 'admin', username: 'admin', role: 'admin' });
    assert.ok(rolled.revision > second.revision);
    assert.equal(rolled.topology.name, first.topology.name);
    assert.equal(database.revisionTopology(second.revision).name, 'Second');
    database.close();
  });

  test('lists and deliberately replaces every sound reference in a new revision', () => {
    const database = new PbxDatabase(tempDir(), cipher());
    const initial = database.currentTopology();
    const topology = structuredClone(initial.topology);
    const ivr = topology.nodes.find((node) => node.type === 'ivr');
    assert.ok(ivr && ivr.type === 'ivr');
    ivr.properties.greeting = 'custom/synthetic-prompt';
    const saved = database.saveTopology(topology, initial.revision, { id: 'editor', username: 'editor', role: 'editor' });
    assert.deepEqual(database.soundReferences('custom/synthetic-prompt').map((reference) => reference.nodeId), ['ivr-welcome']);
    const replaced = database.replaceSoundReference('custom/synthetic-prompt', 'hello-world', saved.revision, {
      id: 'editor', username: 'editor', role: 'editor',
    });
    assert.ok(replaced.revision > saved.revision);
    assert.deepEqual(database.soundReferences('custom/synthetic-prompt'), []);
    database.close();
  });

  test('prunes old revisions and their deployment rows while retaining the active revision', () => {
    const database = new PbxDatabase(tempDir(), cipher(), { revisionLimit: 3 });
    const actor = { id: 'admin', username: 'admin', role: 'admin' as const };
    const initial = database.currentTopology();
    database.markDeploymentActive(initial.revision);
    let current = database.saveTopology({ ...initial.topology, name: 'Revision 2' }, initial.revision, actor);
    database.createDeployment('synthetic-old-deployment', current.revision, actor);
    database.finishDeployment('synthetic-old-deployment', 'success', 'synthetic-checksum', {});
    for (let index = 3; index <= 5; index++) {
      current = database.saveTopology({ ...current.topology, name: `Revision ${index}` }, current.revision, actor);
    }
    const revisions = database.listRevisions(20).map((revision) => revision.revision);
    assert.ok(revisions.includes(initial.revision), 'the active revision must be retained');
    assert.ok(revisions.includes(current.revision), 'the current revision must be retained');
    assert.equal(revisions.length, 4, 'retention limit plus one protected old active revision');
    assert.equal(
      database.db.prepare('SELECT id FROM deployments WHERE id=?').get('synthetic-old-deployment'),
      undefined,
      'deployment history must be removed before its pruned revision'
    );
    database.close();
  });
});

describe('AEAD secret integrity and rotation', () => {
  test('detects ciphertext manipulation', () => {
    const database = new PbxDatabase(tempDir(), cipher());
    database.db.prepare("UPDATE sip_secrets SET ciphertext='AAAA' WHERE node_id='ext-101'").run();
    assert.throws(() => database.materializedTopology(), SecretDecryptionError);
    database.close();
  });

  test('rejects a wrong key and supports atomic key rotation', () => {
    const dir = tempDir();
    const original = cipher(4);
    const replacement = cipher(9);
    let database = new PbxDatabase(dir, original);
    const count = database.rotateSecrets(original, replacement, { id: null, username: 'test-rotation' });
    assert.equal(count, 2);
    assert.equal(database.materializedTopology().nodes.find((node) => node.id === 'ext-101')?.type === 'extension' &&
      database.materializedTopology().nodes.find((node) => node.id === 'ext-101')!.properties.sipPassword, 'synthetic-alice-101');
    database.close();

    database = new PbxDatabase(dir, original);
    assert.throws(() => database.materializedTopology(), SecretDecryptionError);
    database.close();

    database = new PbxDatabase(dir, replacement);
    assert.doesNotThrow(() => database.materializedTopology());
    database.close();
  });
});
