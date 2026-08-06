// Visual PBX domain model (PoC).
// Mirrors the design agreed for the callflow editor: topology = nodes + edges + memberships,
// status is a separate, non-persisted model pushed over WebSocket.

export type NodeType =
  | 'extension'
  | 'ivr'
  | 'ringgroup'
  | 'queue'
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
    sipPassword: string;
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
  | VoicemailNode
  | TrunkNode
  | ExternalNode;

export type EdgeCondition =
  | { type: 'digit'; value: string }
  | { type: 'timeout' }
  | { type: 'invalid' }
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

export const NODE_TYPE_LABELS: Record<NodeType, string> = {
  extension: 'Extension',
  ivr: 'IVR',
  ringgroup: 'Ring Group',
  queue: 'Queue',
  voicemail: 'Voicemail',
  trunk: 'Trunk (reserved)',
  external: 'External (reserved)',
};
