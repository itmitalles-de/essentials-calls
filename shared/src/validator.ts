import {
  DISABLED_NODE_TYPES,
  Edge,
  ENTRYPOINT_BASE,
  ExtensionNode,
  NodeType,
  PbxNode,
  ScheduleNode,
  Topology,
} from './types';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  membershipId?: string;
}

export interface ValidationOptions {
  /**
   * Complete inventory of playable references, including built-in prompts.
   * Omit only for purely structural/offline validation.
   */
  soundReferences?: ReadonlySet<string>;
}

// Allowed source -> target node type transitions, per the PoC edge rules table.
// voicemail/trunk/external are intentionally absent as sources (no outgoing edges / disabled).
const ALLOWED_TRANSITIONS: Partial<Record<NodeType, ReadonlySet<NodeType>>> = {
  extension: new Set<NodeType>(['ivr', 'ringgroup', 'queue', 'schedule', 'voicemail']),
  ivr: new Set<NodeType>(['extension', 'ringgroup', 'queue', 'schedule', 'voicemail']),
  ringgroup: new Set<NodeType>(['extension', 'ivr', 'queue', 'schedule', 'voicemail']),
  queue: new Set<NodeType>(['extension', 'ivr', 'schedule', 'voicemail']),
  schedule: new Set<NodeType>(['extension', 'ivr', 'ringgroup', 'queue', 'schedule', 'voicemail']),
};

// Guard against pathological graphs: simple-cycle enumeration is exponential in
// the worst case, so we stop exploring after this many cycles and report that
// the check was incomplete rather than hanging the request.
const MAX_CYCLES_EXPLORED = 5000;

export function isTransitionAllowed(sourceType: NodeType, targetType: NodeType): boolean {
  const allowedTargets = ALLOWED_TRANSITIONS[sourceType];
  return allowedTargets ? allowedTargets.has(targetType) : false;
}

function nodeById(topology: Topology, id: string): PbxNode | undefined {
  return topology.nodes.find((n) => n.id === id);
}

function outgoing(topology: Topology, id: string): Edge[] {
  return topology.edges.filter((edge) => edge.source === id);
}

function isExitCondition(edge: Edge): boolean {
  return edge.condition?.type === 'timeout' || edge.condition?.type === 'invalid';
}

/**
 * Structural check that runs before any rule validation. The API accepts
 * arbitrary JSON, so every field the rules below dereference has to be proven
 * to exist first — otherwise a malformed request throws inside a route handler.
 */
