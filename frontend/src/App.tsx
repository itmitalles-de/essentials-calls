import { useEffect, useMemo, useState } from 'react';
import { NodeStatus, Topology, ValidationIssue, validateTopology } from '@visual-pbx/shared';
import { connectStatusSocket, deployTopology, fetchTopology, saveTopology } from './api/client';
import { SimpleView } from './views/SimpleView';
import { AdvancedView } from './views/AdvancedView';

type Tab = 'simple' | 'advanced';
type DeployState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'deploying' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

export default function App() {
  const [topology, setTopologyState] = useState<Topology | null>(null);
  const [tab, setTab] = useState<Tab>('simple');
  const [statuses, setStatuses] = useState<Map<string, NodeStatus>>(new Map());
  const [selection, setSelection] = useState<{ nodeId?: string; edgeId?: string }>({});
  const [deployState, setDeployState] = useState<DeployState>({ kind: 'idle' });

  useEffect(() => {
    fetchTopology().then(setTopologyState);
  }, []);

  useEffect(() => {
    const close = connectStatusSocket((list) => setStatuses(new Map(list.map((s) => [s.nodeId, s]))));
    return close;
  }, []);

  const issues: ValidationIssue[] = useMemo(() => (topology ? validateTopology(topology) : []), [topology]);
  const hasErrors = issues.some((i) => i.severity === 'error');

  if (!topology) return <div style={{ padding: 24 }}>Lädt…</div>;

  const setTopology = (updater: (t: Topology) => Topology) => setTopologyState((t) => (t ? updater(t) : t));

  const handleSave = async () => {
    setDeployState({ kind: 'saving' });
    const res = await saveTopology(topology);
    setDeployState(res.saved ? { kind: 'ok', message: 'Gespeichert.' } : { kind: 'error', message: 'Speichern fehlgeschlagen (Validierungsfehler).' });
  };

  const handleDeploy = async () => {
    setDeployState({ kind: 'deploying' });
    const res = await deployTopology(topology);
    if (!res.deployed && res.issues.some((i) => i.severity === 'error')) {
      setDeployState({ kind: 'error', message: 'Deploy abgebrochen: Validierungsfehler.' });
    } else if (res.reloaded === false) {
      setDeployState({ kind: 'error', message: `Configs geschrieben, Asterisk-Reload fehlgeschlagen: ${res.reloadError}` });
    } else {
      setDeployState({ kind: 'ok', message: 'Deployt und Asterisk neu geladen.' });
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid #e5e7eb' }}>
        <strong>Visual PBX</strong>
        <nav style={{ display: 'flex', gap: 4 }}>
          <button onClick={() => setTab('simple')} disabled={tab === 'simple'}>
            Einfach
          </button>
          <button onClick={() => setTab('advanced')} disabled={tab === 'advanced'}>
            Erweitert
          </button>
        </nav>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 12, color: hasErrors ? '#b91c1c' : '#16a34a' }}>
          {hasErrors ? `${issues.filter((i) => i.severity === 'error').length} Validierungsfehler` : 'Topologie gültig'}
        </span>
        <button onClick={handleSave}>Speichern</button>
        <button onClick={handleDeploy} disabled={hasErrors}>
          Deploy
        </button>
        {deployState.kind !== 'idle' && (
          <span style={{ fontSize: 12, color: deployState.kind === 'error' ? '#b91c1c' : '#374151' }}>
            {deployState.kind === 'saving' && 'Speichere…'}
            {deployState.kind === 'deploying' && 'Deploye…'}
            {(deployState.kind === 'ok' || deployState.kind === 'error') && deployState.message}
          </span>
        )}
      </header>
      <main style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'simple' ? (
          <SimpleView
            topology={topology}
            setTopology={setTopology}
            statuses={statuses}
            issues={issues}
            selectedNodeId={selection.nodeId}
            selectedEdgeId={selection.edgeId}
            onSelect={setSelection}
          />
        ) : (
          <AdvancedView topology={topology} setTopology={setTopology} issues={issues} />
        )}
      </main>
    </div>
  );
}
