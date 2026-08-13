import { strict as assert } from 'node:assert';
import { afterEach, beforeEach, describe, test } from 'node:test';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { AddressInfo } from 'node:net';
import { createApp } from '../src/app';
import { MAX_TOPOLOGY_IMPORT_BYTES } from '@visual-pbx/shared';
import { PbxDatabase, Role } from '../src/model/database';
import { SecretCipher } from '../src/security/crypto';
import { hashPassword } from '../src/security/password';

interface Client {
  request(path: string, init?: RequestInit): Promise<Response>;
  csrf: string;
}

let directory: string;
let database: PbxDatabase;
let server: http.Server;
let baseUrl: string;

async function createUser(username: string, role: Role, password = 'synthetic-password-123'): Promise<void> {
  database.createUser(username, await hashPassword(password), role, { id: null, username: 'test' });
}

function client(): Client {
  let cookie = '';
  const value: Client = {
    csrf: '',
    async request(route, init = {}) {
      const headers = new Headers(init.headers);
      if (cookie) headers.set('Cookie', cookie);
      if (value.csrf && !['GET', 'HEAD'].includes(init.method ?? 'GET')) headers.set('X-CSRF-Token', value.csrf);
      const response = await fetch(`${baseUrl}${route}`, { ...init, headers });
      const setCookie = response.headers.get('set-cookie');
      if (setCookie) cookie = setCookie.split(';')[0];
      return response;
    },
  };
  return value;
}

function pcmWav(): Uint8Array {
  const samples = 800;
  const buffer = Buffer.alloc(44 + samples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + samples * 2, 4);
  buffer.write('WAVEfmt ', 8);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(8000, 24);
  buffer.writeUInt32LE(16000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(samples * 2, 40);
  return new Uint8Array(buffer);
}

async function loginAs(browser: Client, username: string, password = 'synthetic-password-123') {
  const response = await browser.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const body = await response.json() as { csrfToken: string };
  browser.csrf = body.csrfToken;
  return { response, body };
}

beforeEach(async () => {
  process.env.PBX_ENV = 'test';
  process.env.PBX_SECURE_COOKIES = 'false';
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'essentials-calls-api-'));
  process.env.SOUNDS_DIR = path.join(directory, 'sounds');
  database = new PbxDatabase(directory, SecretCipher.fromEncoded(Buffer.alloc(32, 3).toString('base64')));
  server = http.createServer(createApp(database));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterEach(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  database.close();
  fs.rmSync(directory, { recursive: true, force: true });
  delete process.env.SOUNDS_DIR;
});

