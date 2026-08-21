import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILTIN_PROMPTS,
  ExtensionNode,
  MAX_TOPOLOGY_IMPORT_BYTES,
  NodeStatus,
  Topology,
  ValidationIssue,
  validateTopology,
} from '@visual-pbx/shared';
import {
  ApiError,
  AuthSession,
  RevisionInfo,
  Role,
  ServiceInfo,
  SoundInfo,
  StatusConnection,
  UserInfo,
  applyImport,
  createUser,
  connectStatusSocket,
  deployRevision,
  dryRunImport,
  exportTopology,
  fetchRevisions,
  fetchService,
  fetchSession,
  fetchSounds,
  fetchTopology,
  fetchUsers,
  login,
  logout,
  rollbackRevision,
  saveTopology,
  updateSipSecret,
  updateUser,
} from './api/client';
import { SimpleView } from './views/SimpleView';
import { AdvancedView } from './views/AdvancedView';
import { SoftphonesView } from './views/SoftphonesView';
import { AppSection, SimpleAppShell } from './components/SimpleAppShell';
import { ThemeSelector } from './components/ThemeSelector';
import { useTheme } from './theme';
import { useBoundedHistory } from './history';
import {
  CheckCircle2,
  FileDown,
  FileUp,
  Redo2,
  Rocket,
  Save,
  ShieldAlert,
  Undo2,
} from 'lucide-react';

type Tab = 'simple' | 'advanced' | 'revisions' | 'softphones' | 'users';
type Operation = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string };
type ThemeController = ReturnType<typeof useTheme>;

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return `Versionskonflikt: ${error.message}`;
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}

function Login({ onLogin, theme }: { onLogin: (session: AuthSession) => void; theme: ThemeController }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      onLogin(await login(username, password));
    } catch (failure) {
      setError(message(failure));
    } finally {
      setBusy(false);
    }
  };
  return (
    <main className="sb-root login-shell" data-sb-theme={theme.resolved} data-sb-concept="3">
      <section className="login-brand" aria-labelledby="login-product-title">
        <div className="login-product-identity">
          <span className="sb-product-symbol" aria-hidden="true">C</span>
          <span className="sb-product-copy">
            <span className="sb-wordmark">simple</span>
            <span className="sb-product-name">Calls</span>
          </span>
        </div>
        <div>
          <p className="sb-eyebrow">Simple Business</p>
          <h1 className="sb-title" id="login-product-title">Simple Calls</h1>
          <p className="sb-subtitle">Callflows lokal entwerfen, simulieren und gegen eine isolierte Asterisk-Runtime prüfen.</p>
        </div>
        <p className="login-boundary" role="note">
          <ShieldAlert className="sb-icon" aria-hidden="true" />
          <span>Technischer PoC · synthetisch getestet · keine produktive PBX, keine realen Trunks, DIDs oder Notrufe</span>
        </p>
      </section>

      <section className="login-form-region">
        <form className="login-card" onSubmit={submit} aria-label="Anmeldung">
          <div>
            <p className="sb-eyebrow">Lokale Administration</p>
            <h2>Anmelden</h2>
            <p className="login-helper">Verwende einen lokal angelegten Simple-Calls-Benutzer.</p>
          </div>
          <label>
            Benutzername
            <input className="sb-field" name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
          </label>
          <label>
            Passwort
            <input
              className="sb-field"
              name="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="sb-button sb-button-primary" type="submit" disabled={busy}>{busy ? 'Anmeldung läuft…' : 'Anmelden'}</button>
          {error && <div role="alert" className="error-text">{error}</div>}
        </form>
        <div className="login-theme">
          <span>Darstellung</span>
          <ThemeSelector preference={theme.preference} onChange={theme.setPreference} label="Darstellung auf der Anmeldeseite" />
        </div>
      </section>
    </main>
  );
}