export function validateTopologyShape(input: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const bad = (code: string, message: string) => issues.push({ severity: 'error', code, message });

  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    bad('malformed-topology', 'Topologie muss ein Objekt sein.');
    return issues;
  }
  const t = input as Record<string, unknown>;

  if (typeof t.id !== 'string') bad('malformed-topology', 'Feld "id" fehlt oder ist kein String.');
  if (typeof t.name !== 'string') bad('malformed-topology', 'Feld "name" fehlt oder ist kein String.');

  for (const key of ['nodes', 'edges', 'memberships'] as const) {
    if (!Array.isArray(t[key])) bad('malformed-topology', `Feld "${key}" fehlt oder ist kein Array.`);
  }
  if (issues.length > 0) return issues;

  if ((t.nodes as unknown[]).length > 1000) bad('topology-too-complex', 'Topologie darf höchstens 1000 Nodes enthalten.');
  if ((t.edges as unknown[]).length > 5000) bad('topology-too-complex', 'Topologie darf höchstens 5000 Kanten enthalten.');
  if ((t.memberships as unknown[]).length > 5000) bad('topology-too-complex', 'Topologie darf höchstens 5000 Memberships enthalten.');

  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  const isString = (value: unknown, max = 1024): value is string => typeof value === 'string' && value.length <= max;
  const isNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

  (t.nodes as unknown[]).forEach((n, i) => {
    if (typeof n !== 'object' || n === null) {
      bad('malformed-node', `nodes[${i}] ist kein Objekt.`);
      return;
    }
    const node = n as Record<string, unknown>;
    if (!isString(node.id, 128)) bad('malformed-node', `nodes[${i}].id fehlt, ist zu lang oder ist kein String.`);
    if (!isString(node.type, 32) || !['extension', 'ivr', 'ringgroup', 'queue', 'schedule', 'voicemail', 'trunk', 'external'].includes(node.type)) {
      bad('malformed-node', `nodes[${i}].type ist unbekannt.`);
    }
    if (!isString(node.label, 200)) bad('malformed-node', `nodes[${i}].label fehlt, ist zu lang oder ist kein String.`);
    if (!isRecord(node.properties)) {
      bad('malformed-node', `nodes[${i}].properties fehlt oder ist kein Objekt.`);
      return;
    }
    if (node.position !== undefined) {
      if (!isRecord(node.position) || !isNumber(node.position.x) || !isNumber(node.position.y)) {
        bad('malformed-node', `nodes[${i}].position ist ungültig.`);
      }
    }

    const properties = node.properties;
    switch (node.type) {
      case 'extension':
        if (!isString(properties.number, 32) || !isString(properties.sipUser, 128)) {
          bad('malformed-node', `nodes[${i}] hat ungültige Extension-Felder.`);
        }
        if (properties.sipPassword !== undefined && !isString(properties.sipPassword, 256)) {
          bad('malformed-node', `nodes[${i}].properties.sipPassword ist ungültig.`);
        }
        if (
          properties.sipSecret !== undefined &&
          (!isRecord(properties.sipSecret) || typeof properties.sipSecret.configured !== 'boolean')
        ) {
          bad('malformed-node', `nodes[${i}].properties.sipSecret ist ungültig.`);
        }
        if (properties.voicemail !== undefined) {
          const vm = properties.voicemail;
          if (!isRecord(vm) || typeof vm.enabled !== 'boolean' || !isString(vm.mailbox, 64)) {
            bad('malformed-node', `nodes[${i}].properties.voicemail ist ungültig.`);
          }
        }
        break;
      case 'ivr':
        if (!isString(properties.greeting, 256) || !isNumber(properties.timeout) || !isNumber(properties.invalidRetries)) {
          bad('malformed-node', `nodes[${i}] hat ungültige IVR-Felder.`);
        }
        break;
      case 'ringgroup':
        if (!isString(properties.strategy, 32) || !isNumber(properties.ringTimeout)) {
          bad('malformed-node', `nodes[${i}] hat ungültige Ringgruppen-Felder.`);
        }
        break;
      case 'queue':
        if (
          !isString(properties.strategy, 32) ||
          !isNumber(properties.timeout) ||
          !isNumber(properties.maxWaitTime) ||
          !isString(properties.joinEmpty, 16) ||
          !isString(properties.leaveWhenEmpty, 16)
        ) {
          bad('malformed-node', `nodes[${i}] hat ungültige Queue-Felder.`);
        }
        break;
      case 'schedule':
        if (!isString(properties.timezone, 128) || !Array.isArray(properties.windows) || !Array.isArray(properties.holidays)) {
          bad('malformed-node', `nodes[${i}] hat ungültige Zeitplan-Felder.`);
          break;
        }
        properties.windows.forEach((window, windowIndex) => {
          if (
            !isRecord(window) ||
            !isString(window.id, 128) ||
            !Array.isArray(window.weekdays) ||
            !isString(window.start, 5) ||
            !isString(window.end, 5)
          ) {
            bad('malformed-node', `nodes[${i}].properties.windows[${windowIndex}] ist ungültig.`);
          }
        });
        if (properties.holidays.some((holiday) => !isString(holiday, 10))) {
          bad('malformed-node', `nodes[${i}].properties.holidays ist ungültig.`);
        }
        break;
      case 'voicemail':
        if (!isString(properties.mailbox, 64) || typeof properties.attachAudio !== 'boolean') {
          bad('malformed-node', `nodes[${i}] hat ungültige Voicemail-Felder.`);
        }
        break;
    }
  });

  (t.edges as unknown[]).forEach((e, i) => {
    if (typeof e !== 'object' || e === null) {
      bad('malformed-edge', `edges[${i}] ist kein Objekt.`);
      return;
    }
    const edge = e as Record<string, unknown>;
    if (typeof edge.id !== 'string') bad('malformed-edge', `edges[${i}].id fehlt oder ist kein String.`);
    if (typeof edge.source !== 'string') bad('malformed-edge', `edges[${i}].source fehlt oder ist kein String.`);
    if (typeof edge.target !== 'string') bad('malformed-edge', `edges[${i}].target fehlt oder ist kein String.`);
    if (edge.condition !== undefined) {
      if (!isRecord(edge.condition) || !isString(edge.condition.type, 32) || !['digit', 'timeout', 'invalid', 'open', 'closed', 'unconditional'].includes(edge.condition.type)) {
        bad('malformed-edge', `edges[${i}].condition ist ungültig.`);
      } else if (edge.condition.type === 'digit' && !isString(edge.condition.value, 1)) {
        bad('malformed-edge', `edges[${i}].condition.value ist ungültig.`);
      }
    }
  });

  (t.memberships as unknown[]).forEach((m, i) => {
    if (typeof m !== 'object' || m === null) {
      bad('malformed-membership', `memberships[${i}] ist kein Objekt.`);
      return;
    }
    const membership = m as Record<string, unknown>;
    if (typeof membership.id !== 'string') bad('malformed-membership', `memberships[${i}].id fehlt oder ist kein String.`);
    if (typeof membership.groupId !== 'string') bad('malformed-membership', `memberships[${i}].groupId fehlt oder ist kein String.`);
    if (typeof membership.memberId !== 'string') bad('malformed-membership', `memberships[${i}].memberId fehlt oder ist kein String.`);
    if (membership.role !== 'member' && membership.role !== 'agent') {
      bad('malformed-membership', `memberships[${i}].role ist ungültig.`);
    }
  });

  return issues;
}

