import { Handle, Position } from 'reactflow';
import { NODE_TYPE_LABELS, NodeStatus, PbxNode } from '@visual-pbx/shared';

// Node accent colours come from the theme tokens so they stay legible against
// the darker canvas instead of glowing.
const TYPE_COLORS: Record<string, string> = {
  extension: 'var(--node-extension)',
  ivr: 'var(--node-ivr)',
  ringgroup: 'var(--node-ringgroup)',
  queue: 'var(--node-queue)',
  voicemail: 'var(--node-voicemail)',
  trunk: 'var(--node-reserved)',
  external: 'var(--node-reserved)',
};

const AVAILABILITY_COLORS: Record<string, string> = {
  online: 'var(--status-online)',
  offline: 'var(--danger)',
  unknown: 'var(--fg-muted)',
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
  const color = TYPE_COLORS[pbxNode.type] ?? 'var(--node-voicemail)';
  const canHaveOutgoing = pbxNode.type !== 'voicemail';

  return (
    <div
      style={{
        border: `2px solid ${selected ? 'var(--fg)' : invalid ? 'var(--danger)' : color}`,
        borderRadius: 8,
        background: 'var(--bg-elevated)',
        minWidth: 170,
        boxShadow: selected ? `0 0 0 3px var(--focus-ring)` : 'var(--shadow)',
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: color }} />
      {/* White header text is deliberate: it sits on the saturated node accent,
          which stays dark enough for contrast in both themes. */}
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
        <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{summary(pbxNode)}</div>
      </div>
      {canHaveOutgoing && <Handle type="source" position={Position.Right} style={{ background: color }} />}
    </div>
  );
}

export const nodeTypes = { pbxNode: PbxNodeView };
