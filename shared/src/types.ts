// Essentials+ Calls domain model.
// Mirrors the design agreed for the callflow editor: topology = nodes + edges + memberships,
// status is a separate, non-persisted model pushed over WebSocket.

export type NodeType =
  | 'extension'
  | 'ivr'
  | 'ringgroup'
  | 'queue'
  | 'schedule'
  | 'voicemail'
  | 'trunk' // reserved, disabled in the PoC
  | 'external'; // reserved, disabled in the PoC

export interface NodePosition {
  x: number;
  y: number;
}

export interface NodeMetadata {
  createdAt?: string;
  updatedAt?: string;
}

export interface BaseNode {
  id: string;
  type: NodeType;
  label: string;
  position?: NodePosition;
  metadata?: NodeMetadata;
}

export interface ExtensionVoicemail {
  enabled: boolean;
  mailbox: string;
  pin?: string;
  email?: string;
}

export interface ExtensionNode extends BaseNode {
  type: 'extension';
  properties: {
    number: string;
    sipUser: string;
    /**
     * Write-only compatibility field. The backend removes it from stored
     * revisions and normal read responses; it is only populated transiently
     * while generating Asterisk configuration or migrating a legacy file.
     */
    sipPassword?: string;
    /** Safe representation returned to clients. */
    sipSecret?: { configured: boolean };
    callerIdName?: string;
    voicemail?: ExtensionVoicemail;
  };
}

export interface IVRNode extends BaseNode {
  type: 'ivr';
  properties: {
    greeting: string;
    timeout: number;
    invalidRetries: number;
  };
}

export type RingStrategy = 'ringall' | 'roundrobin' | 'leastrecent' | 'fewestcalls' | 'random';

export interface RingGroupNode extends BaseNode {
  type: 'ringgroup';
  properties: {
    strategy: RingStrategy;
    ringTimeout: number;
  };
}

export type QueueStrategy = RingStrategy | 'rrmemory';

export interface QueueNode extends BaseNode {
  type: 'queue';
  properties: {
    strategy: QueueStrategy;
    timeout: number;
    maxWaitTime: number;
    joinEmpty: 'yes' | 'no' | 'strict';
    leaveWhenEmpty: 'yes' | 'no';
  };
}

export type ScheduleWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface ScheduleWindow {
  id: string;
  weekdays: ScheduleWeekday[];
  /** Local wall-clock time in HH:MM, inclusive. */
  start: string;
  /** Local wall-clock time in HH:MM, exclusive; may cross midnight. */
  end: string;
}

export interface ScheduleNode extends BaseNode {
  type: 'schedule';
  properties: {
    timezone: string;
    windows: ScheduleWindow[];
    /** Explicit closed dates in YYYY-MM-DD form, interpreted in timezone. */
    holidays: string[];
  };
}

export interface VoicemailNode extends BaseNode {
  type: 'voicemail';
  properties: {
    mailbox: string;
    pin?: string;
    email?: string;
    attachAudio: boolean;
  };
}

export interface TrunkNode extends BaseNode {
  type: 'trunk';
  properties: Record<string, never>;
}

export interface ExternalNode extends BaseNode {
  type: 'external';
  properties: Record<string, never>;
}

export type PbxNode =
  | ExtensionNode
  | IVRNode
  | RingGroupNode
  | QueueNode
  | ScheduleNode
  | VoicemailNode
  | TrunkNode
  | ExternalNode;

export type EdgeCondition =
  | { type: 'digit'; value: string }
  | { type: 'timeout' }
  | { type: 'invalid' }
  | { type: 'open' }
  | { type: 'closed' }
  | { type: 'unconditional' };

export interface Edge {
  id: string;
  source: string;
  target: string;
  condition?: EdgeCondition;
}

export type MembershipRole = 'member' | 'agent';

export interface Membership {
  id: string;
  groupId: string;
  memberId: string;
  role: MembershipRole;
  position?: number;
  paused?: boolean;
}

export interface Topology {
  id: string;
  name: string;
  description?: string;
  nodes: PbxNode[];
  edges: Edge[];
  memberships: Membership[];
}

export const TOPOLOGY_SCHEMA_VERSION = 2 as const;

export interface TopologyExport {
  schemaVersion: typeof TOPOLOGY_SCHEMA_VERSION;
  product: 'Essentials+ Calls';
  exportedAt: string;
  redacted: boolean;
  topology: Topology;
}

// --- Status model (dynamic, not persisted with the topology) ---

export type Availability = 'online' | 'offline' | 'unknown';
export type Activity = 'idle' | 'ringing' | 'in_call' | 'busy';

export interface NodeStatus {
  nodeId: string;
  availability: Availability;
  activity: Activity;
  metrics?: {
    waitingCalls?: number;
    activeCalls?: number;
    talkTime?: number;
  };
  callerId?: string;
  queuePosition?: number;
}

export const DISABLED_NODE_TYPES: ReadonlySet<NodeType> = new Set(['trunk', 'external']);

/**
 * First generated test entry point. Every node gets one (`600`, `601`, …) so a
 * callflow can be reached from a softphone without an inbound trunk, which the
 * PoC does not implement.
 */
export const ENTRYPOINT_BASE = 600;

/** Prompts installed by the pinned Asterisk image and safe to reference. */
export const BUILTIN_PROMPTS: ReadonlySet<string> = new Set([
  'hello-world',
  'demo-thanks',
  'demo-congrats',
  'pls-hold-while-try',
  'invalid',
]);

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  extension: 'Extension',
  ivr: 'IVR',
  ringgroup: 'Ring Group',
  queue: 'Queue',
  schedule: 'Schedule',
  voicemail: 'Voicemail',
  trunk: 'Trunk (reserved)',
  external: 'External (reserved)',
};
