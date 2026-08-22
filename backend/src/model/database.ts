import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { ExtensionNode, PbxNode, Topology, redactTopology } from '@visual-pbx/shared';
import { EncryptedValue, SecretCipher, SecretDecryptionError } from '../security/crypto';

export type Role = 'viewer' | 'editor' | 'admin';

export interface Actor {
  id: string | null;
  username: string;
  role?: Role;
}

export interface StoredTopology {
  topology: Topology;
  revision: number;
  activeRevision: number | null;
  lastGoodRevision: number | null;
}

export interface RevisionInfo {
  revision: number;
  actor: string;
  comment: string;
  summary: string;
  source: string;
  createdAt: string;
  active: boolean;
}

export interface UserRecord {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  csrfToken: string;
  expiresAt: number;
  user: Omit<UserRecord, 'passwordHash'>;
}

export interface AuditRecord {
  id: number;
  timestamp: string;
  actor: string;
  action: string;
  target: string;
  outcome: string;
  details: Record<string, unknown>;
}

export class RevisionConflictError extends Error {
  constructor(readonly expected: number, readonly current: number) {
    super(`Versionskonflikt: erwartet ${expected}, aktuell ${current}.`);
  }
}

export class PlaintextSecretError extends Error {}
export class UserSafetyError extends Error {}

const SEED_TOPOLOGY: Topology = {
  id: 'topo-1',
  name: 'Kleine Büroanlage',
  description: 'Synthetische Beispiel-Topologie für Simple Calls',
  nodes: [
    {
      id: 'ext-101',
      type: 'extension',
      label: 'Alice (synthetisch)',
      position: { x: 100, y: 200 },
      properties: {
        number: '101',
        sipUser: '101',
        sipPassword: 'synthetic-alice-101',
        voicemail: { enabled: true, mailbox: '101', pin: '1234' },
      },
    },
    {
      id: 'ext-102',
      type: 'extension',
      label: 'Bob (synthetisch)',
      position: { x: 300, y: 200 },
      properties: {
        number: '102',
        sipUser: '102',
        sipPassword: 'synthetic-bob-102',
        voicemail: { enabled: false, mailbox: '102' },
      },
    },
    {
      id: 'group-support',
      type: 'ringgroup',
      label: 'Support',
      position: { x: 200, y: 400 },
      properties: { strategy: 'ringall', ringTimeout: 10 },
    },
    {
      id: 'ivr-welcome',
      type: 'ivr',
      label: 'Willkommens-IVR',
      position: { x: 200, y: 100 },
      properties: { greeting: 'hello-world', timeout: 5, invalidRetries: 2 },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'ivr-welcome', target: 'ext-101', condition: { type: 'digit', value: '1' } },
    { id: 'edge-2', source: 'ivr-welcome', target: 'group-support', condition: { type: 'digit', value: '2' } },
    { id: 'edge-3', source: 'ivr-welcome', target: 'ext-102', condition: { type: 'timeout' } },
  ],
  memberships: [
    { id: 'mem-1', groupId: 'group-support', memberId: 'ext-101', role: 'member', position: 1 },
    { id: 'mem-2', groupId: 'group-support', memberId: 'ext-102', role: 'member', position: 2 },
  ],
};

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function safeDetails(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(safeDetails);
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (/password|secret|token|ciphertext|authorization|cookie/i.test(key)) {
      output[key] = '[REDACTED]';
    } else {
      output[key] = safeDetails(child);
    }
  }
  return output;
}