describe('authentication and authorization API', () => {
  test('publishes an unauthenticated, topology-free Office service contract', async () => {
    for (const route of ['/health', '/ready', '/api/service']) {
      const response = await client().request(route);
      assert.equal(response.status, 200);
      const raw = await response.text();
      const body = JSON.parse(raw) as {
        name: string; version: string; apiVersion: string; capabilityIds: string[]; authMode: string;
      };
      assert.equal(body.name, 'Essentials+ Calls');
      assert.match(body.version, /^\d+\.\d+\.\d+$/);
      assert.equal(body.apiVersion, 'v1');
      assert.equal(body.authMode, 'local-session');
      assert.ok(body.capabilityIds.includes('calls.deploy.atomic'));
      assert.ok(!raw.includes('nodes') && !raw.includes('sipSecret'));
    }
  });

  test('has no default login and reports bootstrap requirement', async () => {
    const response = await client().request('/api/auth/session');
    assert.equal(response.status, 401);
    assert.equal((await response.json() as { bootstrapRequired: boolean }).bootstrapRequired, true);
  });

  test('sets hardened session cookies and never returns SIP plaintext', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    const { response } = await loginAs(browser, 'admin');
    assert.equal(response.status, 200);
    const setCookie = response.headers.get('set-cookie') ?? '';
    assert.match(setCookie, /HttpOnly/i);
    assert.match(setCookie, /SameSite=Strict/i);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');

    const topology = await browser.request('/api/topology');
    const raw = await topology.text();
    assert.equal(topology.status, 200);
    assert.equal(topology.headers.get('cache-control'), 'no-store');
    assert.ok(!raw.includes('synthetic-alice-101'));
    assert.match(raw, /"configured":true/);
  });

  test('enforces CSRF and viewer/editor/admin permissions server-side', async () => {
    await createUser('viewer', 'viewer');
    await createUser('editor', 'editor');
    await createUser('admin', 'admin');

    const viewer = client();
    await loginAs(viewer, 'viewer');
    const viewerDocument = await (await viewer.request('/api/topology')).json() as { topology: unknown; revision: number };
    const viewerWrite = await viewer.request('/api/topology', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${viewerDocument.revision}"` },
      body: JSON.stringify(viewerDocument.topology),
    });
    assert.equal(viewerWrite.status, 403);

    const editor = client();
    await loginAs(editor, 'editor');
    const editorDocument = await (await editor.request('/api/topology')).json() as { topology: Record<string, unknown>; revision: number };
    const noCsrf = client();
    const unauthenticatedMutation = await noCsrf.request('/api/topology', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(unauthenticatedMutation.status, 403);

    const topology = editorDocument.topology as { name: string };
    topology.name = 'Editor revision';
    const saved = await editor.request('/api/topology', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${editorDocument.revision}"` },
      body: JSON.stringify(topology),
    });
    assert.equal(saved.status, 200);
    const deploy = await editor.request('/api/deploy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': saved.headers.get('etag') ?? '' },
      body: '{}',
    });
    assert.equal(deploy.status, 403);

    const admin = client();
    await loginAs(admin, 'admin');
    const adminDocument = await (await admin.request('/api/topology')).json() as { revision: number };
    const secret = await admin.request('/api/extensions/ext-101/secret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${adminDocument.revision}"` },
      body: JSON.stringify({ secret: 'new-synthetic-secret-101' }),
    });
    assert.equal(secret.status, 200);
    assert.ok(!(await secret.text()).includes('new-synthetic-secret-101'));
  });

  test('returns 409 for parallel edits instead of overwriting', async () => {
    await createUser('editor', 'editor');
    const first = client();
    const second = client();
    await loginAs(first, 'editor');
    await loginAs(second, 'editor');
    const a = await (await first.request('/api/topology')).json() as { topology: { name: string }; revision: number };
    const b = await (await second.request('/api/topology')).json() as { topology: { name: string }; revision: number };
    a.topology.name = 'first writer';
    b.topology.name = 'stale writer';
    assert.equal((await first.request('/api/topology', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${a.revision}"` }, body: JSON.stringify(a.topology),
    })).status, 200);
    const conflict = await second.request('/api/topology', {
      method: 'PUT', headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${b.revision}"` }, body: JSON.stringify(b.topology),
    });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json() as { code: string }).code, 'revision-conflict');
  });

  test('rate-limits repeated failed logins and audits them without passwords', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    for (let index = 0; index < 5; index++) {
      const result = await loginAs(browser, 'admin', 'incorrect-synthetic-password');
      assert.equal(result.response.status, 401);
    }
    const blocked = await loginAs(browser, 'admin', 'incorrect-synthetic-password');
    assert.equal(blocked.response.status, 429);
    assert.ok(database.listAudit().every((entry) => !JSON.stringify(entry).includes('incorrect-synthetic-password')));
  });

  test('protects the final active administrator and the current session', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    await loginAs(browser, 'admin');
    const users = await (await browser.request('/api/users')).json() as {
      users: Array<{ id: string; username: string }>;
    };
    const admin = users.users.find((user) => user.username === 'admin');
    assert.ok(admin);

    const selfDisable = await browser.request(`/api/users/${admin.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ disabled: true }),
    });
    assert.equal(selfDisable.status, 409);
    assert.equal((await selfDisable.json() as { code: string }).code, 'user-safety');

    const finalAdminDowngrade = await browser.request(`/api/users/${admin.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'editor' }),
    });
    assert.equal(finalAdminDowngrade.status, 409);
    assert.equal(database.userById(admin.id)?.role, 'admin');
  });

  test('returns client errors for invalid user input without persisting users', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    await loginAs(browser, 'admin');
    const before = database.countUsers();
    const badUsername = await browser.request('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '../', password: 'synthetic-password-123', role: 'viewer' }),
    });
    assert.equal(badUsername.status, 400);
    const badPassword = await browser.request('/api/users', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'valid-user', password: 'short', role: 'viewer' }),
    });
    assert.equal(badPassword.status, 400);
    assert.equal(database.countUsers(), before);
  });

  test('rejects corrupt, incompatible, oversized, and manipulated imports atomically', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    await loginAs(browser, 'admin');
    const current = await (await browser.request('/api/topology')).json() as {
      topology: { nodes: Array<Record<string, unknown>> };
      revision: number;
    };
    const originalRevision = current.revision;

    const legacyWithSecret = structuredClone(current.topology) as {
      nodes: Array<{ type?: string; properties?: Record<string, unknown> }>;
    };
    const legacyExtension = legacyWithSecret.nodes.find((node) => node.type === 'extension');
    assert.ok(legacyExtension?.properties);
    legacyExtension.properties.sipPassword = 'synthetic-dry-run-secret';
    delete legacyExtension.properties.sipSecret;
    const legacyDryRun = await browser.request('/api/topology/import/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, topology: legacyWithSecret }),
    });
    const legacyDryRunRaw = await legacyDryRun.text();
    assert.equal(legacyDryRun.status, 200);
    assert.ok(!legacyDryRunRaw.includes('synthetic-dry-run-secret'), 'dry-run response must not echo a legacy secret');
    assert.ok(!legacyDryRunRaw.includes('sipPassword'), 'dry-run response must not echo imported topology');

    const corrupt = await browser.request('/api/topology/import/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ schemaVersion: 2 }),
    });
    assert.equal(corrupt.status, 400);

    const incompatible = await browser.request('/api/topology/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${originalRevision}"` },
      body: JSON.stringify({ schemaVersion: 999, topology: current.topology }),
    });
    assert.equal(incompatible.status, 400);

    const manipulatedTopology = structuredClone(current.topology) as {
      nodes: Array<{ type?: string; properties?: Record<string, unknown> }>;
    };
    const extension = manipulatedTopology.nodes.find((node) => node.type === 'extension');
    assert.ok(extension?.properties);
    extension.properties.sipPassword = 'synthetic-manipulated-secret';
    const manipulated = await browser.request('/api/topology/import/dry-run', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 2, topology: manipulatedTopology }),
    });
    assert.equal(manipulated.status, 400);
    assert.equal((await manipulated.json() as { code: string }).code, 'plaintext-secret-rejected');

    const manipulatedDeploy = await browser.request('/api/deploy', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${originalRevision}"` },
      body: JSON.stringify({ topology: manipulatedTopology }),
    });
    assert.equal(manipulatedDeploy.status, 400);
    assert.equal((await manipulatedDeploy.json() as { code: string }).code, 'plaintext-secret-rejected');

    const invalidRevision = await browser.request('/api/topology/revisions/not-a-number');
    assert.equal(invalidRevision.status, 400);

    const oversized = await browser.request('/api/topology/import', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${originalRevision}"` },
      body: JSON.stringify({ padding: 'x'.repeat(MAX_TOPOLOGY_IMPORT_BYTES) }),
    });
    assert.equal(oversized.status, 413);
    assert.equal(database.currentTopology().revision, originalRevision);
  });

  test('lists sound references, blocks deletion, and replaces references atomically', async () => {
    await createUser('admin', 'admin');
    const browser = client();
    await loginAs(browser, 'admin');
    const uploaded = await browser.request('/api/sounds/synthetic-api-prompt', {
      method: 'PUT', headers: { 'Content-Type': 'audio/wav' }, body: pcmWav(),
    });
    assert.equal(uploaded.status, 200);
    assert.equal(fs.statSync(path.join(process.env.SOUNDS_DIR!, 'synthetic-api-prompt.wav')).mode & 0o777, 0o640);

    const current = await (await browser.request('/api/topology')).json() as {
      topology: { nodes: Array<{ id: string; type: string; label: string; properties: Record<string, unknown> }> };
      revision: number;
    };
    const ivr = current.topology.nodes.find((node) => node.type === 'ivr');
    assert.ok(ivr);
    ivr.properties.greeting = 'custom/synthetic-api-prompt';
    const saved = await browser.request('/api/topology', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${current.revision}"` },
      body: JSON.stringify(current.topology),
    });
    assert.equal(saved.status, 200);
    const savedBody = await saved.json() as { revision: number };

    const listed = await (await browser.request('/api/sounds')).json() as {
      sounds: Array<{ name: string; references: Array<{ nodeId: string; field: string }> }>;
    };
    assert.deepEqual(
      listed.sounds.find((sound) => sound.name === 'synthetic-api-prompt')?.references,
      [{ nodeId: ivr.id, label: ivr.label, field: 'properties.greeting' }]
    );

    const canonicalizationBypass = await browser.request('/api/sounds/SYNTHETIC-API-PROMPT', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(canonicalizationBypass.status, 409, 'alternate spelling must not bypass reference protection');

    const blocked = await browser.request('/api/sounds/synthetic-api-prompt', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: '{}',
    });
    assert.equal(blocked.status, 409);
    assert.equal((await blocked.json() as { code: string }).code, 'sound-in-use');
    assert.equal(database.currentTopology().revision, savedBody.revision);

    const replaced = await browser.request('/api/sounds/synthetic-api-prompt', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${savedBody.revision}"` },
      body: JSON.stringify({ replacement: 'hello-world' }),
    });
    assert.equal(replaced.status, 200);
    assert.equal(database.currentTopology().topology.nodes.find((node) => node.id === ivr.id)?.type === 'ivr' &&
      database.currentTopology().topology.nodes.find((node) => node.id === ivr.id)!.properties.greeting, 'hello-world');
    assert.equal(fs.existsSync(path.join(process.env.SOUNDS_DIR!, 'synthetic-api-prompt.wav')), false);
  });
});
