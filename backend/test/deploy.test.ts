import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { AmiClient } from '../src/asterisk/amiClient';
import { deployTopology, stageGeneratedConfigs, validateGeneratedConfigs } from '../src/asterisk/deploy';
import { PbxDatabase } from '../src/model/database';
import { SecretCipher } from '../src/security/crypto';

class FakeAmi {
  reloadCalls = 0;
  failReloadOnce = false;
  endpointCount = 2;
  endpointCounts: number[] = [];
  async runCommand(command: string) {
    if (command === 'core show version') return 'Asterisk 22.10.1';
    if (command === 'dialplan show internal') return "[ Context 'internal' created by generated ]";
    if (command.startsWith('dialplan show ') && command.endsWith('@essentials_deploy_canary')) return command;
    return 'ok';
  }
  async deployReload() {
    this.reloadCalls++;
    if (this.failReloadOnce && this.reloadCalls === 1) throw new Error('synthetic AMI reload failure');
  }
  async getEndpointStatuses() {
    const count = this.endpointCounts.shift() ?? this.endpointCount;
    return Array.from({ length: count }, (_, index) => ({ endpoint: String(101 + index), state: 'Not in use' }));
  }
}

let directory: string;
let database: PbxDatabase;

beforeEach(() => {
  process.env.PBX_ENV = 'test';
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-deploy-'));
  process.env.CONFIG_OUT_DIR = path.join(directory, 'generated');
  database = new PbxDatabase(path.join(directory, 'data'), SecretCipher.fromEncoded(Buffer.alloc(32, 5).toString('base64')));
});

afterEach(() => {
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.CONFIG_OUT_DIR;
  delete process.env.PBX_TEST_FAIL_WRITE;
  delete process.env.PBX_TEST_CORRUPT_AFTER_PREFLIGHT;
  delete process.env.CONFIG_READER_GID;
});

describe('atomic deploy and rollback', () => {
  test('stages, atomically activates, reloads and records last known good', async () => {
    const current = database.currentTopology();
    const result = await deployTopology(
      database.materializedTopology(), current.revision, { id: 'admin', username: 'admin', role: 'admin' }, database,
      { getAmi: async () => new FakeAmi() as unknown as AmiClient }
    );
    assert.equal(result.deployed, true);
    assert.equal(result.runtimeHealthy, true);
    assert.ok(fs.lstatSync(path.join(process.env.CONFIG_OUT_DIR!, 'current')).isSymbolicLink());
    assert.ok(fs.lstatSync(path.join(process.env.CONFIG_OUT_DIR!, 'last-good')).isSymbolicLink());
    const generated = path.join(
      process.env.CONFIG_OUT_DIR!,
      fs.readlinkSync(path.join(process.env.CONFIG_OUT_DIR!, 'current')),
      'pjsip_generated.conf'
    );
    assert.equal(fs.statSync(generated).mode & 0o777, 0o640);
    assert.equal(database.currentTopology().activeRevision, current.revision);
  });

  test('restores the previous symlink and reloads after an activation failure', async () => {
    const first = database.currentTopology();
    await deployTopology(database.materializedTopology(), first.revision, { id: 'admin', username: 'admin', role: 'admin' }, database, {
      getAmi: async () => new FakeAmi() as unknown as AmiClient,
    });
    const previousTarget = fs.readlinkSync(path.join(process.env.CONFIG_OUT_DIR!, 'current'));
    const changed = structuredClone(first.topology);
    changed.name = 'Changed draft';
    const saved = database.saveTopology(changed, first.revision, { id: 'editor', username: 'editor', role: 'editor' });
    const ami = new FakeAmi();
    ami.failReloadOnce = true;
    const result = await deployTopology(database.materializedTopology(saved.revision), saved.revision, { id: 'admin', username: 'admin', role: 'admin' }, database, {
      getAmi: async () => ami as unknown as AmiClient,
    });
    assert.equal(result.deployed, false);
    assert.equal(result.rolledBack, true);
    assert.equal(fs.readlinkSync(path.join(process.env.CONFIG_OUT_DIR!, 'current')), previousTarget);
    assert.equal(database.currentTopology().activeRevision, first.revision);
  });

  test('rolls back when reload succeeds but the runtime loses expected endpoints', async () => {
    const first = database.currentTopology();
    await deployTopology(database.materializedTopology(), first.revision, { id: 'admin', username: 'admin', role: 'admin' }, database, {
      getAmi: async () => new FakeAmi() as unknown as AmiClient,
    });
    const previousTarget = fs.readlinkSync(path.join(process.env.CONFIG_OUT_DIR!, 'current'));
    const changed = structuredClone(first.topology);
    changed.name = 'Runtime-degraded draft';
    const saved = database.saveTopology(changed, first.revision, { id: 'editor', username: 'editor', role: 'editor' });
    const ami = new FakeAmi();
    ami.endpointCounts = [0, 2];
    const result = await deployTopology(database.materializedTopology(saved.revision), saved.revision, { id: 'admin', username: 'admin', role: 'admin' }, database, {
      getAmi: async () => ami as unknown as AmiClient,
    });
    assert.equal(result.deployed, false);
    assert.equal(result.reloaded, true);
    assert.equal(result.runtimeHealthy, false);
    assert.equal(result.rolledBack, true);
    assert.equal(fs.readlinkSync(path.join(process.env.CONFIG_OUT_DIR!, 'current')), previousTarget);
    assert.equal(database.currentTopology().activeRevision, first.revision);
  });

  test('does not alter active config when writing or AMI preflight fails', async () => {
    const current = database.currentTopology();
    process.env.PBX_TEST_FAIL_WRITE = 'true';
    const writeFailure = await deployTopology(database.materializedTopology(), current.revision, { id: 'admin', username: 'admin' }, database, {
      getAmi: async () => new FakeAmi() as unknown as AmiClient,
    });
    assert.equal(writeFailure.configsWritten, false);
    assert.equal(writeFailure.activated, false);
    delete process.env.PBX_TEST_FAIL_WRITE;

    const amiFailure = await deployTopology(database.materializedTopology(), current.revision, { id: 'admin', username: 'admin' }, database, {
      getAmi: async () => { throw new Error('synthetic AMI unavailable'); },
    });
    assert.equal(amiFailure.configsWritten, true);
    assert.equal(amiFailure.activated, false);
    assert.equal(fs.existsSync(path.join(process.env.CONFIG_OUT_DIR!, 'current')), false);
  });

  test('preflight rejects unsafe generated content', () => {
    assert.throws(() => validateGeneratedConfigs({
      pjsip: '; AUTO-GENERATED by Essentials+ Calls\n#include /etc/passwd',
      extensions: '; AUTO-GENERATED by Essentials+ Calls\n[internal]\n[callflow]',
      queues: '; AUTO-GENERATED by Essentials+ Calls',
      voicemail: '; AUTO-GENERATED by Essentials+ Calls',
    }), /unerlaubte/);
  });

  test('leaves no partial staging directory when generation fails', () => {
    const topology = database.currentTopology().topology;
    assert.throws(() => stageGeneratedConfigs(topology), /SIP-Secret/);
    const versions = path.join(process.env.CONFIG_OUT_DIR!, 'versions');
    assert.equal(fs.existsSync(versions) ? fs.readdirSync(versions).some((name) => name.startsWith('.staging-')) : false, false);
  });
});
