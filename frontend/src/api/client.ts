import { NodeStatus, Topology, ValidationIssue } from '@visual-pbx/shared';

export type Role = 'viewer' | 'editor' | 'admin';

export interface UserInfo {
  id: string;
  username: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  authenticated: true;
  user: { id: string; username: string; role: Role; disabled: boolean };
  csrfToken: string;
  expiresAt: string;
}

export interface TopologyDocument {
  topology: Topology;
  revision: number;
  activeRevision: number | null;
  lastGoodRevision: number | null;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown>
  ) {
    super(message);
  }
}

let csrfToken = '';

async function json<T>(res: Response): Promise<T> {
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    throw new ApiError(`Unerwartete Antwort vom Backend (HTTP ${res.status}): ${body.slice(0, 200)}`, res.status, {});
  }
  if (!res.ok) {
    const record = parsed as Record<string, unknown>;
    const message = typeof record.error === 'string' ? record.error : `HTTP ${res.status}`;
    throw new ApiError(message, res.status, record);
  }
  return parsed as T;
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return csrfToken ? { ...extra, 'X-CSRF-Token': csrfToken } : extra;
}

export async function fetchSession(): Promise<AuthSession | null> {
  const response = await fetch('/api/auth/session');
  if (response.status === 401) return null;
  const session = await json<AuthSession>(response);
  csrfToken = session.csrfToken;
  return session;
}

export async function login(username: string, password: string): Promise<AuthSession> {
  const response = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const session = await json<AuthSession>(response);
  csrfToken = session.csrfToken;
  return session;
}

export async function logout(): Promise<void> {
  await json(await fetch('/api/auth/logout', { method: 'POST', headers: headers() }));
  csrfToken = '';
}

export async function fetchUsers(): Promise<{ users: UserInfo[] }> {
  return json(await fetch('/api/users'));
}

export async function createUser(username: string, password: string, role: Role): Promise<{ user: UserInfo }> {
  return json(
    await fetch('/api/users', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ username, password, role }),
    })
  );
}

export async function updateUser(
  id: string,
  patch: { role?: Role; disabled?: boolean; password?: string }
): Promise<{ user: UserInfo }> {
  return json(
    await fetch(`/api/users/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(patch),
    })
  );
}

export async function fetchTopology(): Promise<TopologyDocument> {
  return json(await fetch('/api/topology'));
}

export async function saveTopology(
  topology: Topology,
  revision: number,
  comment = 'Saved from editor'
): Promise<TopologyDocument & { saved: boolean; issues: ValidationIssue[] }> {
  return json(
    await fetch('/api/topology', {
      method: 'PUT',
      headers: headers({
        'Content-Type': 'application/json',
        'If-Match': `"rev-${revision}"`,
        'X-Revision-Comment': comment,
      }),
      body: JSON.stringify(topology),
    })
  );
}

export async function validateTopologyRemote(topology: Topology): Promise<{ issues: ValidationIssue[] }> {
  return json(
    await fetch('/api/topology/validate', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(topology),
    })
  );
}

export interface DeployResponse {
  deployed: boolean;
  issues: ValidationIssue[];
  revision: number;
  configsWritten: boolean;
  activated: boolean;
  reloaded: boolean;
  runtimeHealthy: boolean;
  rolledBack: boolean;
  deploymentId: string;
  checksum?: string;
  error?: string;
  rollbackError?: string;
}

export async function deployRevision(revision: number): Promise<DeployResponse> {
  return json(
    await fetch('/api/deploy', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` }),
      body: '{}',
    })
  );
}

export interface SoundReference {
  nodeId: string;
  label: string;
  field: string;
}

export interface SoundInfo {
  name: string;
  reference: string;
  sizeBytes: number;
  updatedAt: string;
  durationSeconds: number;
  references: SoundReference[];
}

export async function fetchSounds(): Promise<{ sounds: SoundInfo[] }> {
  return json(await fetch('/api/sounds'));
}

export async function uploadSound(name: string, wav: Blob): Promise<SoundInfo> {
  const response = await fetch(`/api/sounds/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers: headers({ 'Content-Type': 'audio/wav' }),
    body: wav,
  });
  const body = await json<{ sound: SoundInfo }>(response);
  return body.sound;
}

export async function deleteSound(name: string, replacement?: string, revision?: number): Promise<{ deleted: boolean; revision?: number }> {
  return json(
    await fetch(`/api/sounds/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      headers: headers({
        'Content-Type': 'application/json',
        ...(revision !== undefined ? { 'If-Match': `"rev-${revision}"` } : {}),
      }),
      body: JSON.stringify(replacement ? { replacement } : {}),
    })
  );
}

export function soundUrl(name: string): string {
  return `/api/sounds/${encodeURIComponent(name)}`;
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

export async function fetchRevisions(): Promise<{ revisions: RevisionInfo[] }> {
  return json(await fetch('/api/topology/revisions'));
}

export async function rollbackRevision(target: number, current: number, comment: string): Promise<TopologyDocument> {
  return json(
    await fetch(`/api/topology/revisions/${target}/rollback`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'If-Match': `"rev-${current}"` }),
      body: JSON.stringify({ comment }),
    })
  );
}

export async function dryRunImport(document: unknown): Promise<{
  valid: boolean;
  issues: ValidationIssue[];
  sourceSchemaVersion: number;
  migrated: boolean;
}> {
  return json(
    await fetch('/api/topology/import/dry-run', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(document),
    })
  );
}

export async function applyImport(document: unknown, revision: number): Promise<TopologyDocument> {
  return json(
    await fetch('/api/topology/import', {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` }),
      body: JSON.stringify(document),
    })
  );
}

export async function exportTopology(): Promise<Blob> {
  const response = await fetch('/api/topology/export');
  if (!response.ok) await json(response);
  return response.blob();
}

export async function updateSipSecret(nodeId: string, secret: string, revision: number): Promise<TopologyDocument> {
  return json(
    await fetch(`/api/extensions/${encodeURIComponent(nodeId)}/secret`, {
      method: 'POST',
      headers: headers({ 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` }),
      body: JSON.stringify({ secret }),
    })
  );
}

export interface StatusConnection {
  state: 'connected' | 'reconnecting' | 'degraded';
  lastConnectedAt?: string;
  lastEventAt?: string;
  reconnectAttempt: number;
}

export function connectStatusSocket(
  onStatus: (statuses: NodeStatus[], connection: StatusConnection) => void,
  onClose?: () => void
): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const socket = new WebSocket(`${proto}://${location.host}/ws/status`);
  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'status') onStatus(data.statuses as NodeStatus[], data.connection as StatusConnection);
    } catch {
      // Malformed frames are ignored; the next snapshot remains authoritative.
    }
  };
  socket.onclose = () => onClose?.();
  return () => socket.close();
}