function topologySummary(previous: Topology | null, next: Topology): string {
  if (!previous) return `Initial topology: ${next.nodes.length} nodes, ${next.edges.length} edges`;
  const beforeNodes = new Map(previous.nodes.map((node) => [node.id, node]));
  const afterNodes = new Map(next.nodes.map((node) => [node.id, node]));
  const added = [...afterNodes.keys()].filter((id) => !beforeNodes.has(id));
  const removed = [...beforeNodes.keys()].filter((id) => !afterNodes.has(id));
  const changed = [...afterNodes.keys()].filter((id) => {
    const before = beforeNodes.get(id);
    return before && JSON.stringify(before) !== JSON.stringify(afterNodes.get(id));
  });
  return [
    added.length ? `+${added.length} nodes (${added.join(', ')})` : '',
    removed.length ? `-${removed.length} nodes (${removed.join(', ')})` : '',
    changed.length ? `~${changed.length} nodes (${changed.join(', ')})` : '',
    previous.edges.length !== next.edges.length ? `edges ${previous.edges.length}→${next.edges.length}` : '',
    previous.memberships.length !== next.memberships.length
      ? `memberships ${previous.memberships.length}→${next.memberships.length}`
      : '',
  ]
    .filter(Boolean)
    .join('; ') || 'No topology content change';
}

function encryptedRow(row: Record<string, unknown>): EncryptedValue {
  return {
    ciphertext: String(row.ciphertext),
    iv: String(row.iv),
    tag: String(row.tag),
    keyId: String(row.key_id),
  };
}

export class PbxDatabase {
  readonly db: Database.Database;
  readonly dataDir: string;
  readonly databasePath: string;
  private readonly revisionLimit: number;

