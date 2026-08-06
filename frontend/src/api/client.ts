import { NodeStatus, Topology, ValidationIssue } from '@visual-pbx/shared';

async function json<T>(res: Response): Promise<T> {
  return res.json() as Promise<T>;
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
