import { ExtensionNode, TOPOLOGY_SCHEMA_VERSION, Topology, TopologyExport } from './types';

export const MAX_TOPOLOGY_IMPORT_BYTES = 2 * 1024 * 1024;

export interface MigratedTopologyDocument {
  topology: Topology;
  sourceSchemaVersion: number;
  migrated: boolean;
}

/** Detects credentials that must never be accepted in the current export format. */
export function hasPlaintextSipSecrets(topology: Topology): boolean {
  return Array.isArray(topology.nodes) && topology.nodes.some((node) => {
    if (!node || typeof node !== 'object' || node.type !== 'extension') return false;
    const properties = (node as ExtensionNode).properties;
    return !!properties && typeof properties === 'object' && Object.prototype.hasOwnProperty.call(properties, 'sipPassword');
  });
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Removes all reusable SIP credentials from an API/revision/export document. */
export function redactTopology(input: Topology): Topology {
  const topology = clone(input);
  for (const node of topology.nodes) {
    if (node.type !== 'extension') continue;
    const properties = (node as ExtensionNode).properties;
    const configured = !!properties.sipPassword || !!properties.sipSecret?.configured;
    delete properties.sipPassword;
    properties.sipSecret = { configured };
  }
  return topology;
}

export function createTopologyExport(topology: Topology, now = new Date()): TopologyExport {
  return {
    schemaVersion: TOPOLOGY_SCHEMA_VERSION,
    product: 'Essentials+ Calls',
    exportedAt: now.toISOString(),
    redacted: true,
    topology: redactTopology(topology),
  };
}

/**
 * Migrates accepted historical topology documents into schema v2. V1 is either
 * the original raw topology JSON or a `{schemaVersion: 1, topology}` envelope.
 */
export function migrateTopologyDocument(input: unknown): MigratedTopologyDocument {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('Importdatei muss ein JSON-Objekt sein.');
  }
  const record = input as Record<string, unknown>;
  if (!('schemaVersion' in record)) {
    return { topology: clone(input as Topology), sourceSchemaVersion: 1, migrated: true };
  }

  const version = record.schemaVersion;
  if (version === 1) {
    const topology = 'topology' in record ? record.topology : record;
    return { topology: clone(topology as Topology), sourceSchemaVersion: 1, migrated: true };
  }
  if (version === TOPOLOGY_SCHEMA_VERSION) {
    if (!record.topology) throw new Error('Schema-v2-Import enthält keine Topologie.');
    return { topology: clone(record.topology as Topology), sourceSchemaVersion: version, migrated: false };
  }
  throw new Error(`Nicht unterstützte Topologie-Schema-Version: ${String(version)}.`);
}
