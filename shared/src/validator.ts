import { DISABLED_NODE_TYPES, Edge, Membership, NodeType, PbxNode, Topology } from './types';

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

export function validateTopology(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // --- Duplicate ids ---
  const seenNodeIds = new Set<string>();
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
  }

  const seenEdgeIds = new Set<string>();
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
  }

  // --- Edge endpoint + transition validation ---
  for (const edge of topology.edges) {
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

    if (edge.condition?.type === 'digit' && !/^[0-9*#]$/.test(edge.condition.value)) {
      issues.push({
        severity: 'error',
        code: 'invalid-digit-condition',
        message: `Edge "${edge.id}" hat eine ungültige Ziffer-Condition "${edge.condition.value}".`,
        edgeId: edge.id,
      });
    }
  }

  // --- Membership validation ---
  const membershipIds = new Set<string>();
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

  // --- Cycle detection with mandatory exit condition ---
  issues.push(...findUnsafeCycles(topology));

  return issues;
}

function findUnsafeCycles(topology: Topology): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const outgoing = new Map<string, Edge[]>();
  for (const edge of topology.edges) {
    if (!outgoing.has(edge.source)) outgoing.set(edge.source, []);
    outgoing.get(edge.source)!.push(edge);
  }

  const WHITE = 0;
  const GRAY = 1;
  const BLACK = 2;
  const color = new Map<string, number>();
  const pathEdges: Edge[] = [];
  const pathNodes: string[] = [];
  const reportedCycles = new Set<string>();

  function dfs(nodeId: string) {
    color.set(nodeId, GRAY);
    pathNodes.push(nodeId);

    for (const edge of outgoing.get(nodeId) ?? []) {
      const targetColor = color.get(edge.target) ?? WHITE;
      if (targetColor === WHITE) {
        pathEdges.push(edge);
        dfs(edge.target);
        pathEdges.pop();
      } else if (targetColor === GRAY) {
        const cycleStart = pathNodes.indexOf(edge.target);
        const cycleEdges = [...pathEdges.slice(cycleStart), edge];
        const cycleKey = cycleEdges
          .map((e) => e.id)
          .sort()
          .join(',');
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          const hasExit = cycleEdges.some(isExitCondition);
          if (!hasExit) {
            issues.push({
              severity: 'error',
              code: 'infinite-cycle',
              message: `Zyklus ohne Exit-Bedingung gefunden: ${cycleEdges
                .map((e) => e.id)
                .join(' → ')}. Mindestens eine Kante im Zyklus muss 'timeout' oder 'invalid' sein.`,
            });
          }
        }
      }
    }

    pathNodes.pop();
    color.set(nodeId, BLACK);
  }

  for (const node of topology.nodes) {
    if ((color.get(node.id) ?? WHITE) === WHITE) {
      dfs(node.id);
    }
  }

  return issues;
}

export function hasErrors(issues: ValidationIssue[]): boolean {
  return issues.some((i) => i.severity === 'error');
}
