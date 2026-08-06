import { NodeStatus, Topology } from '@visual-pbx/shared';
import { getAmiClient } from './deploy';
import { sanitize } from './configGenerator';

// Derives the dynamic NodeStatus[] model from live AMI queries. Falls back to
// "unknown" for every node if Asterisk/AMI is unreachable (e.g. still booting),
// so the frontend can render gracefully instead of erroring out.
export async function computeStatuses(topology: Topology): Promise<NodeStatus[]> {
  const idByEndpoint = new Map<string, string>();
  const idByQueue = new Map<string, string>();
  for (const node of topology.nodes) {
    if (node.type === 'extension') idByEndpoint.set(sanitize(node.id), node.id);
    if (node.type === 'queue') idByQueue.set(sanitize(node.id), node.id);
  }

  const statuses = new Map<string, NodeStatus>();
  for (const node of topology.nodes) {
    statuses.set(node.id, { nodeId: node.id, availability: 'unknown', activity: 'idle' });
  }

  try {
    const ami = await getAmiClient();
    const [endpoints, queues] = await Promise.all([ami.getEndpointStatuses(), ami.getQueueStatuses()]);

    for (const ep of endpoints) {
      const nodeId = idByEndpoint.get(ep.endpoint);
      if (!nodeId) continue;
      const state = ep.state.toUpperCase();
      const online = state !== 'UNAVAILABLE' && state !== 'UNKNOWN';
      statuses.set(nodeId, {
        nodeId,
        availability: online ? 'online' : 'offline',
        activity: state === 'INUSE' || state === 'BUSY' ? 'in_call' : state === 'RINGING' || state === 'RINGINUSE' ? 'ringing' : 'idle',
      });
    }

    for (const q of queues) {
      const nodeId = idByQueue.get(q.queue);
      if (!nodeId) continue;
      statuses.set(nodeId, {
        nodeId,
        availability: 'online',
        activity: q.calls > 0 ? 'ringing' : 'idle',
        metrics: { waitingCalls: q.calls },
      });
    }
  } catch {
    // AMI unreachable: leave every node at "unknown" rather than failing the request.
  }

  return [...statuses.values()];
}
