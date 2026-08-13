import { EventEmitter } from 'node:events';
import { ExtensionNode, NodeStatus, Topology } from '@visual-pbx/shared';
import { PbxDatabase } from '../model/database';
import { AmiClient, AmiMessage } from './amiClient';
import { endpointName, sanitize } from './configGenerator';
import { getAmiClient } from './deploy';

export type AmiConnectionState = 'connected' | 'reconnecting' | 'degraded';

export interface StatusSnapshot {
  statuses: NodeStatus[];
  connection: {
    state: AmiConnectionState;
    lastConnectedAt?: string;
    lastEventAt?: string;
    reconnectAttempt: number;
  };
}

function unknownStatuses(topology: Topology): Map<string, NodeStatus> {
  return new Map(topology.nodes.map((node) => [node.id, { nodeId: node.id, availability: 'unknown', activity: 'idle' }]));
}

function endpointMaps(topology: Topology): {
  idByEndpoint: Map<string, string>;
  idByQueue: Map<string, string>;
} {
  const idByEndpoint = new Map<string, string>();
  const idByQueue = new Map<string, string>();
  for (const node of topology.nodes) {
    if (node.type === 'extension') idByEndpoint.set(endpointName(node as ExtensionNode), node.id);
    if (node.type === 'queue') idByQueue.set(sanitize(node.id), node.id);
  }
  return { idByEndpoint, idByQueue };
}

function endpointFromChannel(channel = ''): string | undefined {
  const match = /^PJSIP\/([^/-]+)/.exec(channel);
  return match?.[1];
}

export class AmiStatusService extends EventEmitter {
  private statuses = new Map<string, NodeStatus>();
  private state: AmiConnectionState = 'reconnecting';
  private reconnectAttempt = 0;
  private lastConnectedAt?: string;
  private lastEventAt?: string;
  private client?: AmiClient;
  private reconnectTimer?: NodeJS.Timeout;
  private heartbeatTimer?: NodeJS.Timeout;
  private pollTimer?: NodeJS.Timeout;
  private running = false;
  private eventKeys = new Map<string, number>();

  constructor(
    private readonly topology: () => Topology,
    private readonly connectClient: () => Promise<AmiClient> = getAmiClient,
    private readonly timings = { heartbeatMs: 15_000, pollMs: 30_000, maxBackoffMs: 30_000 }
  ) {
    super();
    this.statuses = unknownStatuses(topology());
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.connect();
  }

  stop(): void {
    this.running = false;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.client?.off('message', this.onMessage);
    this.client?.off('closed', this.onClosed);
  }

  snapshot(): StatusSnapshot {
    const topology = this.topology();
    const currentIds = new Set(topology.nodes.map((node) => node.id));
    for (const node of topology.nodes) {
      if (!this.statuses.has(node.id)) this.statuses.set(node.id, { nodeId: node.id, availability: 'unknown', activity: 'idle' });
    }
    for (const id of this.statuses.keys()) if (!currentIds.has(id)) this.statuses.delete(id);
    return {
      statuses: [...this.statuses.values()],
      connection: {
        state: this.state,
        lastConnectedAt: this.lastConnectedAt,
        lastEventAt: this.lastEventAt,
        reconnectAttempt: this.reconnectAttempt,
      },
    };
  }

  private publish(): void {
    this.emit('update', this.snapshot());
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    this.state = this.reconnectAttempt >= 3 ? 'degraded' : 'reconnecting';
    this.publish();
    try {
      const client = await this.connectClient();
      if (!this.running) return;
      this.client = client;
      client.on('message', this.onMessage);
      client.once('closed', this.onClosed);
      this.state = 'connected';
      this.reconnectAttempt = 0;
      this.lastConnectedAt = new Date().toISOString();
      await this.refreshSnapshot(client);
      this.heartbeatTimer = setInterval(() => void this.heartbeat(), this.timings.heartbeatMs);
      this.pollTimer = setInterval(() => void this.refreshSnapshot(client).catch(() => this.handleDisconnect()), this.timings.pollMs);
      this.heartbeatTimer.unref?.();
      this.pollTimer.unref?.();
      this.publish();
    } catch {
      this.scheduleReconnect();
    }
  }

  private readonly onClosed = () => this.handleDisconnect();

  private handleDisconnect(): void {
    if (!this.running) return;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.client?.off('message', this.onMessage);
    this.client = undefined;
    this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (!this.running || this.reconnectTimer) return;
    this.reconnectAttempt += 1;
    this.state = this.reconnectAttempt >= 3 ? 'degraded' : 'reconnecting';
    this.statuses = unknownStatuses(this.topology());
    this.publish();
    const delay = Math.min(500 * 2 ** Math.min(this.reconnectAttempt - 1, 6), this.timings.maxBackoffMs);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
    this.reconnectTimer.unref?.();
  }

  private async heartbeat(): Promise<void> {
    try {
      const response = await this.client?.sendAction({ Action: 'Ping' }, { timeoutMs: 4000 });
      if (!response?.some((message) => message.Response === 'Success')) throw new Error('AMI heartbeat failed');
    } catch {
      this.client?.disconnect();
      this.handleDisconnect();
    }
  }