  constructor(
    dataDir: string,
    private cipher: SecretCipher,
    options: { databasePath?: string; revisionLimit?: number } = {}
  ) {
    this.dataDir = dataDir;
    fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });
    fs.chmodSync(dataDir, 0o700);
    this.databasePath = options.databasePath ?? path.join(dataDir, 'essentials-calls.sqlite3');
    this.revisionLimit = options.revisionLimit ?? 100;
    this.db = new Database(this.databasePath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.db.pragma('busy_timeout = 5000');
    this.createSchema();
    this.initializeTopology();
    for (const candidate of [this.databasePath, `${this.databasePath}-wal`, `${this.databasePath}-shm`]) {
      if (fs.existsSync(candidate)) fs.chmodSync(candidate, 0o600);
    }
  }

  close(): void {
    this.db.close();
  }

  private createSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS metadata (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('viewer','editor','admin')),
        disabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        csrf_token TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS login_attempts (
        attempt_key TEXT PRIMARY KEY,
        window_start INTEGER NOT NULL,
        failures INTEGER NOT NULL,
        blocked_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS topology_revisions (
        revision INTEGER PRIMARY KEY AUTOINCREMENT,
        topology_json TEXT NOT NULL,
        actor_user_id TEXT,
        actor_name TEXT NOT NULL,
        comment TEXT NOT NULL,
        change_summary TEXT NOT NULL,
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS topology_state (
        singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
        current_revision INTEGER NOT NULL REFERENCES topology_revisions(revision),
        active_revision INTEGER REFERENCES topology_revisions(revision),
        last_good_revision INTEGER REFERENCES topology_revisions(revision)
      );
      CREATE TABLE IF NOT EXISTS sip_secrets (
        node_id TEXT PRIMARY KEY,
        ciphertext TEXT NOT NULL,
        iv TEXT NOT NULL,
        tag TEXT NOT NULL,
        key_id TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS deployments (
        id TEXT PRIMARY KEY,
        revision INTEGER NOT NULL REFERENCES topology_revisions(revision),
        actor_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        config_checksum TEXT,
        result TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS audit_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        actor_user_id TEXT,
        actor_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        outcome TEXT NOT NULL,
        details_json TEXT NOT NULL
      );
      INSERT OR IGNORE INTO metadata(key, value) VALUES ('schema_version', '1');
    `);
  }

  private initializeTopology(): void {
    const count = Number((this.db.prepare('SELECT COUNT(*) AS count FROM topology_revisions').get() as { count: number }).count);
    const legacyPath = path.join(this.dataDir, 'topology.json');
    const backupPath = path.join(this.dataDir, 'topology.json.pre-sqlite-migration');
    const migrationRecorded = this.db.prepare("SELECT value FROM metadata WHERE key='legacy_topology_migrated'").get() as
      | { value: string }
      | undefined;
    if (count > 0) {
      if (migrationRecorded?.value === '1') this.removeMigratedLegacySource(legacyPath, backupPath);
      return;
    }

    let topology = clone(SEED_TOPOLOGY);
    let source = 'seed';
    if (fs.existsSync(legacyPath)) {
      const original = fs.readFileSync(legacyPath);
      if (fs.existsSync(backupPath)) {
        if (!original.equals(fs.readFileSync(backupPath))) {
          throw new Error('Die vorhandene topology.json stimmt nicht mit der unveränderten Migrationssicherung überein.');
        }
      } else {
        fs.copyFileSync(legacyPath, backupPath, fs.constants.COPYFILE_EXCL);
      }
      fs.chmodSync(backupPath, 0o600);
      topology = JSON.parse(original.toString('utf8')) as Topology;
      source = 'legacy-migration';
    }
    this.insertInitialTopology(topology, source);
    if (source === 'legacy-migration') this.removeMigratedLegacySource(legacyPath, backupPath);
  }

  private removeMigratedLegacySource(legacyPath: string, backupPath: string): void {
    if (!fs.existsSync(legacyPath)) return;
    if (!fs.existsSync(backupPath)) {
      throw new Error('Die verpflichtende topology.json-Migrationssicherung fehlt; die Klartextquelle wurde nicht entfernt.');
    }
    if (!fs.readFileSync(legacyPath).equals(fs.readFileSync(backupPath))) {
      throw new Error('topology.json wurde nach der Migration verändert; die Klartextquelle wurde nicht automatisch entfernt.');
    }
    fs.chmodSync(backupPath, 0o600);
    fs.unlinkSync(legacyPath);
  }

  private insertInitialTopology(topology: Topology, source: string): void {
    this.db.transaction(() => {
      const sanitized = this.prepareSecrets(topology, true);
      const result = this.db
        .prepare(
          `INSERT INTO topology_revisions
           (topology_json, actor_user_id, actor_name, comment, change_summary, source, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, ?)`
        )
        .run(
          JSON.stringify(sanitized),
          'system',
          source === 'seed' ? 'Initial synthetic topology' : 'One-time topology.json migration',
          topologySummary(null, sanitized),
          source,
          nowIso()
        );
      const revision = Number(result.lastInsertRowid);
      this.db
        .prepare('INSERT INTO topology_state(singleton, current_revision, active_revision, last_good_revision) VALUES (1, ?, NULL, NULL)')
        .run(revision);
      this.auditInternal(
        { id: null, username: 'system' },
        'topology.initialize',
        `revision:${revision}`,
        'success',
        { source }
      );
      if (source === 'legacy-migration') {
        this.db.prepare("INSERT OR REPLACE INTO metadata(key, value) VALUES ('legacy_topology_migrated', '1')").run();
      }
    })();
  }

  private secretRow(nodeId: string): Record<string, unknown> | undefined {
    return this.db.prepare('SELECT * FROM sip_secrets WHERE node_id = ?').get(nodeId) as Record<string, unknown> | undefined;
  }

  private putSecret(nodeId: string, plaintext: string): void {
    const encrypted = this.cipher.encrypt(plaintext, nodeId);
    this.db
      .prepare(
        `INSERT INTO sip_secrets(node_id, ciphertext, iv, tag, key_id, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           ciphertext=excluded.ciphertext, iv=excluded.iv, tag=excluded.tag,
           key_id=excluded.key_id, updated_at=excluded.updated_at`
      )
      .run(nodeId, encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.keyId, nowIso());
  }

  private prepareSecrets(input: Topology, allowPlaintextSecrets: boolean): Topology {
    const topology = clone(input);
    const extensionIds = new Set<string>();
    for (const node of topology.nodes) {
      if (node.type !== 'extension') continue;
      extensionIds.add(node.id);
      const properties = (node as ExtensionNode).properties;
      if (properties.sipPassword !== undefined) {
        if (!allowPlaintextSecrets) {
          throw new PlaintextSecretError(
            'SIP-Secrets dürfen nur über den expliziten Secret-Endpunkt geändert werden.'
          );
        }
        if (properties.sipPassword) this.putSecret(node.id, properties.sipPassword);
        delete properties.sipPassword;
      }
      properties.sipSecret = { configured: !!this.secretRow(node.id) };
    }

    const existing = this.db.prepare('SELECT node_id FROM sip_secrets').all() as Array<{ node_id: string }>;
    const remove = this.db.prepare('DELETE FROM sip_secrets WHERE node_id = ?');
    for (const row of existing) {
      if (!extensionIds.has(row.node_id)) remove.run(row.node_id);
    }
    return redactTopology(topology);
  }

  private state(): { current_revision: number; active_revision: number | null; last_good_revision: number | null } {
    return this.db.prepare('SELECT current_revision, active_revision, last_good_revision FROM topology_state WHERE singleton=1').get() as {
      current_revision: number;
      active_revision: number | null;
      last_good_revision: number | null;
    };
  }

  private topologyAt(revision: number): Topology {
    const row = this.db.prepare('SELECT topology_json FROM topology_revisions WHERE revision=?').get(revision) as
      | { topology_json: string }
      | undefined;
    if (!row) throw new Error(`Topologie-Revision ${revision} existiert nicht.`);
    return JSON.parse(row.topology_json) as Topology;
  }

  currentTopology(): StoredTopology {
    const state = this.state();
    return {
      topology: this.topologyAt(state.current_revision),
      revision: state.current_revision,
      activeRevision: state.active_revision,
      lastGoodRevision: state.last_good_revision,
    };
  }

  materializedTopology(revision?: number): Topology {
    const selected = revision ?? this.state().current_revision;
    const topology = clone(this.topologyAt(selected));
    for (const node of topology.nodes) {
      if (node.type !== 'extension') continue;
      const row = this.secretRow(node.id);
      if (row) {
        node.properties.sipPassword = this.cipher.decrypt(encryptedRow(row), node.id);
        node.properties.sipSecret = { configured: true };
      } else if (node.properties.sipSecret?.configured) {
        throw new SecretDecryptionError(`SIP-Secret für "${node.id}" fehlt in der Secret-Ablage.`);
      }
    }
    return topology;
  }

  saveTopology(
    topology: Topology,
    expectedRevision: number,
    actor: Actor,
    comment = 'Topology saved',
    source = 'editor',
    allowPlaintextSecrets = false
  ): StoredTopology {
    return this.db.transaction(() => {
      const state = this.state();
      if (state.current_revision !== expectedRevision) {
        throw new RevisionConflictError(expectedRevision, state.current_revision);
      }
      const previous = this.topologyAt(state.current_revision);
      const sanitized = this.prepareSecrets(topology, allowPlaintextSecrets);
      const summary = topologySummary(previous, sanitized);
      const result = this.db
        .prepare(
          `INSERT INTO topology_revisions
           (topology_json, actor_user_id, actor_name, comment, change_summary, source, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .run(JSON.stringify(sanitized), actor.id, actor.username, comment.slice(0, 500), summary, source, nowIso());
      const revision = Number(result.lastInsertRowid);
      this.db.prepare('UPDATE topology_state SET current_revision=? WHERE singleton=1').run(revision);
      this.auditInternal(actor, 'topology.save', `revision:${revision}`, 'success', {
        previousRevision: expectedRevision,
        comment,
        summary,
        source,
      });
      this.pruneRevisions();
      return {
        topology: sanitized,
        revision,
        activeRevision: state.active_revision,
        lastGoodRevision: state.last_good_revision,
      };
    })();
  }

  updateSipSecret(nodeId: string, plaintext: string, expectedRevision: number, actor: Actor): StoredTopology {
    if (plaintext.length < 12 || plaintext.length > 256 || !/^[\x21-\x7e]+$/.test(plaintext) || /[;\[\]]/.test(plaintext)) {
      throw new Error('SIP-Secret muss 12–256 druckbare ASCII-Zeichen enthalten und darf keine Semikolons oder Klammern enthalten.');
    }
    return this.db.transaction(() => {
      const current = this.currentTopology();
      if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision);
      const node = current.topology.nodes.find((candidate) => candidate.id === nodeId);
      if (!node || node.type !== 'extension') throw new Error('Extension nicht gefunden.');
      this.putSecret(nodeId, plaintext);
      node.properties.sipSecret = { configured: true };
      const result = this.saveTopology(
        current.topology,
        expectedRevision,
        actor,
        `SIP credential changed for ${nodeId}`,
        'secret-change'
      );
      this.auditInternal(actor, 'secret.change', `extension:${nodeId}`, 'success', { revision: result.revision });
      return result;
    })();
  }

  listRevisions(limit = 50): RevisionInfo[] {
    const state = this.state();
    const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 200) : 50;
    const rows = this.db
      .prepare(
        `SELECT revision, actor_name, comment, change_summary, source, created_at
         FROM topology_revisions ORDER BY revision DESC LIMIT ?`
      )
      .all(boundedLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      revision: Number(row.revision),
      actor: String(row.actor_name),
      comment: String(row.comment),
      summary: String(row.change_summary),
      source: String(row.source),
      createdAt: String(row.created_at),
      active: Number(row.revision) === state.active_revision,
    }));
  }

  revisionTopology(revision: number): Topology {
    return clone(this.topologyAt(revision));
  }

  rollbackTopology(targetRevision: number, expectedRevision: number, actor: Actor, comment?: string): StoredTopology {
    const target = this.topologyAt(targetRevision);
    const result = this.saveTopology(
      target,
      expectedRevision,
      actor,
      comment ?? `Rollback to revision ${targetRevision}`,
      'rollback'
    );
    this.audit(actor, 'topology.rollback', `revision:${targetRevision}`, 'success', { newRevision: result.revision });
    return result;
  }

  soundReferences(reference: string): Array<{ nodeId: string; label: string; field: string }> {
    return this.currentTopology().topology.nodes
      .filter((node) => node.type === 'ivr' && node.properties.greeting === reference)
      .map((node) => ({ nodeId: node.id, label: node.label, field: 'properties.greeting' }));
  }

  replaceSoundReference(
    oldReference: string,
    newReference: string,
    expectedRevision: number,
    actor: Actor
  ): StoredTopology {
    const current = this.currentTopology();
    if (current.revision !== expectedRevision) throw new RevisionConflictError(expectedRevision, current.revision);
    const topology = clone(current.topology);
    for (const node of topology.nodes) {
      if (node.type === 'ivr' && node.properties.greeting === oldReference) node.properties.greeting = newReference;
    }
    return this.saveTopology(
      topology,
      expectedRevision,
      actor,
      `Replace sound ${oldReference} with ${newReference}`,
      'sound-reference-replace'
    );
  }

  private pruneRevisions(): void {
    const state = this.state();
    const keep = new Set([state.current_revision, state.active_revision, state.last_good_revision].filter(Boolean));
    const rows = this.db.prepare('SELECT revision FROM topology_revisions ORDER BY revision DESC').all() as Array<{
      revision: number;
    }>;
    for (const row of rows.slice(this.revisionLimit)) {
      if (!keep.has(row.revision)) {
        this.db.prepare('DELETE FROM deployments WHERE revision=?').run(row.revision);
        this.db.prepare('DELETE FROM topology_revisions WHERE revision=?').run(row.revision);
      }
    }
  }

  markDeploymentActive(revision: number): void {
    this.db
      .prepare('UPDATE topology_state SET active_revision=?, last_good_revision=? WHERE singleton=1')
      .run(revision, revision);
  }

  createDeployment(id: string, revision: number, actor: Actor): void {
    this.db
      .prepare(
        `INSERT INTO deployments(id, revision, actor_name, started_at, result, details_json)
         VALUES (?, ?, ?, ?, 'started', '{}')`
      )
      .run(id, revision, actor.username, nowIso());
  }

  finishDeployment(id: string, result: string, checksum: string | null, details: Record<string, unknown>): void {
    this.db
      .prepare(
        `UPDATE deployments SET finished_at=?, result=?, config_checksum=?, details_json=? WHERE id=?`
      )
      .run(nowIso(), result, checksum, JSON.stringify(safeDetails(details)), id);
  }

  createUser(username: string, passwordHash: string, role: Role, actor: Actor): UserRecord {
    const normalized = username.trim();
    if (!/^[a-zA-Z0-9._@-]{3,64}$/.test(normalized)) throw new Error('Ungültiger Benutzername.');
    const timestamp = nowIso();
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO users(id, username, password_hash, role, disabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`
      )
      .run(id, normalized, passwordHash, role, timestamp, timestamp);
    this.audit(actor, 'user.create', `user:${id}`, 'success', { username: normalized, role });
    return this.userById(id)!;
  }

  countUsers(): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS count FROM users').get() as { count: number }).count);
  }

  listUsers(): Array<Omit<UserRecord, 'passwordHash'>> {
    return (this.db.prepare('SELECT * FROM users ORDER BY username COLLATE NOCASE').all() as Array<Record<string, unknown>>).map(
      (row) => this.mapUser(row, false)
    );
  }

  userByUsername(username: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE username=? COLLATE NOCASE').get(username) as
      | Record<string, unknown>
      | undefined;
    return row ? (this.mapUser(row, true) as UserRecord) : undefined;
  }

  userById(id: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT * FROM users WHERE id=?').get(id) as Record<string, unknown> | undefined;
    return row ? (this.mapUser(row, true) as UserRecord) : undefined;
  }

  private mapUser(row: Record<string, unknown>, withHash: true): UserRecord;
  private mapUser(row: Record<string, unknown>, withHash: false): Omit<UserRecord, 'passwordHash'>;
  private mapUser(row: Record<string, unknown>, withHash: boolean): UserRecord | Omit<UserRecord, 'passwordHash'> {
    const base = {
      id: String(row.id),
      username: String(row.username),
      role: String(row.role) as Role,
      disabled: Boolean(row.disabled),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
    return withHash ? { ...base, passwordHash: String(row.password_hash) } : base;
  }

  updateUser(id: string, patch: { role?: Role; disabled?: boolean; passwordHash?: string }, actor: Actor): UserRecord {
    const current = this.userById(id);
    if (!current) throw new Error('Benutzer nicht gefunden.');
    const role = patch.role ?? current.role;
    const disabled = patch.disabled ?? current.disabled;
    const hash = patch.passwordHash ?? current.passwordHash;
    if (actor.id === id && disabled) throw new UserSafetyError('Die eigene aktive Sitzung kann sich nicht selbst deaktivieren.');
    if (current.role === 'admin' && !current.disabled && (role !== 'admin' || disabled)) {
      const activeAdmins = Number((this.db
        .prepare("SELECT COUNT(*) AS count FROM users WHERE role='admin' AND disabled=0")
        .get() as { count: number }).count);
      if (activeAdmins <= 1) throw new UserSafetyError('Der letzte aktive Administrator kann nicht entfernt oder deaktiviert werden.');
    }
    this.db
      .prepare('UPDATE users SET role=?, disabled=?, password_hash=?, updated_at=? WHERE id=?')
      .run(role, disabled ? 1 : 0, hash, nowIso(), id);
    if (disabled) this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
    this.audit(actor, 'user.update', `user:${id}`, 'success', { role, disabled, passwordChanged: !!patch.passwordHash });
    return this.userById(id)!;
  }

  createSession(userId: string, tokenHash: string, csrfToken: string, createdAt: number, expiresAt: number): void {
    this.db
      .prepare(
        `INSERT INTO sessions(token_hash, user_id, csrf_token, created_at, last_seen_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(tokenHash, userId, csrfToken, createdAt, createdAt, expiresAt);
  }

  session(tokenHash: string, now = Date.now()): SessionRecord | undefined {
    this.db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(now);
    const row = this.db
      .prepare(
        `SELECT s.token_hash, s.csrf_token, s.expires_at, u.*
         FROM sessions s JOIN users u ON u.id=s.user_id
         WHERE s.token_hash=? AND s.expires_at>? AND u.disabled=0`
      )
      .get(tokenHash, now) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    this.db.prepare('UPDATE sessions SET last_seen_at=? WHERE token_hash=?').run(now, tokenHash);
    return {
      tokenHash: String(row.token_hash),
      csrfToken: String(row.csrf_token),
      expiresAt: Number(row.expires_at),
      user: this.mapUser(row, false),
    };
  }

  deleteSession(tokenHash: string): void {
    this.db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
  }

  loginRate(attemptKey: string, now = Date.now()): { blocked: boolean; retryAfterSeconds: number } {
    const row = this.db.prepare('SELECT * FROM login_attempts WHERE attempt_key=?').get(attemptKey) as
      | { blocked_until: number }
      | undefined;
    const blockedUntil = Number(row?.blocked_until ?? 0);
    return { blocked: blockedUntil > now, retryAfterSeconds: Math.max(0, Math.ceil((blockedUntil - now) / 1000)) };
  }

  recordLoginFailure(attemptKey: string, now = Date.now()): void {
    const windowMs = 15 * 60_000;
    const row = this.db.prepare('SELECT * FROM login_attempts WHERE attempt_key=?').get(attemptKey) as
      | { window_start: number; failures: number }
      | undefined;
    const failures = !row || now - row.window_start > windowMs ? 1 : row.failures + 1;
    const windowStart = !row || now - row.window_start > windowMs ? now : row.window_start;
    const blockedUntil = failures >= 5 ? now + windowMs : 0;
    this.db
      .prepare(
        `INSERT INTO login_attempts(attempt_key, window_start, failures, blocked_until)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(attempt_key) DO UPDATE SET
           window_start=excluded.window_start, failures=excluded.failures, blocked_until=excluded.blocked_until`
      )
      .run(attemptKey, windowStart, failures, blockedUntil);
  }

  clearLoginFailures(attemptKey: string): void {
    this.db.prepare('DELETE FROM login_attempts WHERE attempt_key=?').run(attemptKey);
  }

  audit(actor: Actor, action: string, target: string, outcome: string, details: Record<string, unknown> = {}): void {
    this.auditInternal(actor, action, target, outcome, details);
  }

  private auditInternal(actor: Actor, action: string, target: string, outcome: string, details: Record<string, unknown>): void {
    this.db
      .prepare(
        `INSERT INTO audit_events(timestamp, actor_user_id, actor_name, action, target, outcome, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(nowIso(), actor.id, actor.username, action, target, outcome, JSON.stringify(safeDetails(details)));
  }

  listAudit(limit = 100): AuditRecord[] {
    const boundedLimit = Number.isSafeInteger(limit) ? Math.min(Math.max(limit, 1), 500) : 100;
    const rows = this.db
      .prepare('SELECT * FROM audit_events ORDER BY id DESC LIMIT ?')
      .all(boundedLimit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      id: Number(row.id),
      timestamp: String(row.timestamp),
      actor: String(row.actor_name),
      action: String(row.action),
      target: String(row.target),
      outcome: String(row.outcome),
      details: JSON.parse(String(row.details_json)) as Record<string, unknown>,
    }));
  }

  rotateSecrets(oldCipher: SecretCipher, newCipher: SecretCipher, actor: Actor): number {
    const rotated = this.db.transaction(() => {
      const rows = this.db.prepare('SELECT * FROM sip_secrets').all() as Array<Record<string, unknown>>;
      for (const row of rows) {
        const nodeId = String(row.node_id);
        const plaintext = oldCipher.decrypt(encryptedRow(row), nodeId);
        const encrypted = newCipher.encrypt(plaintext, nodeId);
        this.db
          .prepare('UPDATE sip_secrets SET ciphertext=?, iv=?, tag=?, key_id=?, updated_at=? WHERE node_id=?')
          .run(encrypted.ciphertext, encrypted.iv, encrypted.tag, encrypted.keyId, nowIso(), nodeId);
      }
      this.auditInternal(actor, 'secret.rotate-master-key', 'sip-secrets', 'success', { count: rows.length, keyId: newCipher.id });
      return rows.length;
    })();
    // Keep the process-local cipher aligned with durable state. If any final
    // transaction step (including the audit insert) fails, SQLite rolls every
    // row back and the old cipher remains authoritative in memory as well.
    this.cipher = newCipher;
    return rotated;
  }
}

export function syntheticSeedTopology(): Topology {
  return clone(SEED_TOPOLOGY);
}
