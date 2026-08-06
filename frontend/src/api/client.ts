import { NodeStatus, Topology, ValidationIssue } from '@visual-pbx/shared';

/**
 * fetch() only rejects on network failures, and an error page is not always
 * JSON — so surface both as a readable Error instead of a parse crash.
 * 400 responses are expected (validation) and are handed back to the caller.
 */
async function json<T>(res: Response): Promise<T> {
  const body = await res.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new Error(`Unerwartete Antwort vom Backend (HTTP ${res.status}): ${body.slice(0, 200)}`);
  }
  if (!res.ok && res.status !== 400) {
    const message = (parsed as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(message);
  }
  return parsed as T;
}

export function fetchTopology(): Promise<Topology> {
  return fetch('/api/topology').then((r) => json(r));
}

export function saveTopology(topology: Topology): Promise<{ saved: boolean; issues: ValidationIssue[] }> {
  return fetch('/api/topology', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topology),
  }).then((r) => json(r));
}

export function validateTopologyRemote(topology: Topology): Promise<{ issues: ValidationIssue[] }> {
  return fetch('/api/topology/validate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topology),
  }).then((r) => json(r));
}

export interface DeployResponse {
  deployed: boolean;
  issues: ValidationIssue[];
  configsWritten?: boolean;
  reloaded?: boolean;
  reloadError?: string;
}

export function deployTopology(topology: Topology): Promise<DeployResponse> {
  return fetch('/api/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(topology),
  }).then((r) => json(r));
}

export function connectStatusSocket(onStatus: (statuses: NodeStatus[]) => void): () => void {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const ws = new WebSocket(`${proto}://${location.host}/ws/status`);
  ws.onmessage = (ev) => {
    try {
      const data = JSON.parse(ev.data);
      if (data.type === 'status') onStatus(data.statuses as NodeStatus[]);
    } catch {
      /* ignore malformed frames */
    }
  };
  return () => ws.close();
}
