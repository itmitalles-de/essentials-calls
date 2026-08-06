import { NodeType, PbxNode } from '@visual-pbx/shared';

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now().toString(36)}${counter}`;
}

export function createDefaultNode(type: Exclude<NodeType, 'trunk' | 'external'>, position: { x: number; y: number }): PbxNode {
  switch (type) {
    case 'extension':
      return {
        id: newId('ext'),
        type: 'extension',
        label: 'Neue Extension',
        position,
        properties: {
          number: '100',
          sipUser: '100',
          sipPassword: 'changeme',
          voicemail: { enabled: false, mailbox: '100' },
        },
      };
    case 'ivr':
      return {
        id: newId('ivr'),
        type: 'ivr',
        label: 'Neues IVR',
        position,
        properties: { greeting: 'welcome', timeout: 5, invalidRetries: 2 },
      };
    case 'ringgroup':
      return {
        id: newId('group'),
        type: 'ringgroup',
        label: 'Neue Ring Group',
        position,
        properties: { strategy: 'ringall', ringTimeout: 15 },
      };
    case 'queue':
      return {
        id: newId('queue'),
        type: 'queue',
        label: 'Neue Queue',
        position,
        properties: {
          strategy: 'ringall',
          timeout: 15,
          maxWaitTime: 120,
          joinEmpty: 'yes',
          leaveWhenEmpty: 'no',
        },
      };
    case 'voicemail':
      return {
        id: newId('vm'),
        type: 'voicemail',
        label: 'Neue Voicemail',
        position,
        properties: { mailbox: '999', attachAudio: false },
      };
  }
}
