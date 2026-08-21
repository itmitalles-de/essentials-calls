import { useCallback, useEffect, useMemo } from 'react';
import ReactFlow, {
  Background,
  Connection,
  Controls,
  MiniMap,
  Node as RFNode,
  Edge as RFEdge,
  EdgeChange,
  NodeChange,
  useNodesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Edge, NodeStatus, NodeType, PbxNode, Topology, ValidationIssue, isTransitionAllowed } from '@visual-pbx/shared';
import { nodeTypes, PbxNodeData } from '../components/PbxNodeView';
import { Inspector } from '../components/Inspector';
import { createDefaultNode, newId } from '../defaults';

interface SimpleViewProps {
  topology: Topology;
  setTopology: (updater: (t: Topology) => Topology) => void;
  statuses: Map<string, NodeStatus>;
  issues: ValidationIssue[];
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onSelect: (sel: { nodeId?: string; edgeId?: string }) => void;
  canEdit: boolean;
  canManageSecrets: boolean;
  revision: number;
  onSecretChange: (nodeId: string, secret: string) => Promise<void>;
  onServerTopologyChanged: () => Promise<void>;
}

const NODE_MINIMAP_COLORS: Record<string, string> = {
  extension: 'var(--node-extension)',
  ivr: 'var(--node-ivr)',
  ringgroup: 'var(--node-ringgroup)',
  queue: 'var(--node-queue)',
  schedule: 'var(--node-schedule)',
  voicemail: 'var(--node-voicemail)',
};

const PALETTE: { type: Exclude<NodeType, 'trunk' | 'external'>; label: string }[] = [
  { type: 'extension', label: '+ Extension' },
  { type: 'ivr', label: '+ IVR' },
  { type: 'ringgroup', label: '+ Ring Group' },
  { type: 'queue', label: '+ Queue' },
  { type: 'schedule', label: '+ Zeitplan' },
  { type: 'voicemail', label: '+ Voicemail' },
];