export function validateTopology(topology: Topology, options: ValidationOptions = {}): ValidationIssue[] {
  const shapeIssues = validateTopologyShape(topology);
  if (shapeIssues.length > 0) return shapeIssues;

  const issues: ValidationIssue[] = [];

  issues.push(...validateNodes(topology, options));
  issues.push(...validateEdges(topology));
  issues.push(...validateMemberships(topology));
  issues.push(...validateGroupsHaveMembers(topology));
  issues.push(...findUnsafeCycles(topology));

  return issues;
}

function validateNodes(topology: Topology, options: ValidationOptions): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenNodeIds = new Set<string>();
  const numberOwners = new Map<string, string>();
  const sipUserOwners = new Map<string, string>();
  const generatedSipOwners = new Map<string, string>();
  const generatedNodeOwners = new Map<string, string>();
  const mailboxOwners = new Map<string, string>();

  for (const node of topology.nodes) {
    if (seenNodeIds.has(node.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-node-id',
        message: `Node-ID "${node.id}" ist mehrfach vergeben.`,
        nodeId: node.id,
      });
    }
    seenNodeIds.add(node.id);

    const generatedNodeName = node.id.replace(/[^A-Za-z0-9_]/g, '_');
    if (!generatedNodeName || generatedNodeOwners.has(generatedNodeName)) {
      issues.push({
        severity: 'error',
        code: 'generated-node-name-collision',
        message: `Node-ID "${node.id}" kollidiert nach Asterisk-Normalisierung mit "${generatedNodeOwners.get(generatedNodeName) ?? ''}".`,
        nodeId: node.id,
      });
    } else {
      generatedNodeOwners.set(generatedNodeName, node.id);
    }

    if (DISABLED_NODE_TYPES.has(node.type)) {
      issues.push({
        severity: 'error',
        code: 'disabled-node-type',
        message: `Node-Typ "${node.type}" ist im PoC deaktiviert (reserviert für später).`,
        nodeId: node.id,
      });
    }

    if (node.type === 'extension') {
      const ext = node as ExtensionNode;
      const number = ext.properties.number;

      // Two extensions on the same number would produce conflicting dialplan
      // entries in [internal]; Asterisk keeps the first and ignores the rest.
      if (!number || !/^[0-9]+$/.test(number)) {
        issues.push({
          severity: 'error',
          code: 'invalid-extension-number',
          message: `Extension "${ext.label}" hat keine gültige Nummer (nur Ziffern erlaubt).`,
          nodeId: node.id,
        });
      } else if (number === '110' || number === '112') {
        issues.push({
          severity: 'error',
          code: 'reserved-emergency-number',
          message: `Nummer "${number}" ist als Notrufnummer reserviert und wird von diesem PoC weder intern noch extern geroutet.`,
          nodeId: node.id,
        });
      } else if (numberOwners.has(number)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-extension-number',
          message: `Nummer "${number}" wird von mehreren Extensions verwendet ("${numberOwners.get(number)}" und "${ext.label}").`,
          nodeId: node.id,
        });
      } else {
        numberOwners.set(number, ext.label);

        // Generated test entry points live at ENTRYPOINT_BASE + node index. An
        // extension on the same number shadows the entry point, because the
        // extension is defined directly in [internal] and wins over the include.
        const numeric = Number(number);
        if (numeric >= ENTRYPOINT_BASE && numeric < ENTRYPOINT_BASE + topology.nodes.length) {
          issues.push({
            severity: 'warning',
            code: 'entrypoint-collision',
            message: `Nummer "${number}" überschneidet sich mit den generierten Test-Entry-Points (${ENTRYPOINT_BASE}–${
              ENTRYPOINT_BASE + topology.nodes.length - 1
            }); der Entry-Point ist dann nicht erreichbar.`,
            nodeId: node.id,
          });
        }
      }

      if (!ext.properties.sipPassword && !ext.properties.sipSecret?.configured) {
        issues.push({
          severity: 'warning',
          code: 'missing-sip-password',
          message: `Extension "${ext.label}" hat kein SIP-Passwort; das Gerät kann sich nicht registrieren.`,
          nodeId: node.id,
        });
      }

      // The SIP user becomes the PJSIP endpoint name, which is what Asterisk
      // matches an incoming registration against. Two extensions sharing one
      // would collapse into a single endpoint.
      const sipUser = ext.properties.sipUser;
      if (!sipUser || !/^[A-Za-z0-9_.@+-]+$/.test(sipUser)) {
        issues.push({
          severity: 'error',
          code: 'missing-sip-user',
          message: `Extension "${ext.label}" hat keinen sicheren SIP-User (erlaubt: Buchstaben, Ziffern, . _ @ + -).`,
          nodeId: node.id,
        });
      } else if (sipUserOwners.has(sipUser)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-sip-user',
          message: `SIP-User "${sipUser}" wird von mehreren Extensions verwendet ("${sipUserOwners.get(sipUser)}" und "${ext.label}").`,
          nodeId: node.id,
        });
      } else {
        sipUserOwners.set(sipUser, ext.label);
        const generatedSipName = sipUser.replace(/[^A-Za-z0-9_]/g, '_');
        if (generatedSipOwners.has(generatedSipName)) {
          issues.push({
            severity: 'error',
            code: 'generated-sip-name-collision',
            message: `SIP-User "${sipUser}" kollidiert nach Asterisk-Normalisierung mit "${generatedSipOwners.get(generatedSipName)}".`,
            nodeId: node.id,
          });
        } else {
          generatedSipOwners.set(generatedSipName, sipUser);
        }
      }

      const vm = ext.properties.voicemail;
      if (vm?.enabled) {
        issues.push(...checkMailbox(mailboxOwners, vm.mailbox, ext.label, node.id));
      }
    }

    if (node.type === 'voicemail') {
      issues.push(...checkMailbox(mailboxOwners, node.properties.mailbox, node.label, node.id));
    }

    if (node.type === 'ivr') {
      if (!node.properties.greeting) {
        issues.push({
          severity: 'error',
          code: 'ivr-missing-greeting',
          message: `IVR "${node.label}" hat keine Begrüßungsdatei.`,
          nodeId: node.id,
        });
      }
      if (node.properties.greeting && (!/^[A-Za-z0-9_/-]+$/.test(node.properties.greeting) || node.properties.greeting.includes('..') || node.properties.greeting.startsWith('/'))) {
        issues.push({
          severity: 'error',
          code: 'ivr-invalid-greeting',
          message: `IVR "${node.label}" hat eine unsichere Ansagenreferenz.`,
          nodeId: node.id,
        });
      }
      if (!Number.isInteger(node.properties.timeout) || node.properties.timeout < 1 || node.properties.timeout > 120) {
        issues.push({ severity: 'error', code: 'ivr-invalid-timeout', message: `IVR "${node.label}": Timeout muss 1–120 Sekunden betragen.`, nodeId: node.id });
      }
      if (
        node.properties.greeting &&
        options.soundReferences &&
        !options.soundReferences.has(node.properties.greeting)
      ) {
        issues.push({
          severity: 'error',
          code: 'ivr-greeting-not-found',
          message: `IVR "${node.label}" referenziert die nicht vorhandene Ansage "${node.properties.greeting}".`,
          nodeId: node.id,
        });
      }
      if (node.properties.invalidRetries < 1) {
        issues.push({
          severity: 'error',
          code: 'ivr-invalid-retries',
          message: `IVR "${node.label}": invalidRetries muss mindestens 1 sein.`,
          nodeId: node.id,
        });
      }
    }

    if (node.type === 'schedule') {
      issues.push(...validateScheduleNode(node));
    }

    if (node.type === 'ringgroup') {
      if (!['ringall', 'roundrobin', 'leastrecent', 'fewestcalls', 'random'].includes(node.properties.strategy)) {
        issues.push({ severity: 'error', code: 'invalid-ring-strategy', message: `Ringgruppe "${node.label}" hat eine unbekannte Strategie.`, nodeId: node.id });
      }
      if (!Number.isInteger(node.properties.ringTimeout) || node.properties.ringTimeout < 1 || node.properties.ringTimeout > 300) {
        issues.push({ severity: 'error', code: 'invalid-ring-timeout', message: `Ringgruppe "${node.label}": Timeout muss 1–300 Sekunden betragen.`, nodeId: node.id });
      }
    }

    if (node.type === 'queue') {
      if (!['ringall', 'roundrobin', 'leastrecent', 'fewestcalls', 'random', 'rrmemory'].includes(node.properties.strategy)) {
        issues.push({ severity: 'error', code: 'invalid-queue-strategy', message: `Queue "${node.label}" hat eine unbekannte Strategie.`, nodeId: node.id });
      }
      if (!['yes', 'no', 'strict'].includes(node.properties.joinEmpty) || !['yes', 'no'].includes(node.properties.leaveWhenEmpty)) {
        issues.push({ severity: 'error', code: 'invalid-queue-empty-policy', message: `Queue "${node.label}" hat eine unbekannte Empty-Policy.`, nodeId: node.id });
      }
      if (!Number.isInteger(node.properties.timeout) || node.properties.timeout < 1 || node.properties.timeout > 300 || !Number.isInteger(node.properties.maxWaitTime) || node.properties.maxWaitTime < 1 || node.properties.maxWaitTime > 3600) {
        issues.push({ severity: 'error', code: 'invalid-queue-timeout', message: `Queue "${node.label}" hat ungültige Timeout-Werte.`, nodeId: node.id });
      }
    }
  }

  return issues;
}

function validTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

function timeMinutes(value: string): number | undefined {
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return undefined;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return undefined;
  return hours * 60 + minutes;
}

function windowSegments(window: ScheduleNode['properties']['windows'][number]): Array<{
  day: number;
  start: number;
  end: number;
}> {
  const start = timeMinutes(window.start);
  const end = timeMinutes(window.end);
  if (start === undefined || end === undefined || start === end) return [];
  const segments: Array<{ day: number; start: number; end: number }> = [];
  for (const day of window.weekdays) {
    if (start < end) {
      segments.push({ day, start, end });
    } else {
      segments.push({ day, start, end: 24 * 60 });
      segments.push({ day: day === 7 ? 1 : day + 1, start: 0, end });
    }
  }
  return segments;
}

function validateScheduleNode(node: ScheduleNode): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!node.properties.timezone || !validTimezone(node.properties.timezone)) {
    issues.push({
      severity: 'error',
      code: 'schedule-invalid-timezone',
      message: `Zeitplan "${node.label}" hat keine gültige IANA-Zeitzone.`,
      nodeId: node.id,
    });
  }
  if (!Array.isArray(node.properties.windows) || node.properties.windows.length === 0) {
    issues.push({
      severity: 'error',
      code: 'schedule-without-windows',
      message: `Zeitplan "${node.label}" hat keine Öffnungszeit.`,
      nodeId: node.id,
    });
  }

  const ids = new Set<string>();
  const segments: Array<{ id: string; day: number; start: number; end: number }> = [];
  for (const window of node.properties.windows ?? []) {
    if (!window || typeof window.id !== 'string' || ids.has(window.id)) {
      issues.push({
        severity: 'error',
        code: 'schedule-invalid-window-id',
        message: `Zeitplan "${node.label}" enthält eine fehlende oder doppelte Zeitfenster-ID.`,
        nodeId: node.id,
      });
    }
    ids.add(window?.id);
    const start = timeMinutes(window?.start);
    const end = timeMinutes(window?.end);
    if (start === undefined || end === undefined || start === end) {
      issues.push({
        severity: 'error',
        code: 'schedule-invalid-time-window',
        message: `Zeitfenster "${window?.id ?? '?'}" braucht unterschiedliche Uhrzeiten im Format HH:MM.`,
        nodeId: node.id,
      });
    }
    const weekdays = window?.weekdays;
    if (!Array.isArray(weekdays) || weekdays.length === 0 || weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
      issues.push({
        severity: 'error',
        code: 'schedule-invalid-weekdays',
        message: `Zeitfenster "${window?.id ?? '?'}" braucht mindestens einen gültigen Wochentag (1–7).`,
        nodeId: node.id,
      });
    } else {
      for (const segment of windowSegments(window)) segments.push({ id: window.id, ...segment });
    }
  }

  for (let left = 0; left < segments.length; left++) {
    for (let right = left + 1; right < segments.length; right++) {
      const a = segments[left];
      const b = segments[right];
      if (a.id !== b.id && a.day === b.day && a.start < b.end && b.start < a.end) {
        issues.push({
          severity: 'error',
          code: 'schedule-overlapping-windows',
          message: `Zeitplan "${node.label}" enthält überlappende Fenster "${a.id}" und "${b.id}".`,
          nodeId: node.id,
        });
        left = segments.length;
        break;
      }
    }
  }

  const dates = new Set<string>();
  for (const holiday of node.properties.holidays ?? []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(holiday) || Number.isNaN(Date.parse(`${holiday}T00:00:00Z`))) {
      issues.push({
        severity: 'error',
        code: 'schedule-invalid-holiday',
        message: `Feiertag "${holiday}" ist kein gültiges Datum im Format YYYY-MM-DD.`,
        nodeId: node.id,
      });
    } else if (dates.has(holiday)) {
      issues.push({
        severity: 'error',
        code: 'schedule-duplicate-holiday',
        message: `Feiertag "${holiday}" ist doppelt eingetragen.`,
        nodeId: node.id,
      });
    }
    dates.add(holiday);
  }
  return issues;
}