  private async refreshSnapshot(client: AmiClient): Promise<void> {
    const topology = this.topology();
    const { idByEndpoint, idByQueue } = endpointMaps(topology);
    const next = unknownStatuses(topology);
    const [endpoints, queues] = await Promise.all([client.getEndpointStatuses(), client.getQueueStatuses()]);
    for (const endpoint of endpoints) {
      const nodeId = idByEndpoint.get(endpoint.endpoint);
      if (!nodeId) continue;
      const value = endpoint.state.toUpperCase();
      next.set(nodeId, {
        nodeId,
        availability: value === 'UNAVAILABLE' || value === 'UNKNOWN' ? 'offline' : 'online',
        activity:
          value === 'INUSE' || value === 'BUSY'
            ? 'in_call'
            : value === 'RINGING' || value === 'RINGINUSE'
              ? 'ringing'
              : 'idle',
      });
    }
    for (const queue of queues) {
      const nodeId = idByQueue.get(queue.queue);
      if (!nodeId) continue;
      next.set(nodeId, {
        nodeId,
        availability: 'online',
        activity: queue.calls > 0 ? 'ringing' : 'idle',
        metrics: { waitingCalls: queue.calls },
      });
    }
    this.statuses = next;
    this.publish();
  }

  private readonly onMessage = (message: AmiMessage) => {
    if (!message.Event) return;
    const key = [
      message.Event,
      message.Uniqueid,
      message.Linkedid,
      message.SequenceNumber,
      message.Endpoint,
      message.Channel,
      message.Queue,
      message.ContactStatus,
      message.ChannelStateDesc,
    ].join('|');
    const current = Date.now();
    if (this.eventKeys.has(key)) return;
    this.eventKeys.set(key, current);
    if (this.eventKeys.size > 1000) {
      for (const [candidate, timestamp] of this.eventKeys) {
        if (current - timestamp > 120_000 || this.eventKeys.size > 900) this.eventKeys.delete(candidate);
      }
    }

    this.lastEventAt = new Date(current).toISOString();
    const topology = this.topology();
    const { idByEndpoint, idByQueue } = endpointMaps(topology);
    const endpoint = message.Endpoint ?? endpointFromChannel(message.Channel) ?? endpointFromChannel(message.Interface);
    const nodeId = endpoint ? idByEndpoint.get(endpoint) : undefined;
    const existing = nodeId ? this.statuses.get(nodeId) : undefined;

    switch (message.Event) {
      case 'ContactStatus':
      case 'PeerStatus':
        if (nodeId) {
          const status = (message.ContactStatus ?? message.PeerStatus ?? '').toLowerCase();
          this.statuses.set(nodeId, {
            nodeId,
            availability: /created|registered|reachable|up/.test(status) ? 'online' : 'offline',
            activity: existing?.activity ?? 'idle',
          });
        }
        break;
      case 'Newchannel':
      case 'Newstate':
        if (nodeId) {
          const state = (message.ChannelStateDesc ?? '').toLowerCase();
          this.statuses.set(nodeId, {
            nodeId,
            availability: existing?.availability ?? 'online',
            activity: /ring/.test(state) ? 'ringing' : /up|busy/.test(state) ? 'in_call' : existing?.activity ?? 'idle',
            callerId: message.CallerIDNum || undefined,
          });
        }
        break;
      case 'BridgeEnter':
        if (nodeId) this.statuses.set(nodeId, { nodeId, availability: 'online', activity: 'in_call' });
        break;
      case 'Hangup':
        if (nodeId) this.statuses.set(nodeId, { nodeId, availability: existing?.availability ?? 'online', activity: 'idle' });
        break;
      case 'QueueCallerJoin':
      case 'QueueCallerLeave': {
        const queueNodeId = idByQueue.get(message.Queue ?? '');
        if (queueNodeId) {
          const waiting = Math.max(0, Number(message.Count ?? message.Position ?? 0));
          this.statuses.set(queueNodeId, {
            nodeId: queueNodeId,
            availability: 'online',
            activity: waiting > 0 ? 'ringing' : 'idle',
            metrics: { waitingCalls: waiting },
          });
        }
        break;
      }
      case 'QueueMemberStatus':
      case 'QueueMemberAdded':
      case 'QueueMemberRemoved':
      case 'BridgeLeave':
        // These events can be lossy across Asterisk releases. Refresh the
        // authoritative snapshot without blocking event delivery.
        if (this.client) void this.refreshSnapshot(this.client).catch(() => this.handleDisconnect());
        break;
      default:
        return;
    }
    this.publish();
  };
}

let singleton: AmiStatusService | undefined;

export function getStatusService(database: PbxDatabase): AmiStatusService {
  if (!singleton) {
    singleton = new AmiStatusService(() => database.currentTopology().topology);
    singleton.start();
  }
  return singleton;
}

export function resetStatusServiceForTests(): void {
  singleton?.stop();
  singleton = undefined;
}

/** One-shot fallback retained for diagnostics and deterministic route tests. */
export async function computeStatuses(topology: Topology): Promise<NodeStatus[]> {
  const temporary = new AmiStatusService(() => topology);
  try {
    const ami = await getAmiClient();
    const { idByEndpoint, idByQueue } = endpointMaps(topology);
    const statuses = unknownStatuses(topology);
    const [endpoints, queues] = await Promise.all([ami.getEndpointStatuses(), ami.getQueueStatuses()]);
    for (const endpoint of endpoints) {
      const id = idByEndpoint.get(endpoint.endpoint);
      if (id) statuses.set(id, { nodeId: id, availability: endpoint.state === 'Unavailable' ? 'offline' : 'online', activity: 'idle' });
    }
    for (const queue of queues) {
      const id = idByQueue.get(queue.queue);
      if (id) statuses.set(id, { nodeId: id, availability: 'online', activity: queue.calls ? 'ringing' : 'idle', metrics: { waitingCalls: queue.calls } });
    }
    return [...statuses.values()];
  } catch {
    return temporary.snapshot().statuses;
  }
}
