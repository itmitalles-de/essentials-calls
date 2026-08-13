import { strict as assert } from 'node:assert';
import { describe, test } from 'node:test';
import { createTopologyExport, hasPlaintextSipSecrets, migrateTopologyDocument, redactTopology } from '../src/topologyFormat';
import { extension, topology } from '../src/testFixtures';

describe('versioned topology import/export', () => {
  test('exports schema v2 with redacted SIP credentials', () => {
    const source = topology({ nodes: [extension('ext', '101', { sipPassword: 'synthetic-export-secret' })] });
    const exported = createTopologyExport(source, new Date('2026-08-13T00:00:00Z'));
    assert.equal(exported.schemaVersion, 2);
    assert.equal(exported.product, 'Essentials+ Calls');
    assert.ok(!JSON.stringify(exported).includes('synthetic-export-secret'));
    assert.equal(exported.topology.nodes[0].type === 'extension' && exported.topology.nodes[0].properties.sipSecret?.configured, true);
  });

  test('migrates raw and enveloped v1 documents', () => {
    const source = topology({ nodes: [extension('ext', '101')] });
    assert.deepEqual(migrateTopologyDocument(source), { topology: source, sourceSchemaVersion: 1, migrated: true });
    assert.deepEqual(migrateTopologyDocument({ schemaVersion: 1, topology: source }), {
      topology: source,
      sourceSchemaVersion: 1,
      migrated: true,
    });
  });

  test('rejects corrupt and incompatible documents without mutation', () => {
    assert.throws(() => migrateTopologyDocument(null), /JSON-Objekt/);
    assert.throws(() => migrateTopologyDocument({ schemaVersion: 999, topology: {} }), /Nicht unterstützte/);
    assert.throws(() => migrateTopologyDocument({ schemaVersion: 2 }), /keine Topologie/);
  });

  test('does not mutate the source while redacting', () => {
    const source = topology({ nodes: [extension('ext', '101', { sipPassword: 'synthetic-source' })] });
    const redacted = redactTopology(source);
    assert.equal(source.nodes[0].type === 'extension' && source.nodes[0].properties.sipPassword, 'synthetic-source');
    assert.equal(redacted.nodes[0].type === 'extension' && redacted.nodes[0].properties.sipPassword, undefined);
  });

  test('detects a plaintext credential even when its value is empty', () => {
    const withSecret = topology({ nodes: [extension('ext', '101', { sipPassword: '' })] });
    const redacted = redactTopology(withSecret);
    assert.equal(hasPlaintextSipSecrets(withSecret), true);
    assert.equal(hasPlaintextSipSecrets(redacted), false);
  });
});