function checkMailbox(
  owners: Map<string, string>,
  mailbox: string | undefined,
  label: string,
  nodeId: string
): ValidationIssue[] {
  if (!mailbox) {
    return [
      {
        severity: 'error',
        code: 'missing-mailbox',
        message: `"${label}" hat Voicemail aktiviert, aber keine Mailbox-Nummer.`,
        nodeId,
      },
    ];
  }
  if (!/^[0-9]+$/.test(mailbox)) {
    return [{ severity: 'error', code: 'invalid-mailbox', message: `Mailbox "${mailbox}" von "${label}" darf nur Ziffern enthalten.`, nodeId }];
  }
  if (owners.has(mailbox)) {
    return [
      {
        severity: 'error',
        code: 'duplicate-mailbox',
        message: `Mailbox "${mailbox}" wird mehrfach verwendet ("${owners.get(mailbox)}" und "${label}").`,
        nodeId,
      },
    ];
  }
  owners.set(mailbox, label);
  return [];
}

function validateEdges(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenEdgeIds = new Set<string>();

  // Per source node: which digits are already taken, and whether a
  // timeout/invalid/unconditional branch already exists. Asterisk can only
  // route one of each, so duplicates make the callflow ambiguous.
  const digitsBySource = new Map<string, Map<string, string>>();
  const singletonBySource = new Map<string, Map<string, string>>();

  for (const edge of topology.edges) {
    if (seenEdgeIds.has(edge.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-edge-id',
        message: `Edge-ID "${edge.id}" ist mehrfach vergeben.`,
        edgeId: edge.id,
      });
    }
    seenEdgeIds.add(edge.id);

    const source = nodeById(topology, edge.source);
    const target = nodeById(topology, edge.target);

    if (!source) {
      issues.push({
        severity: 'error',
        code: 'edge-unknown-source',
        message: `Edge "${edge.id}" referenziert unbekannten Source-Node "${edge.source}".`,
        edgeId: edge.id,
      });
      continue;
    }
    if (!target) {
      issues.push({
        severity: 'error',
        code: 'edge-unknown-target',
        message: `Edge "${edge.id}" referenziert unbekannten Target-Node "${edge.target}".`,
        edgeId: edge.id,
      });
      continue;
    }

    if (edge.source === edge.target) {
      issues.push({
        severity: 'error',
        code: 'self-loop',
        message: `Edge "${edge.id}" verbindet "${source.label}" mit sich selbst.`,
        edgeId: edge.id,
      });
      continue;
    }

    if (source.type === 'voicemail') {
      issues.push({
        severity: 'error',
        code: 'voicemail-outgoing-edge',
        message: `Voicemail-Node "${source.id}" darf keine ausgehenden Kanten haben.`,
        edgeId: edge.id,
        nodeId: source.id,
      });
      continue;
    }

    if (!isTransitionAllowed(source.type, target.type)) {
      issues.push({
        severity: 'error',
        code: 'invalid-transition',
        message: `Kante ${source.type} → ${target.type} ist nicht erlaubt (Edge "${edge.id}").`,
        edgeId: edge.id,
      });
    }

    const condition = edge.condition ?? { type: 'unconditional' as const };

    if (source.type === 'schedule' && condition.type !== 'open' && condition.type !== 'closed') {
      issues.push({
        severity: 'error',
        code: 'schedule-invalid-condition',
        message: `Zeitplan "${source.label}" erlaubt nur die Ausgänge "open" und "closed".`,
        edgeId: edge.id,
        nodeId: source.id,
      });
    }
    if (source.type !== 'schedule' && (condition.type === 'open' || condition.type === 'closed')) {
      issues.push({
        severity: 'error',
        code: 'schedule-condition-on-non-schedule',
        message: `Die Bedingung "${condition.type}" ist nur an einem Zeitplan erlaubt.`,
        edgeId: edge.id,
      });
    }

    if (condition.type === 'digit') {
      if (!/^[0-9*#]$/.test(condition.value)) {
        issues.push({
          severity: 'error',
          code: 'invalid-digit-condition',
          message: `Edge "${edge.id}" hat eine ungültige Ziffer-Condition "${condition.value}".`,
          edgeId: edge.id,
        });
      } else {
        const taken = digitsBySource.get(edge.source) ?? new Map<string, string>();
        if (taken.has(condition.value)) {
          issues.push({
            severity: 'error',
            code: 'duplicate-digit-condition',
            message: `"${source.label}" hat zwei Kanten für Ziffer "${condition.value}" (${taken.get(condition.value)} und ${edge.id}).`,
            edgeId: edge.id,
          });
        } else {
          taken.set(condition.value, edge.id);
          digitsBySource.set(edge.source, taken);
        }
      }

      if (source.type !== 'ivr') {
        issues.push({
          severity: 'error',
          code: 'digit-condition-on-non-ivr',
          message: `Ziffer-Bedingungen sind nur an IVR-Nodes sinnvoll, "${source.label}" ist ein ${source.type}.`,
          edgeId: edge.id,
        });
      }
    } else {
      if (condition.type === 'invalid' && source.type !== 'ivr') {
        issues.push({
          severity: 'error',
          code: 'invalid-condition-on-non-ivr',
          message: `Die Bedingung "invalid" entsteht nur bei IVR-Fehleingaben, "${source.label}" ist ein ${source.type}.`,
          edgeId: edge.id,
        });
      }

      const taken = singletonBySource.get(edge.source) ?? new Map<string, string>();
      if (taken.has(condition.type)) {
        issues.push({
          severity: 'error',
          code: 'duplicate-condition',
          message: `"${source.label}" hat zwei "${condition.type}"-Kanten (${taken.get(condition.type)} und ${edge.id}); das Ziel wäre nicht eindeutig.`,
          edgeId: edge.id,
        });
      } else {
        taken.set(condition.type, edge.id);
        singletonBySource.set(edge.source, taken);
      }
    }
  }

  const outgoingCount = new Map<string, number>();
  for (const edge of topology.edges) {
    outgoingCount.set(edge.source, (outgoingCount.get(edge.source) ?? 0) + 1);
  }

  for (const node of topology.nodes) {
    if (node.type === 'ivr') {
      // An IVR whose only branches are timeout/invalid can never be navigated.
      const digits = digitsBySource.get(node.id);
      if (!digits || digits.size === 0) {
        issues.push({
          severity: 'warning',
          code: 'ivr-without-options',
          message: `IVR "${node.label}" hat keine Ziffern-Auswahl; Anrufer können nur ins Timeout laufen.`,
          nodeId: node.id,
        });
      }
      continue;
    }

    if (node.type === 'schedule') {
      const conditions = new Set(outgoing(topology, node.id).map((edge) => edge.condition?.type ?? 'unconditional'));
      for (const required of ['open', 'closed'] as const) {
        if (!conditions.has(required)) {
          issues.push({
            severity: 'error',
            code: `schedule-missing-${required}-edge`,
            message: `Zeitplan "${node.label}" braucht einen Ausgang "${required}".`,
            nodeId: node.id,
          });
        }
      }
      if ((outgoingCount.get(node.id) ?? 0) !== 2) {
        issues.push({
          severity: 'error',
          code: 'schedule-ambiguous-outputs',
          message: `Zeitplan "${node.label}" braucht genau einen offenen und einen geschlossenen Ausgang.`,
          nodeId: node.id,
        });
      }
      continue;
    }

    // Extensions, ring groups and queues have exactly one meaningful successor:
    // where the call goes when nobody picks up. The generator uses a single
    // fallback edge, so any further edge would be silently dropped.
    if (node.type !== 'voicemail' && (outgoingCount.get(node.id) ?? 0) > 1) {
      issues.push({
        severity: 'error',
        code: 'ambiguous-fallback',
        message: `"${node.label}" (${node.type}) hat mehrere ausgehende Kanten. Nur eine Fallback-Kante ist erlaubt.`,
        nodeId: node.id,
      });
    }
  }

  return issues;
}

