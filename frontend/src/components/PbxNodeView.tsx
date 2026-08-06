import { Handle, Position } from 'reactflow';
import { NODE_TYPE_LABELS, NodeStatus, PbxNode } from '@visual-pbx/shared';

const TYPE_COLORS: Record<string, string> = {
  extension: '#2563eb',
  ivr: '#7c3aed',
  ringgroup: '#d97706',
  queue: '#0d9488',
  voicemail: '#64748b',
  trunk: '#9ca3af',
  external: '#9ca3af',
};

const AVAILABILITY_COLORS: Record<string, string> = {
  online: '#22c55e',
  offline: '#ef4444',
  unknown: '#9ca3af',
};

function summary(node: PbxNode): string {
  switch (node.type) {
    case 'extension':
      return `Nr. ${node.properties.number}`;
    case 'ivr':
      return `Timeout ${node.properties.timeout}s`;
    case 'ringgroup':
      return `${node.properties.strategy} / ${node.properties.ringTimeout}s`;
    case 'queue':
      return `${node.properties.strategy}`;
    case 'voicemail':
      return `Mailbox ${node.properties.mailbox}`;
    default:
      return '';
  }
}

export interface PbxNodeData {
  pbxNode: PbxNode;
  status?: NodeStatus;
  invalid?: boolean;
}

export function PbxNodeView({ data, selected }: { data: PbxNodeData; selected: boolean }) {
  const { pbxNode, status, invalid } = data;
  const color = TYPE_COLORS[pbxNode.type] ?? '#64748b';
  const canHaveOutgoing = pbxNode.type !== 'voicemail';

  return (
    <div
      style={{
        border: `2px solid ${selected ? '#111827' : invalid ? '#ef4444' : color}`,
        borderRadius: 8,
        background: '#fff',
        minWidth: 170,
        boxShadow: selected ? '0 0 0 3px rgba(17,24,39,0.15)' : '0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      <div style={{ background: color, color: '#fff', padding: '4px 8px', borderRadius: '6px 6px 0 0', fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
        <span>{NODE_TYPE_LABELS[pbxNode.type]}</span>
        {status && (
          <span
            title={`${status.availability} / ${status.activity}`}
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: AVAILABILITY_COLORS[status.availability],
              alignSelf: 'center',
            }}
          />
        )}
      </div>
      <div style={{ padding: '6px 8px' }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{pbxNode.label}</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{summary(pbxNode)}</div>
      </div>
      {canHaveOutgoing && <Handle type="source" position={Position.Right} style={{ background: color }} />}
    </div>
  );
}

export const nodeTypes = { pbxNode: PbxNodeView };
