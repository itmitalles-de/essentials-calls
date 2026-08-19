import assert from 'node:assert';
import fs from 'node:fs';
import { getDatabase } from '../model/store';
import { loadSecretCipher } from '../security/crypto';

function containsRuntimeState(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsRuntimeState);
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value as Record<string, unknown>).some(
    ([key, child]) => /^(ami|availability|activity|connection|runtimeStatus|nodeStatus)$/i.test(key) || containsRuntimeState(child)
  );
}

try {
  const expectRotation = process.argv.includes('--expect-rotation');
  const database = getDatabase();
  const cipher = loadSecretCipher();
  const current = database.currentTopology();
  const materialized = database.materializedTopology();
  const users = database.listUsers();
  const revisions = database.listRevisions(500);
  const audit = database.listAudit(500);
  const secretRows = database.db
    .prepare('SELECT node_id, ciphertext, iv, tag, key_id FROM sip_secrets ORDER BY node_id')
    .all() as Array<{ node_id: string; ciphertext: string; iv: string; tag: string; key_id: string }>;
  const sessionCount = Number(
    (database.db.prepare('SELECT COUNT(*) AS count FROM sessions').get() as { count: number }).count
  );
  const tableNames = (database.db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
    .all() as Array<{ name: string }>).map((row) => row.name);

  assert.equal(sessionCount, 0, 'restored sessions must be invalidated before startup');
  assert.ok(current.activeRevision !== null && current.lastGoodRevision !== null, 'active/last-good deployment state is missing');
  assert.ok(revisions.some((entry) => entry.revision === current.revision), 'current revision is missing from immutable history');
  assert.ok(revisions.some((entry) => entry.revision === current.activeRevision && entry.active), 'active revision is not marked active');
  assert.deepEqual(new Set(users.map((user) => user.role)), new Set(['admin', 'editor', 'viewer']));
  assert.ok(secretRows.length > 0, 'no encrypted SIP credentials were restored');
  assert.ok(secretRows.every((row) => row.key_id === cipher.id && row.ciphertext && row.iv && row.tag), 'credential key IDs or AEAD fields are inconsistent');

  const plaintexts = materialized.nodes.flatMap((node) =>
    node.type === 'extension' && node.properties.sipPassword ? [node.properties.sipPassword] : []
  );
  assert.equal(plaintexts.length, secretRows.length, 'not every encrypted credential can be materialized');
  const storedSecrets = JSON.stringify(secretRows);
  const auditText = JSON.stringify(audit);
  for (const plaintext of plaintexts) {
    assert.ok(!storedSecrets.includes(plaintext), 'plaintext SIP credential found in encrypted rows');
    assert.ok(!auditText.includes(plaintext), 'plaintext SIP credential found in audit history');
  }

  assert.ok(audit.some((entry) => entry.action === 'backup.restore'), 'restore audit event is missing');
  if (expectRotation) {
    assert.ok(audit.some((entry) => entry.action === 'secret.rotate-master-key'), 'rotation audit event is missing');
  }
  for (const encodedKey of [process.env.PBX_MASTER_KEY, process.env.PBX_NEW_MASTER_KEY].filter(Boolean) as string[]) {
    assert.ok(!auditText.includes(encodedKey), 'raw master-key material found in audit history');
  }

  assert.equal(containsRuntimeState(current.topology), false, 'ephemeral AMI/runtime state leaked into topology persistence');
  assert.equal(tableNames.some((name) => /^(ami|runtime|node_status)/i.test(name)), false, 'ephemeral AMI/runtime table was persisted');
  assert.equal(fs.statSync(database.dataDir).mode & 0o777, 0o700, 'restored data directory mode must be 0700');
  assert.equal(fs.statSync(database.databasePath).mode & 0o777, 0o600, 'restored database mode must be 0600');

  console.log(
    `Recovery state verified: ${users.length} users, ${revisions.length} revisions, ${secretRows.length} encrypted credentials, key ID ${cipher.id}.`
  );
  database.close();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
