import { useId, useState, type CSSProperties } from 'react';
import {
  Edge,
  EdgeCondition,
  ExtensionNode,
  IVRNode,
  PbxNode,
  QueueNode,
  RingGroupNode,
  ScheduleNode,
  ScheduleWeekday,
  Topology,
  VoicemailNode,
} from '@visual-pbx/shared';
import { GreetingPicker } from './GreetingPicker';

interface InspectorProps {
  topology: Topology;
  selectedNodeId?: string;
  selectedEdgeId?: string;
  onUpdateNode: (node: PbxNode) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (edge: Edge) => void;
  onDeleteEdge: (id: string) => void;
  onToggleMembership: (groupId: string, memberId: string) => void;
  readOnly: boolean;
  canManageSecrets: boolean;
  revision: number;
  onSecretChange: (nodeId: string, secret: string) => Promise<void>;
  onServerTopologyChanged: () => Promise<void>;
}

const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 8 };
const labelStyle: CSSProperties = { fontSize: 11, color: 'var(--fg-muted)' };

export function Inspector(props: InspectorProps) {
  const { topology, selectedNodeId, selectedEdgeId } = props;
  const node = topology.nodes.find((n) => n.id === selectedNodeId);
  const edge = topology.edges.find((e) => e.id === selectedEdgeId);

  if (node) return <NodeForm key={node.id} node={node} {...props} />;
  if (edge) return <EdgeForm key={edge.id} edge={edge} {...props} />;
  return (
    <div style={{ padding: 16, color: 'var(--fg-muted)', fontSize: 13 }}>
      Node oder Kante auswählen, um Details zu bearbeiten.
    </div>
  );
}

function NodeForm(props: InspectorProps & { node: PbxNode }) {
  const { node, topology, onUpdateNode, onDeleteNode, onToggleMembership, readOnly } = props;
  const labelId = useId();
  const update = (patch: Partial<PbxNode>) => onUpdateNode({ ...node, ...patch } as PbxNode);
  const updateProps = (patch: Record<string, unknown>) =>
    onUpdateNode({ ...node, properties: { ...node.properties, ...patch } } as PbxNode);

  return (
    <fieldset disabled={readOnly} style={{ padding: 12, border: 0, margin: 0 }}>
      <div style={field}>
        <label htmlFor={labelId} style={labelStyle}>Label</label>
        <input id={labelId} value={node.label} onChange={(e) => update({ label: e.target.value })} />
      </div>

      {node.type === 'extension' && (
        <ExtensionFields
          node={node as ExtensionNode}
          updateProps={updateProps}
          canManageSecrets={props.canManageSecrets}
          onSecretChange={props.onSecretChange}
        />
      )}
      {node.type === 'ivr' && (
        <IVRFields
          node={node as IVRNode}
          updateProps={updateProps}
          readOnly={readOnly}
          revision={props.revision}
          onServerTopologyChanged={props.onServerTopologyChanged}
        />
      )}
      {node.type === 'ringgroup' && <RingGroupFields node={node as RingGroupNode} updateProps={updateProps} />}
      {node.type === 'queue' && <QueueFields node={node as QueueNode} updateProps={updateProps} />}
      {node.type === 'schedule' && <ScheduleFields node={node as ScheduleNode} updateProps={updateProps} />}
      {node.type === 'voicemail' && <VoicemailFields node={node as VoicemailNode} updateProps={updateProps} />}

      {(node.type === 'ringgroup' || node.type === 'queue') && (
        <MembershipEditor topology={topology} groupId={node.id} onToggle={onToggleMembership} />
      )}

      <button style={{ marginTop: 12, color: 'var(--danger)' }} onClick={() => onDeleteNode(node.id)}>
        Node löschen
      </button>
    </fieldset>
  );
}