export default function App() {
  const [session, setSession] = useState<AuthSession | null | undefined>(undefined);
  const history = useBoundedHistory<Topology>(50);
  const topology = history.value;
  const [revision, setRevision] = useState(0);
  const [activeRevision, setActiveRevision] = useState<number | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('simple');
  const [statuses, setStatuses] = useState<Map<string, NodeStatus>>(new Map());
  const [connection, setConnection] = useState<StatusConnection>({ state: 'reconnecting', reconnectAttempt: 0 });
  const [selection, setSelection] = useState<{ nodeId?: string; edgeId?: string }>({});
  const [operation, setOperation] = useState<Operation>({ kind: 'idle' });
  const [sounds, setSounds] = useState<SoundInfo[]>([]);
  const [revisions, setRevisions] = useState<RevisionInfo[]>([]);
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [service, setService] = useState<ServiceInfo | null>(null);
  const [importCandidate, setImportCandidate] = useState<unknown>();
  const [importPreview, setImportPreview] = useState<string>('');
  const importInput = useRef<HTMLInputElement>(null);
  const theme = useTheme();

  useEffect(() => {
    fetchSession().then(setSession).catch((error) => {
      setLoadError(message(error));
      setSession(null);
    });
  }, []);

  const loadWorkspace = async (resetHistory = true) => {
    const [document, soundResult, revisionResult, serviceResult] = await Promise.all([
      fetchTopology(),
      fetchSounds(),
      fetchRevisions(),
      fetchService(),
    ]);
    if (resetHistory) history.reset(document.topology);
    else history.acceptSaved(document.topology);
    setRevision(document.revision);
    setActiveRevision(document.activeRevision);
    setSounds(soundResult.sounds);
    setRevisions(revisionResult.revisions);
    setService(serviceResult);
    setSelection({});
  };

  useEffect(() => {
    if (!session) return;
    loadWorkspace().catch((error) => setLoadError(message(error)));
  }, [session?.user.id]);

  useEffect(() => {
    if (!session) return;
    const close = connectStatusSocket(
      (list, nextConnection) => {
        setStatuses(new Map(list.map((status) => [status.nodeId, status])));
        setConnection(nextConnection);
      },
      () => setConnection((current) => ({ ...current, state: 'reconnecting' }))
    );
    return close;
  }, [session?.user.id]);

  useEffect(() => {
    const refresh = () => fetchSounds().then((result) => setSounds(result.sounds)).catch(() => undefined);
    window.addEventListener('essentials-calls:sounds-changed', refresh);
    return () => window.removeEventListener('essentials-calls:sounds-changed', refresh);
  }, []);

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches('input, textarea, select, [contenteditable="true"]')) return;
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.shiftKey ? history.redo() : history.undo();
      } else if (event.key.toLowerCase() === 'y') {
        event.preventDefault();
        history.redo();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [history.undo, history.redo]);

  const soundReferences = useMemo(
    () => new Set([...BUILTIN_PROMPTS, ...sounds.map((sound) => sound.reference)]),
    [sounds]
  );
  const issues: ValidationIssue[] = useMemo(
    () => (topology ? validateTopology(topology, { soundReferences }) : []),
    [topology, soundReferences]
  );
  const hasErrors = issues.some((issue) => issue.severity === 'error');
  const canEdit = session?.user.role === 'editor' || session?.user.role === 'admin';
  const isAdmin = session?.user.role === 'admin';

  const refreshRevisions = () => fetchRevisions().then((result) => setRevisions(result.revisions));

  const refreshUsers = () => fetchUsers().then((result) => setUsers(result.users));

  useEffect(() => {
    if (tab === 'users' && isAdmin) refreshUsers().catch((error) => setOperation({ kind: 'error', message: message(error) }));
  }, [tab, isAdmin]);

  const persist = async (): Promise<number> => {
    if (!topology) throw new Error('Keine Topologie geladen.');
    const saved = await saveTopology(topology, revision);
    history.acceptSaved(saved.topology);
    setRevision(saved.revision);
    setActiveRevision(saved.activeRevision);
    await refreshRevisions();
    return saved.revision;
  };

  const handleSave = async () => {
    setOperation({ kind: 'busy', message: 'Speichere…' });
    try {
      await persist();
      setOperation({ kind: 'ok', message: 'Als neue Revision gespeichert.' });
    } catch (error) {
      setOperation({ kind: 'error', message: message(error) });
    }
  };

  const handleDeploy = async () => {
    setOperation({ kind: 'busy', message: 'Validiere und deploye…' });
    try {
      const deployRevisionNumber = history.dirty ? await persist() : revision;
      const result = await deployRevision(deployRevisionNumber);
      setActiveRevision(result.revision);
      await refreshRevisions();
      setOperation({ kind: 'ok', message: `Revision ${result.revision} aktiv; Runtime-Check erfolgreich.` });
    } catch (error) {
      if (error instanceof ApiError && typeof error.body.rolledBack === 'boolean') {
        setOperation({
          kind: 'error',
          message: `${error.message}${error.body.rolledBack ? ' Letzte funktionierende Konfiguration wurde wiederhergestellt.' : ''}`,
        });
      } else {
        setOperation({ kind: 'error', message: message(error) });
      }
    }
  };

  const chooseImport = async (file: File | undefined) => {
    setImportPreview('');
    setImportCandidate(undefined);
    if (!file) return;
    if (file.size > MAX_TOPOLOGY_IMPORT_BYTES) {
      setImportPreview(`Fehler: Datei überschreitet ${MAX_TOPOLOGY_IMPORT_BYTES} Byte.`);
      return;
    }
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const preview = await dryRunImport(parsed);
      setImportCandidate(parsed);
      setImportPreview(
        preview.valid
          ? `Dry-Run gültig (Schema v${preview.sourceSchemaVersion}${preview.migrated ? ', Migration erforderlich' : ''}).`
          : 'Dry-Run ungültig.'
      );
    } catch (error) {
      setImportPreview(`Fehler: ${message(error)}`);
    } finally {
      if (importInput.current) importInput.current.value = '';
    }
  };

  const applyCandidate = async () => {
    if (!importCandidate) return;
    setOperation({ kind: 'busy', message: 'Importiere atomar…' });
    try {
      const document = await applyImport(importCandidate, revision);
      history.reset(document.topology);
      setRevision(document.revision);
      setActiveRevision(document.activeRevision);
      setImportCandidate(undefined);
      setImportPreview('Import erfolgreich; History wurde zurückgesetzt.');
      await refreshRevisions();
      setOperation({ kind: 'ok', message: 'Import als neue Revision gespeichert.' });
    } catch (error) {
      setOperation({ kind: 'error', message: message(error) });
    }
  };

  const downloadExport = async () => {
    try {
      const blob = await exportTopology();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `simple-calls-topology-r${revision}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setOperation({ kind: 'error', message: message(error) });
    }
  };

  const doRollback = async (target: number) => {
    try {
      const document = await rollbackRevision(target, revision, `Rollback auf Revision ${target}`);
      history.reset(document.topology);
      setRevision(document.revision);
      setActiveRevision(document.activeRevision);
      await refreshRevisions();
      setOperation({ kind: 'ok', message: `Revision ${target} als neue Revision ${document.revision} wiederhergestellt.` });
    } catch (error) {
      setOperation({ kind: 'error', message: message(error) });
    }
  };

  const changeSecret = async (nodeId: string, secret: string) => {
    const document = await updateSipSecret(nodeId, secret, revision);
    history.acceptSaved(document.topology);
    setRevision(document.revision);
    await refreshRevisions();
  };

  if (session === undefined) return <div className="sb-root loading-screen" data-sb-theme={theme.resolved}>Authentisierung wird geprüft…</div>;
  if (!session) return <Login onLogin={setSession} theme={theme} />;
  if (loadError) {
    return <div className="sb-root loading-screen error-text" data-sb-theme={theme.resolved} role="alert">Topologie konnte nicht geladen werden: {loadError}</div>;
  }
  if (!topology || !service) return <div className="sb-root loading-screen" data-sb-theme={theme.resolved}>Arbeitsbereich wird geladen…</div>;

  const section: AppSection = tab === 'simple' || tab === 'advanced' ? 'callflow' : tab;
  const extensions = topology.nodes.filter((node): node is ExtensionNode => node.type === 'extension');
  const chooseSection = (next: AppSection) => {
    if (next === 'callflow') setTab('simple');
    else setTab(next);
  };
  const openExtension = (nodeId: string) => {
    setTab('simple');
    setSelection(nodeId ? { nodeId } : {});
  };

  return (
    <SimpleAppShell
      section={section}
      onSectionChange={chooseSection}
      username={session.user.username}
      role={session.user.role}
      isAdmin={!!isAdmin}
      theme={theme}
      onLogout={async () => { await logout(); setSession(null); }}
    >
      {section !== 'callflow' && operation.kind !== 'idle' && (
        <div className="operation-bar management-operation-bar">
          <span role={operation.kind === 'error' ? 'alert' : 'status'} className={operation.kind === 'error' ? 'error-text' : ''}>{operation.message}</span>
        </div>
      )}

      {section === 'callflow' && (
        <div className="callflow-workspace">
          <header className="callflow-header">
            <div>
              <p className="sb-eyebrow">Callflow-Editor</p>
              <h1 className="callflow-title">{topology.name}</h1>
              <div className="callflow-meta">
                <span className="revision-badge">Entwurf r{revision} · aktiv {activeRevision ? `r${activeRevision}` : '—'}{history.dirty ? ' · ungespeichert' : ''}</span>
                <span className={`connection-state ${connection.state}`} title={`Reconnect-Versuch ${connection.reconnectAttempt}`}>AMI: {connection.state}</span>
                <span className={`validation-state ${hasErrors ? 'invalid' : 'valid'}`}>
                  {hasErrors ? <ShieldAlert className="sb-icon" aria-hidden="true" /> : <CheckCircle2 className="sb-icon" aria-hidden="true" />}
                  {hasErrors ? `${issues.filter((issue) => issue.severity === 'error').length} Fehler` : 'gültig'}
                </span>
              </div>
            </div>
            <div className="callflow-primary-actions">
              {canEdit && <button className="sb-button" onClick={handleSave} disabled={hasErrors || operation.kind === 'busy'}><Save className="sb-icon" aria-hidden="true" />Speichern</button>}
              {isAdmin && <button className="sb-button sb-button-primary" onClick={handleDeploy} disabled={hasErrors || operation.kind === 'busy'}><Rocket className="sb-icon" aria-hidden="true" />Deploy</button>}
            </div>
          </header>

          <div className="callflow-toolbar">
            <div className="sb-tabs" role="tablist" aria-label="Editoransicht">
              <button className="sb-tab" type="button" role="tab" aria-selected={tab === 'simple'} onClick={() => setTab('simple')}>Graph</button>
              <button className="sb-tab" type="button" role="tab" aria-selected={tab === 'advanced'} onClick={() => setTab('advanced')}>Tabelle</button>
            </div>
            <div className="editor-actions">
              <button className="sb-button compact-button" type="button" onClick={history.undo} disabled={!canEdit || !history.canUndo} aria-label="Rückgängig"><Undo2 className="sb-icon" aria-hidden="true" /><span>Undo</span></button>
              <button className="sb-button compact-button" type="button" onClick={history.redo} disabled={!canEdit || !history.canRedo} aria-label="Wiederholen"><Redo2 className="sb-icon" aria-hidden="true" /><span>Redo</span></button>
              <button className="sb-button compact-button" type="button" onClick={downloadExport}><FileDown className="sb-icon" aria-hidden="true" /><span>Redigierter Export</span></button>
              {isAdmin && <button className="sb-button compact-button" type="button" onClick={() => importInput.current?.click()}><FileUp className="sb-icon" aria-hidden="true" /><span>Import prüfen</span></button>}
              <input aria-label="Topologie importieren" ref={importInput} type="file" accept="application/json,.json" hidden onChange={(event) => chooseImport(event.target.files?.[0])} />
              {isAdmin && importCandidate !== undefined && <button className="sb-button" type="button" onClick={applyCandidate}>Geprüften Import anwenden</button>}
            </div>
          </div>

          {(importPreview || operation.kind !== 'idle') && (
            <div className="operation-bar">
              {importPreview && <span role="status">{importPreview}</span>}
              {operation.kind !== 'idle' && <span role={operation.kind === 'error' ? 'alert' : 'status'} className={operation.kind === 'error' ? 'error-text' : ''}>{operation.message}</span>}
            </div>
          )}

          <div className="poc-status-banner" role="note">
            Technischer PoC · synthetisch getestet · keine produktive PBX, keine realen Trunks, DIDs, Notrufe oder Carrier-/NAT-Audio-Abnahme · Rechte und Revenue offen
          </div>

          <div className="callflow-editor">
            {tab === 'simple' && (
              <SimpleView
                topology={topology}
                setTopology={history.update}
                statuses={statuses}
                issues={issues}
                selectedNodeId={selection.nodeId}
                selectedEdgeId={selection.edgeId}
                onSelect={setSelection}
                canEdit={!!canEdit}
                canManageSecrets={!!isAdmin}
                revision={revision}
                onSecretChange={changeSecret}
                onServerTopologyChanged={() => loadWorkspace(true)}
              />
            )}
            {tab === 'advanced' && <AdvancedView topology={topology} setTopology={history.update} issues={issues} readOnly={!canEdit} />}
          </div>
        </div>
      )}

      {section === 'revisions' && (
        <div className="sb-page management-page">
          <header className="sb-page-header">
            <div><p className="sb-eyebrow">Nachvollziehbarkeit</p><h1 className="sb-title">Revisionen</h1><p className="sb-subtitle">Unveränderliche Topologie-Stände; Rollback erzeugt immer eine neue Revision.</p></div>
          </header>
          <section className="revision-panel" aria-label="Versionshistorie">
            <div className="table-scroll"><table>
              <thead><tr><th>Revision</th><th>Zeit</th><th>Akteur</th><th>Kommentar</th><th>Änderung</th><th /></tr></thead>
              <tbody>{revisions.map((entry) => (
                <tr key={entry.revision}>
                  <td>r{entry.revision}{entry.active ? ' (aktiv)' : ''}</td><td>{new Date(entry.createdAt).toLocaleString()}</td><td>{entry.actor}</td><td>{entry.comment}</td><td>{entry.summary}</td>
                  <td>{isAdmin && entry.revision !== revision && <button className="sb-button" onClick={() => doRollback(entry.revision)}>Auf r{entry.revision} zurückrollen</button>}</td>
                </tr>
              ))}</tbody>
            </table></div>
          </section>
        </div>
      )}

      {section === 'softphones' && (
        <SoftphonesView extensions={extensions} endpoint={service.sipClientEndpoint} onOpenExtension={openExtension} />
      )}

      {section === 'users' && isAdmin && (
        <div className="sb-page management-page">
          <header className="sb-page-header"><div><p className="sb-eyebrow">Lokale Administration</p><h1 className="sb-title">Benutzer</h1><p className="sb-subtitle">Rollen und lokale Sitzungszugänge für diese einzelne Installation verwalten.</p></div></header>
          <UsersPanel users={users} currentUserId={session.user.id} onRefresh={refreshUsers} onError={(error) => setOperation({ kind: 'error', message: message(error) })} />
        </div>
      )}
    </SimpleAppShell>
  );
}

function UsersPanel({
  users,
  currentUserId,
  onRefresh,
  onError,
}: {
  users: UserInfo[];
  currentUserId: string;
  onRefresh: () => Promise<void>;
  onError: (error: unknown) => void;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [busy, setBusy] = useState(false);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await action();
      await onRefresh();
    } catch (error) {
      onError(error);
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="users-panel" aria-label="Benutzerverwaltung">
      <h2>Lokale Benutzer und Rollen</h2>
      <form
        className="user-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void run(async () => {
            await createUser(username, password, role);
            setUsername('');
            setPassword('');
            setRole('viewer');
          });
        }}
      >
        <label>Benutzername<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
        <label>Initialpasswort<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        <label>Rolle<select value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option>
        </select></label>
        <button type="submit" disabled={busy || username.length < 3 || password.length < 12}>Benutzer anlegen</button>
      </form>
      <table aria-label="Benutzer">
        <thead><tr><th>Benutzer</th><th>Rolle</th><th>Deaktiviert</th><th>Aktualisiert</th></tr></thead>
        <tbody>{users.map((user) => (
          <tr key={user.id}>
            <td>{user.username}{user.id === currentUserId ? ' (aktuell)' : ''}</td>
            <td><select
              aria-label={`Rolle für ${user.username}`}
              value={user.role}
              disabled={busy}
              onChange={(event) => void run(() => updateUser(user.id, { role: event.target.value as Role }))}
            ><option value="viewer">viewer</option><option value="editor">editor</option><option value="admin">admin</option></select></td>
            <td><input
              aria-label={`${user.username} deaktivieren`}
              type="checkbox"
              checked={user.disabled}
              disabled={busy || user.id === currentUserId}
              onChange={(event) => void run(() => updateUser(user.id, { disabled: event.target.checked }))}
            /></td>
            <td>{new Date(user.updatedAt).toLocaleString()}</td>
          </tr>
        ))}</tbody>
      </table>
    </section>
  );
}
