import { DISABLED_NODE_TYPES, Edge, ENTRYPOINT_BASE, ExtensionNode, NodeType, PbxNode, Topology } from './types';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
  membershipId?: string;
}

// Allowed source -> target node type transitions, per the PoC edge rules table.
// voicemail/trunk/external are intentionally absent as sources (no outgoing edges / disabled).
const ALLOWED_TRANSITIONS: Partial<Record<NodeType, ReadonlySet<NodeType>>> = {
  extension: new Set<NodeType>(['ivr', 'ringgroup', 'queue', 'voicemail']),
  ivr: new Set<NodeType>(['extension', 'ringgroup', 'queue', 'voicemail']),
  ringgroup: new Set<NodeType>(['extension', 'ivr', 'queue', 'voicemail']),
  queue: new Set<NodeType>(['extension', 'ivr', 'voicemail']),
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

  (t.nodes as unknown[]).forEach((n, i) => {
    if (typeof n !== 'object' || n === null) {
      bad('malformed-node', `nodes[${i}] ist kein Objekt.`);
      return;
    }
    const node = n as Record<string, unknown>;
    if (typeof node.id !== 'string') bad('malformed-node', `nodes[${i}].id fehlt oder ist kein String.`);
    if (typeof node.type !== 'string') bad('malformed-node', `nodes[${i}].type fehlt oder ist kein String.`);
    if (typeof node.label !== 'string') bad('malformed-node', `nodes[${i}].label fehlt oder ist kein String.`);
    if (typeof node.properties !== 'object' || node.properties === null) {
      bad('malformed-node', `nodes[${i}].properties fehlt oder ist kein Objekt.`);
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
  });

  return issues;
}

export function validateTopology(topology: Topology): ValidationIssue[] {
  const shapeIssues = validateTopologyShape(topology);
  if (shapeIssues.length > 0) return shapeIssues;

  const issues: ValidationIssue[] = [];

  issues.push(...validateNodes(topology));
  issues.push(...validateEdges(topology));
  issues.push(...validateMemberships(topology));
  issues.push(...validateGroupsHaveMembers(topology));
  issues.push(...findUnsafeCycles(topology));

  return issues;
}

function validateNodes(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenNodeIds = new Set<string>();
  const numberOwners = new Map<string, string>();
  const sipUserOwners = new Map<string, string>();
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

      if (!ext.properties.sipPassword) {
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
      if (!sipUser) {
        issues.push({
          severity: 'error',
          code: 'missing-sip-user',
          message: `Extension "${ext.label}" hat keinen SIP-User; ohne ihn kann sich kein Gerät registrieren.`,
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
      if (node.properties.invalidRetries < 1) {
        issues.push({
          severity: 'error',
          code: 'ivr-invalid-retries',
          message: `IVR "${node.label}": invalidRetries muss mindestens 1 sein.`,
          nodeId: node.id,
        });
      }
    }
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

    const pairKey = `${membership.groupId} ${membership.memberId}`;
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