function validateMemberships(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const membershipIds = new Set<string>();
  const pairs = new Set<string>();

  for (const membership of topology.memberships) {
    if (membershipIds.has(membership.id)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-membership-id',
        message: `Membership-ID "${membership.id}" ist mehrfach vergeben.`,
        membershipId: membership.id,
      });
    }
    membershipIds.add(membership.id);

    const pairKey = `${membership.groupId}\\0${membership.memberId}`;
    if (pairs.has(pairKey)) {
      issues.push({
        severity: 'error',
        code: 'duplicate-membership',
        message: `Membership "${membership.id}": diese Extension ist bereits Mitglied dieser Gruppe.`,
        membershipId: membership.id,
      });
    }
    pairs.add(pairKey);

    const group = nodeById(topology, membership.groupId);
    const member = nodeById(topology, membership.memberId);

    if (!group || (group.type !== 'ringgroup' && group.type !== 'queue')) {
      issues.push({
        severity: 'error',
        code: 'membership-invalid-group',
        message: `Membership "${membership.id}": groupId "${membership.groupId}" ist keine RingGroup/Queue.`,
        membershipId: membership.id,
      });
    }
    if (!member || member.type !== 'extension') {
      issues.push({
        severity: 'error',
        code: 'membership-invalid-member',
        message: `Membership "${membership.id}": memberId "${membership.memberId}" ist keine Extension.`,
        membershipId: membership.id,
      });
    }
  }

  return issues;
}