function ExtensionFields({
  node,
  updateProps,
  canManageSecrets,
  onSecretChange,
}: {
  node: ExtensionNode;
  updateProps: (p: Record<string, unknown>) => void;
  canManageSecrets: boolean;
  onSecretChange: (nodeId: string, secret: string) => Promise<void>;
}) {
  const vm = node.properties.voicemail ?? { enabled: false, mailbox: node.properties.number };
  return (
    <>
      <TextField label="Nummer" value={node.properties.number} onChange={(v) => updateProps({ number: v })} />
      <TextField label="SIP User" value={node.properties.sipUser} onChange={(v) => updateProps({ sipUser: v })} />
      <div style={{ ...field, fontSize: 11, color: 'var(--fg-muted)' }}>
        SIP-Secret: {node.properties.sipSecret?.configured ? 'konfiguriert' : 'nicht konfiguriert'}
      </div>
      {canManageSecrets && <SecretEditor nodeId={node.id} onSave={onSecretChange} />}
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

function IVRFields({
  node,
  updateProps,
  readOnly,
  revision,
  onServerTopologyChanged,
}: {
  node: IVRNode;
  updateProps: (p: Record<string, unknown>) => void;
  readOnly: boolean;
  revision: number;
  onServerTopologyChanged: () => Promise<void>;
}) {
  return (
    <>
      <GreetingPicker
        value={node.properties.greeting}
        onChange={(greeting) => updateProps({ greeting })}
        suggestedName={node.label || 'ansage'}
        disabled={readOnly}
        revision={revision}
        onServerTopologyChanged={onServerTopologyChanged}
      />
      <NumberField label="Timeout (s)" value={node.properties.timeout} onChange={(v) => updateProps({ timeout: v })} />
      <NumberField label="Max. Fehlversuche" value={node.properties.invalidRetries} onChange={(v) => updateProps({ invalidRetries: v })} />
    </>
  );
}

function SecretEditor({ nodeId, onSave }: { nodeId: string; onSave: (nodeId: string, secret: string) => Promise<void> }) {
  const id = useId();
  const [value, setValue] = useState('');
  const [state, setState] = useState('');
  const save = async () => {
    setState('Speichere…');
    try {
      await onSave(nodeId, value);
      setValue('');
      setState('Secret geändert. Der alte Wert wurde nicht zurückgegeben.');
    } catch (error) {
      setState((error as Error).message);
    }
  };
  return (
    <div style={field}>
      <label htmlFor={id} style={labelStyle}>Neues SIP-Secret (Admin)</label>
      <input id={id} type="password" autoComplete="new-password" value={value} onChange={(event) => setValue(event.target.value)} />
      <button type="button" onClick={save} disabled={value.length < 12}>Secret ersetzen</button>
      {state && <small role="status">{state}</small>}
    </div>
  );
}

const WEEKDAYS: Array<{ value: ScheduleWeekday; label: string }> = [
  { value: 1, label: 'Mo' }, { value: 2, label: 'Di' }, { value: 3, label: 'Mi' },
  { value: 4, label: 'Do' }, { value: 5, label: 'Fr' }, { value: 6, label: 'Sa' }, { value: 7, label: 'So' },
];

function ScheduleFields({ node, updateProps }: { node: ScheduleNode; updateProps: (p: Record<string, unknown>) => void }) {
  const updateWindow = (id: string, patch: Partial<ScheduleNode['properties']['windows'][number]>) =>
    updateProps({ windows: node.properties.windows.map((window) => window.id === id ? { ...window, ...patch } : window) });
  return (
    <>
      <TextField label="IANA-Zeitzone" value={node.properties.timezone} onChange={(timezone) => updateProps({ timezone })} />
      <div style={labelStyle}>Öffnungsfenster</div>
      {node.properties.windows.map((window) => (
        <div key={window.id} className="schedule-window">
          <div>
            {WEEKDAYS.map((day) => (
              <label key={day.value} title={day.label}>
                <input
                  type="checkbox"
                  checked={window.weekdays.includes(day.value)}
                  onChange={(event) => updateWindow(window.id, {
                    weekdays: event.target.checked
                      ? [...window.weekdays, day.value].sort() as ScheduleWeekday[]
                      : window.weekdays.filter((value) => value !== day.value),
                  })}
                />{day.label}
              </label>
            ))}
          </div>
          <input aria-label="Beginn" type="time" value={window.start} onChange={(event) => updateWindow(window.id, { start: event.target.value })} />
          <span>–</span>
          <input aria-label="Ende" type="time" value={window.end} onChange={(event) => updateWindow(window.id, { end: event.target.value })} />
          <button type="button" onClick={() => updateProps({ windows: node.properties.windows.filter((entry) => entry.id !== window.id) })}>Fenster löschen</button>
        </div>
      ))}
      <button type="button" onClick={() => updateProps({
        windows: [...node.properties.windows, { id: `window-${Date.now()}`, weekdays: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }],
      })}>Zeitfenster hinzufügen</button>
      <div style={field}>
        <label style={labelStyle}>Geschlossene Daten (YYYY-MM-DD, eine Zeile je Datum)</label>
        <textarea
          value={node.properties.holidays.join('\n')}
          onChange={(event) => updateProps({ holidays: event.target.value.split(/\s+/).filter(Boolean) })}
        />
      </div>
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
    <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
      <div style={labelStyle}>Mitglieder</div>
      {extensions.length === 0 && <div style={{ fontSize: 12, color: 'var(--fg-muted)' }}>Keine Extensions vorhanden.</div>}
      {extensions.map((ext) => (
        <label key={ext.id} style={{ display: 'block', fontSize: 12 }}>
          <input type="checkbox" checked={memberIds.has(ext.id)} onChange={() => onToggle(groupId, ext.id)} /> {ext.label}
        </label>
      ))}
    </div>
  );
}

function EdgeForm({ edge, topology, onUpdateEdge, onDeleteEdge, readOnly }: InspectorProps & { edge: Edge }) {
  const condType = edge.condition?.type ?? 'unconditional';

  const setCondition = (condition: EdgeCondition) => onUpdateEdge({ ...edge, condition });

  return (
    <fieldset disabled={readOnly} style={{ padding: 12, border: 0, margin: 0 }}>
      <div style={field}>
        <label style={labelStyle}>Bedingung</label>
        <select
          value={condType}
          onChange={(e) => {
            const t = e.target.value as EdgeCondition['type'];
            setCondition(t === 'digit' ? { type: 'digit', value: '1' } : ({ type: t } as EdgeCondition));
          }}
        >
          {topology.nodes.find((node) => node.id === edge.source)?.type === 'schedule' ? (
            <><option value="open">open</option><option value="closed">closed</option></>
          ) : (
            <><option value="unconditional">unconditional</option><option value="digit">digit</option><option value="timeout">timeout</option><option value="invalid">invalid</option></>
          )}
        </select>
      </div>
      {edge.condition?.type === 'digit' && (
        <TextField
          label="Ziffer"
          value={edge.condition.value}
          onChange={(v) => setCondition({ type: 'digit', value: v.slice(0, 1) })}
        />
      )}
      <button style={{ marginTop: 12, color: 'var(--danger)' }} onClick={() => onDeleteEdge(edge.id)}>
        Kante löschen
      </button>
    </fieldset>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div style={field}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div style={field}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <input id={id} type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  );
}

function SelectField({ label, value, options, onChange }: { label: string; value: string; options: string[]; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <div style={field}>
      <label htmlFor={id} style={labelStyle}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
