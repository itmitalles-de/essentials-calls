import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import {
  BUILTIN_PROMPTS,
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
import { THEME_ICONS, THEME_LABELS, useTheme } from './theme';
import { useBoundedHistory } from './history';

type Tab = 'simple' | 'advanced' | 'revisions' | 'users';
type Operation = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string };

function message(error: unknown): string {
  if (error instanceof ApiError && error.status === 409) return `Versionskonflikt: ${error.message}`;
  return error instanceof Error ? error.message : 'Unbekannter Fehler.';
}

function Login({ onLogin }: { onLogin: (session: AuthSession) => void }) {
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
    <main className="login-shell">
      <form className="login-card" onSubmit={submit} aria-label="Anmeldung">
        <h1>Essentials+ Calls</h1>
        <p>Sichere lokale Administration</p>
        <label>
          Benutzername
          <input name="username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        </label>
        <label>
          Passwort
          <input
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Anmeldung läuft…' : 'Anmelden'}</button>
        {error && <div role="alert" className="error-text">{error}</div>}
      </form>
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
    const [document, soundResult, revisionResult] = await Promise.all([fetchTopology(), fetchSounds(), fetchRevisions()]);
    if (resetHistory) history.reset(document.topology);
    else history.acceptSaved(document.topology);
    setRevision(document.revision);
    setActiveRevision(document.activeRevision);
    setSounds(soundResult.sounds);
    setRevisions(revisionResult.revisions);
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
      anchor.download = `essentials-calls-topology-r${revision}.json`;
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

  if (session === undefined) return <div style={{ padding: 24 }}>Authentisierung wird geprüft…</div>;
  if (!session) return <Login onLogin={setSession} />;
  if (loadError) {
    return <div style={{ padding: 24 }} role="alert">Topologie konnte nicht geladen werden: {loadError}</div>;
  }
  if (!topology) return <div style={{ padding: 24 }}>Arbeitsbereich wird geladen…</div>;

  return (
    <div className="app-shell">
      <header className="app-header">
        <strong>Essentials+ Calls</strong>
        <nav aria-label="Ansichten">
          <button onClick={() => setTab('simple')} disabled={tab === 'simple'}>Graph</button>
          <button onClick={() => setTab('advanced')} disabled={tab === 'advanced'}>Tabelle</button>
          <button onClick={() => setTab('revisions')} disabled={tab === 'revisions'}>Revisionen</button>
          {isAdmin && <button onClick={() => setTab('users')} disabled={tab === 'users'}>Benutzer</button>}
        </nav>
        <span className="revision-badge">Entwurf r{revision} · aktiv {activeRevision ? `r${activeRevision}` : '—'}{history.dirty ? ' · ungespeichert' : ''}</span>
        <span className={`connection-state ${connection.state}`} title={`Reconnect-Versuch ${connection.reconnectAttempt}`}>
          AMI: {connection.state}
        </span>
        <span style={{ color: hasErrors ? 'var(--danger)' : 'var(--success)' }}>
          {hasErrors ? `${issues.filter((issue) => issue.severity === 'error').length} Fehler` : 'gültig'}
        </span>
        <button onClick={history.undo} disabled={!canEdit || !history.canUndo} aria-label="Rückgängig">↶ Undo</button>
        <button onClick={history.redo} disabled={!canEdit || !history.canRedo} aria-label="Wiederholen">↷ Redo</button>
        <button onClick={theme.cycle} aria-label={`Design umschalten, aktuell ${THEME_LABELS[theme.preference]}`}>
          {THEME_ICONS[theme.preference]} {THEME_LABELS[theme.preference]}
        </button>
        {canEdit && <button onClick={handleSave} disabled={hasErrors || operation.kind === 'busy'}>Speichern</button>}
        {isAdmin && <button onClick={handleDeploy} disabled={hasErrors || operation.kind === 'busy'}>Deploy</button>}
        <button onClick={async () => { await logout(); setSession(null); }}>Abmelden</button>
      </header>

      <div className="toolbar-secondary">
        <span>Angemeldet als {session.user.username} ({session.user.role})</span>
        <button onClick={downloadExport}>Redigierter Export</button>
        {isAdmin && <button onClick={() => importInput.current?.click()}>Import prüfen</button>}
        <input aria-label="Topologie importieren" ref={importInput} type="file" accept="application/json,.json" hidden onChange={(event) => chooseImport(event.target.files?.[0])} />
        {importPreview && <span role="status">{importPreview}</span>}
        {isAdmin && importCandidate !== undefined && <button onClick={applyCandidate}>Geprüften Import anwenden</button>}
        {operation.kind !== 'idle' && <span role={operation.kind === 'error' ? 'alert' : 'status'} className={operation.kind === 'error' ? 'error-text' : ''}>{operation.message}</span>}
      </div>

      <main className="app-main">
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
        {tab === 'revisions' && (
          <section className="revision-panel" aria-label="Versionshistorie">
            <h2>Unveränderliche Topologie-Revisionen</h2>
            <table>
              <thead><tr><th>Revision</th><th>Zeit</th><th>Akteur</th><th>Kommentar</th><th>Änderung</th><th /></tr></thead>
              <tbody>
                {revisions.map((entry) => (
                  <tr key={entry.revision}>
                    <td>r{entry.revision}{entry.active ? ' (aktiv)' : ''}</td>
                    <td>{new Date(entry.createdAt).toLocaleString()}</td>
                    <td>{entry.actor}</td>
                    <td>{entry.comment}</td>
                    <td>{entry.summary}</td>
                    <td>{isAdmin && entry.revision !== revision && <button onClick={() => doRollback(entry.revision)}>Auf r{entry.revision} zurückrollen</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
        {tab === 'users' && isAdmin && (
          <UsersPanel
            users={users}
            currentUserId={session.user.id}
            onRefresh={refreshUsers}
            onError={(error) => setOperation({ kind: 'error', message: message(error) })}
          />
        )}
      </main>
    </div>
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