function validateGroupsHaveMembers(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const memberCount = new Map<string, number>();
  for (const m of topology.memberships) {
    memberCount.set(m.groupId, (memberCount.get(m.groupId) ?? 0) + 1);
  }

  for (const node of topology.nodes) {
    if (node.type !== 'ringgroup' && node.type !== 'queue') continue;
    if ((memberCount.get(node.id) ?? 0) === 0) {
      // A group without members cannot produce a usable Dial()/Queue() target.
      issues.push({
        severity: 'error',
        code: 'group-without-members',
        message: `${node.type === 'queue' ? 'Queue' : 'Ring Group'} "${node.label}" hat keine Mitglieder.`,
        nodeId: node.id,
      });
    }
  }

  return issues;
}

/**
 * Enumerates simple cycles and reports those without an exit condition.
 *
 * A plain back-edge DFS is not enough here: it finds only one representative
 * cycle per back edge, so an exit-less cycle can hide behind a sibling cycle
 * that happens to have an exit. We therefore enumerate simple cycles directly,
 * using the standard "only visit nodes at or after the start index" trick to
 * emit each cycle exactly once, with a hard cap for pathological graphs.
 */
function findUnsafeCycles(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const order = topology.nodes.map((n) => n.id);
  const index = new Map(order.map((id, i) => [id, i]));

  const outgoing = new Map<string, Edge[]>();
  for (const edge of topology.edges) {
    if (!index.has(edge.source) || !index.has(edge.target)) continue;
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge);
  }

  const reported = new Set<string>();
  let explored = 0;
  let truncated = false;

  for (let startIdx = 0; startIdx < order.length; startIdx++) {
    const start = order[startIdx];
    const onPath = new Set<string>([start]);
    const pathEdges: Edge[] = [];

    const walk = (current: string) => {
      if (truncated) return;
      for (const edge of outgoing.get(current) ?? []) {
        const targetIdx = index.get(edge.target)!;
        // Nodes before the start index already had their cycles enumerated.
        if (targetIdx < startIdx) continue;

        if (edge.target === start) {
          explored++;
          if (explored > MAX_CYCLES_EXPLORED) {
            truncated = true;
            return;
          }
          const cycleEdges = [...pathEdges, edge];
          const key = cycleEdges
            .map((e) => e.id)
            .sort()
            .join(',');
          if (!reported.has(key)) {
            reported.add(key);
            if (!cycleEdges.some(isExitCondition)) {
              issues.push({
                severity: 'error',
                code: 'infinite-cycle',
                message: `Zyklus ohne Exit-Bedingung: ${cycleEdges
                  .map((e) => e.id)
                  .join(' → ')}. Mindestens eine Kante im Zyklus muss "timeout" oder "invalid" sein.`,
              });
            }
          }
          continue;
        }

        if (onPath.has(edge.target)) continue;

        onPath.add(edge.target);
        pathEdges.push(edge);
        walk(edge.target);
        pathEdges.pop();
        onPath.delete(edge.target);
        if (truncated) return;
      }
    };

    walk(start);
    if (truncated) break;
  }

  if (truncated) {
    issues.push({
      severity: 'warning',
      code: 'cycle-check-truncated',
      message: `Zyklusprüfung abgebrochen: mehr als ${MAX_CYCLES_EXPLORED} Zyklen im Graph. Der Callflow ist vermutlich zu stark verflochten.`,
    });
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