export function SimpleView({
  topology,
  setTopology,
  statuses,
  issues,
  selectedNodeId,
  selectedEdgeId,
  onSelect,
  canEdit,
  canManageSecrets,
  revision,
  onSecretChange,
  onServerTopologyChanged,
}: SimpleViewProps) {
  const invalidNodeIds = useMemo(() => new Set(issues.filter((i) => i.nodeId).map((i) => i.nodeId!)), [issues]);
  const invalidEdgeIds = useMemo(() => new Set(issues.filter((i) => i.edgeId).map((i) => i.edgeId!)), [issues]);

  // React Flow measures each node's width/height via ResizeObserver and keeps
  // that measurement on the node object itself; edges can't be drawn until
  // it's there. Rebuilding a brand-new nodes array from `topology` on every
  // render (as we used to) meant the measurement was thrown away as fast as
  // it was taken, so edges silently never rendered. useNodesState owns a
  // persistent array instead, and we merge topology changes into it in
  // place, keeping whatever React Flow has already measured.
  const [rfNodes, setRfNodes, onNodesChangeInternal] = useNodesState<PbxNodeData>([]);

  useEffect(() => {
    setRfNodes((current) => {
      const byId = new Map(current.map((n) => [n.id, n]));
      return topology.nodes.map((n) => {
        const data: PbxNodeData = { pbxNode: n, status: statuses.get(n.id), invalid: invalidNodeIds.has(n.id) };
        const existing = byId.get(n.id);
        if (existing) {
          return { ...existing, position: n.position ?? existing.position, data, selected: n.id === selectedNodeId };
        }
        return {
          id: n.id,
          type: 'pbxNode',
          position: n.position ?? { x: 0, y: 0 },
          data,
          selected: n.id === selectedNodeId,
        };
      });
    });
  }, [topology.nodes, statuses, invalidNodeIds, selectedNodeId, setRfNodes]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (!canEdit) return;
      onNodesChangeInternal(changes);

      const moved = changes.filter(
        (c): c is Extract<NodeChange, { type: 'position' }> => c.type === 'position' && !!c.position
      );
      // React Flow removes nodes itself on the delete key. Without mirroring that
      // into the topology, the sync effect above would immediately put the node
      // back, so deletions appeared to do nothing.
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));

      if (moved.length === 0 && removedIds.size === 0) return;

      setTopology((t) => {
        const nodes = t.nodes
          .filter((n) => !removedIds.has(n.id))
          .map((n) => {
            const change = moved.find((c) => c.id === n.id);
            return change?.position ? { ...n, position: change.position } : n;
          });

        if (removedIds.size === 0) return { ...t, nodes };

        return {
          ...t,
          nodes,
          edges: t.edges.filter((e) => !removedIds.has(e.source) && !removedIds.has(e.target)),
          memberships: t.memberships.filter((m) => !removedIds.has(m.groupId) && !removedIds.has(m.memberId)),
        };
      });
    },
    [canEdit, onNodesChangeInternal, setTopology]
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (!canEdit) return;
      const removedIds = new Set(changes.filter((c) => c.type === 'remove').map((c) => c.id));
      if (removedIds.size === 0) return;
      setTopology((t) => ({ ...t, edges: t.edges.filter((e) => !removedIds.has(e.id)) }));
    },
    [canEdit, setTopology]
  );

  const rfEdges: RFEdge[] = topology.edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    label: conditionLabel(e),
    animated: e.condition?.type === 'unconditional' || !e.condition,
    selected: e.id === selectedEdgeId,
    style: invalidEdgeIds.has(e.id) ? { stroke: 'var(--danger)' } : undefined,
  }));

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!canEdit) return;
      if (!connection.source || !connection.target) return;
      const sourceNode = topology.nodes.find((n) => n.id === connection.source);
      const targetNode = topology.nodes.find((n) => n.id === connection.target);
      if (!sourceNode || !targetNode) return;
      if (!isTransitionAllowed(sourceNode.type, targetNode.type)) {
        window.alert(`Kante ${sourceNode.type} → ${targetNode.type} ist nicht erlaubt.`);
        return;
      }
      const edge: Edge = {
        id: newId('edge'),
        source: connection.source,
        target: connection.target,
        condition: { type: 'unconditional' },
      };
      setTopology((t) => ({ ...t, edges: [...t.edges, edge] }));
    },
    [canEdit, topology.nodes, setTopology]
  );

  const addNode = (type: Exclude<NodeType, 'trunk' | 'external'>) => {
    if (!canEdit) return;
    const node: PbxNode = createDefaultNode(type, { x: 80 + Math.random() * 400, y: 80 + Math.random() * 300 });
    setTopology((t) => ({ ...t, nodes: [...t.nodes, node] }));
    onSelect({ nodeId: node.id });
  };

  const updateNode = (node: PbxNode) => setTopology((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === node.id ? node : n)) }));
  const deleteNode = (id: string) =>
    setTopology((t) => ({
      ...t,
      nodes: t.nodes.filter((n) => n.id !== id),
      edges: t.edges.filter((e) => e.source !== id && e.target !== id),
      memberships: t.memberships.filter((m) => m.groupId !== id && m.memberId !== id),
    }));
  const updateEdge = (edge: Edge) => setTopology((t) => ({ ...t, edges: t.edges.map((e) => (e.id === edge.id ? edge : e)) }));
  const deleteEdge = (id: string) => setTopology((t) => ({ ...t, edges: t.edges.filter((e) => e.id !== id) }));
  const toggleMembership = (groupId: string, memberId: string) =>
    setTopology((t) => {
      const existing = t.memberships.find((m) => m.groupId === groupId && m.memberId === memberId);
      if (existing) return { ...t, memberships: t.memberships.filter((m) => m !== existing) };
      const group = t.nodes.find((n) => n.id === groupId);
      const role = group?.type === 'queue' ? 'agent' : 'member';
      const position = t.memberships.filter((m) => m.groupId === groupId).length + 1;
      return { ...t, memberships: [...t.memberships, { id: newId('mem'), groupId, memberId, role, position }] };
    });

  return (
    <div className="simple-editor-layout" aria-label="Callflow-Graph">
      <div className="flow-canvas">
        <div className="flow-palette" aria-label="Knotentypen">
          {PALETTE.map((p) => (
            <button key={p.type} onClick={() => addNode(p.type)} disabled={!canEdit}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flow-surface">
          <ReactFlow
            nodes={rfNodes}
            edges={rfEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => onSelect({ nodeId: n.id })}
            onEdgeClick={(_, e) => onSelect({ edgeId: e.id })}
            onPaneClick={() => onSelect({})}
            nodesDraggable={canEdit}
            nodesConnectable={canEdit}
            nodesFocusable
            edgesFocusable
            deleteKeyCode={canEdit ? ['Backspace', 'Delete'] : null}
            fitView
          >
            {/* These take colours as props, not CSS, so they are read from the
                resolved theme tokens rather than styled in the stylesheet. */}
            <Background color="var(--grid-dot)" />
            <Controls />
            <MiniMap
              nodeColor={(n) => NODE_MINIMAP_COLORS[(n.data as PbxNodeData)?.pbxNode?.type] ?? 'var(--fg-muted)'}
              maskColor="transparent"
            />
          </ReactFlow>
        </div>
      </div>
      <div className="flow-inspector">
        <Inspector
          topology={topology}
          selectedNodeId={selectedNodeId}
          selectedEdgeId={selectedEdgeId}
          onUpdateNode={updateNode}
          onDeleteNode={deleteNode}
          onUpdateEdge={updateEdge}
          onDeleteEdge={deleteEdge}
          onToggleMembership={toggleMembership}
          readOnly={!canEdit}
          canManageSecrets={canManageSecrets}
          revision={revision}
          onSecretChange={onSecretChange}
          onServerTopologyChanged={onServerTopologyChanged}
        />
      </div>
    </div>
  );
}

function conditionLabel(edge: Edge): string {
  const c = edge.condition;
  if (!c || c.type === 'unconditional') return '';
  if (c.type === 'digit') return c.value;
  return c.type;
}
