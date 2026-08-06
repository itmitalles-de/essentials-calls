import type { CSSProperties } from 'react';
import { Edge, EdgeCondition, ExtensionNode, IVRNode, PbxNode, QueueNode, RingGroupNode, Topology, VoicemailNode } from '@visual-pbx/shared';

interface InspectorProps {
  topology: Topology;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onUpdateNode: (node: PbxNode) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (edge: Edge) => void;
  onDeleteEdge: (id: string) => void;
  onToggleMembership: (groupId: string, memberId: string) => void;
}

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 };
const labelStyle: CSSProperties = { fontSize: 11, color: '#6b7280' };

export function Inspector(props: InspectorProps) {
  const { topology, selectedNodeId, selectedEdgeId } = props;
  const node = topology.nodes.find((n) => n.id === selectedNodeId);
  const edge = topology.edges.find((e) => e.id === selectedEdgeId);

  if (node) return <NodeForm key={node.id} node={node} {...props} />;
  if (edge) return <EdgeForm key={edge.id} edge={edge} {...props} />;
  return (
    <div style={{ padding: 16, color: '#6b7280', fontSize: 13 }}>
      Node oder Kante auswählen, um Details zu bearbeiten.
    </div>
  );
}

function NodeForm({ node, topology, onUpdateNode, onDeleteNode, onToggleMembership }: InspectorProps & { node: PbxNode }) {
  const update = (patch: Partial<PbxNode>) => onUpdateNode({ ...node, ...patch } as PbxNode);
  const updateProps = (patch: Record<string, unknown>) =>
    onUpdateNode({ ...node, properties: { ...node.properties, ...patch } } as PbxNode);

  return (
    <div style={{ padding: 12 }}>
      <div style={field}>
        <label style={labelStyle}>Label</label>
        <input value={node.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      {node.type === 'extension' && <ExtensionFields node={node as ExtensionNode} updateProps={updateProps} />}
      {node.type === 'ivr' && <IVRFields node={node as IVRNode} updateProps={updateProps} />}
      {node.type === 'ringgroup' && <RingGroupFields node={node as RingGroupNode} updateProps={updateProps} />}
      {node.type === 'queue' && <QueueFields node={node as QueueNode} updateProps={updateProps} />}
      {node.type === 'voicemail' && <VoicemailFields node={node as VoicemailNode} updateProps={updateProps} />}

      {(node.type === 'ringgroup' || node.type === 'queue') && (
        <MembershipEditor topology={topology} groupId={node.id} onToggle={onToggleMembership} />
      )}

      <button style={{ marginTop: 12, color: '#b91c1c' }} onClick={() => onDeleteNode(node.id)}>
        Node löschen
      </button>
    </div>
  );
}

function ExtensionFields({ node, updateProps }: { node: ExtensionNode; updateProps: (p: Record<string, unknown>) => void }) {
  const vm = node.properties.voicemail ?? { enabled: false, mailbox: node.properties.number };
  return (
    <>
      <TextField label="Nummer" value={node.properties.number} onChange={(v) => updateProps({ number: v })} />
      <TextField label="SIP User" value={node.properties.sipUser} onChange={(v) => updateProps({ sipUser: v })} />
      <TextField label="SIP Passwort" value={node.properties.sipPassword} onChange={(v) => updateProps({ sipPassword: v })} />
      <TextField label="Caller-ID Name" value={node.properties.callerIdName ?? ''} onChange={(v) => updateProps({ callerIdName: v })} />
      <div style={field}>
        <label style={labelStyle}>
          <input
            type="checkbox"
            checked={vm.enabled}
            onChange={(e) => updateProps({ voicemail: { ...vm, enabled: e.target.checked } })}
          />{' '}
          Voicemail aktiv
        </label>
      </div>
      {vm.enabled && (
        <>
          <TextField label="Mailbox" value={vm.mailbox} onChange={(v) => updateProps({ voicemail: { ...vm, mailbox: v } })} />
          <TextField label="PIN" value={vm.pin ?? ''} onChange={(v) => updateProps({ voicemail: { ...vm, pin: v } })} />
          <TextField label="E-Mail" value={vm.email ?? ''} onChange={(v) => updateProps({ voicemail: { ...vm, email: v } })} />
        </>
      )}
    </>
  );
}

function IVRFields({ node, updateProps }: { node: IVRNode; updateProps: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <TextField label="Begrüßung (Datei)" value={node.properties.greeting} onChange={(v) => updateProps({ greeting: v })} />
      <NumberField label="Timeout (s)" value={node.properties.timeout} onChange={(v) => updateProps({ timeout: v })} />
      <NumberField label="Max. Fehlversuche" value={node.properties.invalidRetries} onChange={(v) => updateProps({ invalidRetries: v })} />
    </>
  );
}

function RingGroupFields({ node, updateProps }: { node: RingGroupNode; updateProps: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <SelectField
        label="Strategie"
        value={node.properties.strategy}
        options={['ringall', 'roundrobin', 'leastrecent', 'fewestcalls', 'random']}
        onChange={(v) => updateProps({ strategy: v })}
      />
      <NumberField label="Ring-Timeout (s)" value={node.properties.ringTimeout} onChange={(v) => updateProps({ ringTimeout: v })} />
    </>
  );
}

function QueueFields({ node, updateProps }: { node: QueueNode; updateProps: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <SelectField
        label="Strategie"
        value={node.properties.strategy}
        options={['ringall', 'roundrobin', 'leastrecent', 'fewestcalls', 'random', 'rrmemory']}
        onChange={(v) => updateProps({ strategy: v })}
      />
      <NumberField label="Timeout (s)" value={node.properties.timeout} onChange={(v) => updateProps({ timeout: v })} />
      <NumberField label="Max. Wartezeit (s)" value={node.properties.maxWaitTime} onChange={(v) => updateProps({ maxWaitTime: v })} />
      <SelectField label="Join Empty" value={node.properties.joinEmpty} options={['yes', 'no', 'strict']} onChange={(v) => updateProps({ joinEmpty: v })} />
      <SelectField label="Leave When Empty" value={node.properties.leaveWhenEmpty} options={['yes', 'no']} onChange={(v) => updateProps({ leaveWhenEmpty: v })} />
    </>
  );
}

function VoicemailFields({ node, updateProps }: { node: VoicemailNode; updateProps: (p: Record<string, unknown>) => void }) {
  return (
    <>
      <TextField label="Mailbox" value={node.properties.mailbox} onChange={(v) => updateProps({ mailbox: v })} />
      <TextField label="PIN" value={node.properties.pin ?? ''} onChange={(v) => updateProps({ pin: v })} />
      <TextField label="E-Mail" value={node.properties.email ?? ''} onChange={(v) => updateProps({ email: v })} />
    </>
  );
}

function MembershipEditor({ topology, groupId, onToggle }: { topology: Topology; groupId: string; onToggle: (g: string, m: string) => void }) {
  const memberIds = new Set(topology.memberships.filter((m) => m.groupId === groupId).map((m) => m.memberId));
  const extensions = topology.nodes.filter((n) => n.type === 'extension');
  return (
    <div style={{ marginTop: 8, borderTop: '1px solid #e5e7eb', paddingTop: 8 }}>
      <div style={labelStyle}>Mitglieder</div>
      {extensions.length === 0 && <div style={{ fontSize: 12, color: '#9ca3af' }}>Keine Extensions vorhanden.</div>}
      {extensions.map((ext) => (
        <label key={ext.id} style={{ display: 'block', fontSize: 12 }}>
          <input type="checkbox" checked={memberIds.has(ext.id)} onChange={() => onToggle(groupId, ext.id)} /> {ext.label}
        </label>
      ))}
    </div>
  );
}

function EdgeForm({ edge, onUpdateEdge, onDeleteEdge }: InspectorProps & { edge: Edge }) {
  const condType = edge.condition?.type ?? 'unconditional';

  const setCondition = (condition: EdgeCondition) => onUpdateEdge({ ...edge, condition });

  return (
    <div style={{ padding: 12 }}>
      <div style={field}>
        <label style={labelStyle}>Bedingung</label>
        <select
          value={condType}
          onChange={(e) => {
            const t = e.target.value as EdgeCondition['type'];
            setCondition(t === 'digit' ? { type: 'digit', value: '1' } : ({ type: t } as EdgeCondition));
          }}
        >
          <option value="unconditional">unconditional</option>
          <option value="digit">digit</option>
          <option value="timeout">timeout</option>
          <option value="invalid">invalid</option>
        </select>
      </div>
      {edge.condition?.type === 'digit' && (
        <TextField
          label="Ziffer"
          value={edge.condition.value}
          onChange={(v) => setCondition({ type: 'digit', value: v.slice(0, 1) })}
        />
      )}
      <button style={{ marginTop: 12, color: '#b91c1c' }} onClick={() => onDeleteEdge(edge.id)}>
        Kante löschen
      </button>
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div style={field}>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div style={field}>
      <label style={labelStyle}>{label}</label>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  return (
    <div style={field}>
      <label style={labelStyle}>{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
