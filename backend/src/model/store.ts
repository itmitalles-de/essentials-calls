import fs from 'fs';
import path from 'path';
import { Topology } from '@visual-pbx/shared';

const DATA_DIR = process.env.DATA_DIR ?? path.join(__dirname, '..', '..', 'data');
const TOPOLOGY_FILE = path.join(DATA_DIR, 'topology.json');

const SEED_TOPOLOGY: Topology = {
  id: 'topo-1',
  name: 'Kleine Büroanlage',
  description: 'Beispiel-Topologie aus der PoC-Spezifikation',
  nodes: [
    {
      id: 'ext-101',
      type: 'extension',
      label: 'Alice',
      position: { x: 100, y: 200 },
      properties: {
        number: '101',
        sipUser: '101',
        sipPassword: 'alice123',
        voicemail: { enabled: true, mailbox: '101', pin: '1234' },
      },
    },
    {
      id: 'ext-102',
      type: 'extension',
      label: 'Bob',
      position: { x: 300, y: 200 },
      properties: {
        number: '102',
        sipUser: '102',
        sipPassword: 'bob123',
        voicemail: { enabled: false, mailbox: '102' },
      },
    },
    {
      id: 'group-support',
      type: 'ringgroup',
      label: 'Support',
      position: { x: 200, y: 400 },
      properties: { strategy: 'ringall', ringTimeout: 10 },
    },
    {
      id: 'ivr-welcome',
      type: 'ivr',
      label: 'Willkommens-IVR',
      position: { x: 200, y: 100 },
      properties: { greeting: 'welcome', timeout: 5, invalidRetries: 2 },
    },
  ],
  edges: [
    { id: 'edge-1', source: 'ivr-welcome', target: 'ext-101', condition: { type: 'digit', value: '1' } },
    { id: 'edge-2', source: 'ivr-welcome', target: 'group-support', condition: { type: 'digit', value: '2' } },
    { id: 'edge-3', source: 'ivr-welcome', target: 'ext-102', condition: { type: 'timeout' } },
  ],
  memberships: [
    { id: 'mem-1', groupId: 'group-support', memberId: 'ext-101', role: 'member', position: 1 },
    { id: 'mem-2', groupId: 'group-support', memberId: 'ext-102', role: 'member', position: 2 },
  ],
};

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export function loadTopology(): Topology {
  ensureDataDir();
  if (!fs.existsSync(TOPOLOGY_FILE)) {
    fs.writeFileSync(TOPOLOGY_FILE, JSON.stringify(SEED_TOPOLOGY, null, 2));
    return SEED_TOPOLOGY;
  }
  const raw = fs.readFileSync(TOPOLOGY_FILE, 'utf-8');
  return JSON.parse(raw) as Topology;
}

export function saveTopology(topology: Topology): void {
  ensureDataDir();
  fs.writeFileSync(TOPOLOGY_FILE, JSON.stringify(topology, null, 2));
}
