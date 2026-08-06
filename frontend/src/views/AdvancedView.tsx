import type { CSSProperties } from 'react';
import { Edge, EdgeCondition, Membership, MembershipRole, PbxNode, Topology, ValidationIssue } from '@visual-pbx/shared';
import { newId } from '../defaults';

interface AdvancedViewProps {
  topology: Topology;
  setTopology: (updater: (t: Topology) => Topology) => void;
  issues: ValidationIssue[];
}

const th: CSSProperties = { textAlign: 'left', fontSize: 11, color: '#6b7280', padding: '4px 8px', borderBottom: '1px solid #e5e7eb' };
const td: CSSProperties = { padding: '4px 8px', borderBottom: '1px solid #f3f4f6', fontSize: 12 };

export function AdvancedView({ topology, setTopology, issues }: AdvancedViewProps) {
  const updateNode = (id: string, patch: Partial<PbxNode>) =>
    setTopology((t) => ({ ...t, nodes: t.nodes.map((n) => (n.id === id ? ({ ...n, ...patch } as PbxNode) : n)) }));
  const deleteNode = (id: string) =>
    setTopology((t) => ({
      ...t,
      nodes: t.nodes.filter((n) => n.id !== id),
      edges: t.edges.filter((e) => e.source !== id && e.target !== id),
      memberships: t.memberships.filter((m) => m.groupId !== id && m.memberId !== id),
    }));

  const updateEdge = (id: string, patch: Partial<Edge>) =>
    setTopology((t) => ({ ...t, edges: t.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  const deleteEdge = (id: string) => setTopology((t) => ({ ...t, edges: t.edges.filter((e) => e.id !== id) }));
  const addEdge = () => {
    const [a, b] = topology.nodes;
    if (!a || !b) return;
    setTopology((t) => ({ ...t, edges: [...t.edges, { id: newId('edge'), source: a.id, target: b.id, condition: { type: 'unconditional' } }] }));
  };

  const updateMembership = (id: string, patch: Partial<Membership>) =>
    setTopology((t) => ({ ...t, memberships: t.memberships.map((m) => (m.id === id ? { ...m, ...patch } : m)) }));
  const deleteMembership = (id: string) => setTopology((t) => ({ ...t, memberships: t.memberships.filter((m) => m.id !== id) }));
  const addMembership = () => {
    const group = topology.nodes.find((n) => n.type === 'ringgroup' || n.type === 'queue');
    const member = topology.nodes.find((n) => n.type === 'extension');
    if (!group || !member) return;
    setTopology((t) => ({
      ...t,
      memberships: [...t.memberships, { id: newId('mem'), groupId: group.id, memberId: member.id, role: 'member', position: t.memberships.length + 1 }],
    }));
  };

  const groupNodes = topology.nodes.filter((n) => n.type === 'ringgroup' || n.type === 'queue');
  const extNodes = topology.nodes.filter((n) => n.type === 'extension');

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      {issues.length > 0 && (
        <div style={{ marginBottom: 16, border: '1px solid #fecaca', background: '#fef2f2', borderRadius: 6, padding: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 4 }}>Validierung ({issues.length})</div>
          {issues.map((i, idx) => (
            <div key={idx} style={{ fontSize: 12, color: i.severity === 'error' ? '#b91c1c' : '#92400e' }}>
              [{i.severity}] {i.code}: {i.message}
            </div>
          ))}
        </div>
      )}

      <h3>Nodes</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24 }}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Typ</th>
            <th style={th}>Label</th>
            <th style={th}>X</th>
            <th style={th}>Y</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {topology.nodes.map((n) => (
            <tr key={n.id}>
              <td style={td}>{n.id}</td>
              <td style={td}>{n.type}</td>
              <td style={td}>
                <input value={n.label} onChange={(e) => updateNode(n.id, { label: e.target.value })} />
              </td>
              <td style={td}>
                <input
                  type="number"
                  style={{ width: 60 }}
                  value={n.position?.x ?? 0}
                  onChange={(e) => updateNode(n.id, { position: { x: Number(e.target.value), y: n.position?.y ?? 0 } })}
                />
              </td>
              <td style={td}>
                <input
                  type="number"
                  style={{ width: 60 }}
                  value={n.position?.y ?? 0}
                  onChange={(e) => updateNode(n.id, { position: { x: n.position?.x ?? 0, y: Number(e.target.value) } })}
                />
              </td>
              <td style={td}>
                <button onClick={() => deleteNode(n.id)}>löschen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ fontSize: 12, color: '#6b7280' }}>
        Neue Nodes und typ-spezifische Eigenschaften (Nummer, Strategie, ...) über die einfache Ansicht anlegen/bearbeiten.
      </p>

      <h3>Edges</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Source</th>
            <th style={th}>Target</th>
            <th style={th}>Condition</th>
            <th style={th}>Wert</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {topology.edges.map((e) => (
            <tr key={e.id}>
              <td style={td}>{e.id}</td>
              <td style={td}>
                <select value={e.source} onChange={(ev) => updateEdge(e.id, { source: ev.target.value })}>
                  {topology.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={td}>
                <select value={e.target} onChange={(ev) => updateEdge(e.id, { target: ev.target.value })}>
                  {topology.nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={td}>
                <select
                  value={e.condition?.type ?? 'unconditional'}
                  onChange={(ev) => {
                    const type = ev.target.value as EdgeCondition['type'];
                    updateEdge(e.id, { condition: type === 'digit' ? { type: 'digit', value: '1' } : ({ type } as EdgeCondition) });
                  }}
                >
                  <option value="unconditional">unconditional</option>
                  <option value="digit">digit</option>
                  <option value="timeout">timeout</option>
                  <option value="invalid">invalid</option>
                </select>
              </td>
              <td style={td}>
                {e.condition?.type === 'digit' && (
                  <input
                    style={{ width: 40 }}
                    value={e.condition.value}
                    onChange={(ev) => updateEdge(e.id, { condition: { type: 'digit', value: ev.target.value.slice(0, 1) } })}
                  />
                )}
              </td>
              <td style={td}>
                <button onClick={() => deleteEdge(e.id)}>löschen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addEdge}>+ Edge</button>

      <h3 style={{ marginTop: 24 }}>Memberships</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
        <thead>
          <tr>
            <th style={th}>ID</th>
            <th style={th}>Gruppe</th>
            <th style={th}>Mitglied</th>
            <th style={th}>Rolle</th>
            <th style={th}>Position</th>
            <th style={th}>Pausiert</th>
            <th style={th} />
          </tr>
        </thead>
        <tbody>
          {topology.memberships.map((m) => (
            <tr key={m.id}>
              <td style={td}>{m.id}</td>
              <td style={td}>
                <select value={m.groupId} onChange={(ev) => updateMembership(m.id, { groupId: ev.target.value })}>
                  {groupNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={td}>
                <select value={m.memberId} onChange={(ev) => updateMembership(m.id, { memberId: ev.target.value })}>
                  {extNodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </td>
              <td style={td}>
                <select value={m.role} onChange={(ev) => updateMembership(m.id, { role: ev.target.value as MembershipRole })}>
                  <option value="member">member</option>
                  <option value="agent">agent</option>
                </select>
              </td>
              <td style={td}>
                <input
                  type="number"
                  style={{ width: 50 }}
                  value={m.position ?? 0}
                  onChange={(ev) => updateMembership(m.id, { position: Number(ev.target.value) })}
                />
              </td>
              <td style={td}>
                <input type="checkbox" checked={!!m.paused} onChange={(ev) => updateMembership(m.id, { paused: ev.target.checked })} />
              </td>
              <td style={td}>
                <button onClick={() => deleteMembership(m.id)}>löschen</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addMembership}>+ Membership</button>
    </div>
  );
}
