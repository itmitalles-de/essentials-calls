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
          sipSecret: { configured: false },
          voicemail: { enabled: false, mailbox: '100' },
        },
      };
    case 'ivr':
      return {
        id: newId('ivr'),
        type: 'ivr',
        label: 'Neues IVR',
        position,
        // Must name a prompt Asterisk can resolve; "hello-world" ships with the
        // core sounds package.
        properties: { greeting: 'hello-world', timeout: 5, invalidRetries: 2 },
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
    case 'schedule':
      return {
        id: newId('schedule'),
        type: 'schedule',
        label: 'Öffnungszeiten',
        position,
        properties: {
          timezone: 'Europe/Berlin',
          windows: [{ id: newId('window'), weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }],
          holidays: [],
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
