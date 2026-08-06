import { ExtensionNode, IVRNode, QueueNode, RingGroupNode, Topology, VoicemailNode } from './types';

// Builders used by the shared and backend test suites. Kept in src (not a test
// folder) so both workspaces can import them through the package entry point.

export function extension(id: string, number: string, overrides: Partial<ExtensionNode['properties']> = {}): ExtensionNode {
  return {
    id,
    type: 'extension',
    label: `Ext ${number}`,
    position: { x: 0, y: 0 },
    properties: { number, sipUser: number, sipPassword: `pw-${number}`, ...overrides },
  };
}

export function ivr(id: string, overrides: Partial<IVRNode['properties']> = {}): IVRNode {
  return {
    id,
    type: 'ivr',
    label: `IVR ${id}`,
    position: { x: 0, y: 0 },
    properties: { greeting: 'hello-world', timeout: 5, invalidRetries: 2, ...overrides },
  };
}

export function ringGroup(id: string, overrides: Partial<RingGroupNode['properties']> = {}): RingGroupNode {
  return {
    id,
    type: 'ringgroup',
    label: `Group ${id}`,
    position: { x: 0, y: 0 },
    properties: { strategy: 'ringall', ringTimeout: 15, ...overrides },
  };
}

export function queue(id: string, overrides: Partial<QueueNode['properties']> = {}): QueueNode {
  return {
    id,
    type: 'queue',
    label: `Queue ${id}`,
    position: { x: 0, y: 0 },
    properties: {
      strategy: 'ringall',
      timeout: 15,
      maxWaitTime: 120,
      joinEmpty: 'yes',
      leaveWhenEmpty: 'no',
      ...overrides,
    },
  };
}

export function voicemailNode(id: string, mailbox: string): VoicemailNode {
  return {
    id,
    type: 'voicemail',
    label: `VM ${mailbox}`,
    position: { x: 0, y: 0 },
    properties: { mailbox, attachAudio: false },
  };
}

export function topology(partial: Partial<Topology> = {}): Topology {
  return {
    id: 'topo-test',
    name: 'Test',
    nodes: [],
    edges: [],
    memberships: [],
    ...partial,
  };
}
