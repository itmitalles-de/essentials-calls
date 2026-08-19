import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { APIRequestContext, Page, expect, request, test } from '@playwright/test';

const repositoryRoot = path.resolve(process.cwd());
const browserBase = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:18180';
const apiBase = `${(process.env.E2E_API_URL ?? 'http://127.0.0.1:14100/api').replace(/\/$/, '')}/`;
const admin = {
  username: process.env.E2E_ADMIN_USERNAME ?? 'synthetic-e2e-admin',
  password: process.env.E2E_ADMIN_PASSWORD ?? 'SyntheticE2eAdmin-2026!',
};
const viewer = { username: 'synthetic-viewer', password: process.env.E2E_VIEWER_PASSWORD ?? 'SyntheticE2eViewer-2026!' };
const editor = { username: 'synthetic-editor', password: process.env.E2E_EDITOR_PASSWORD ?? 'SyntheticE2eEditor-2026!' };

interface ApiSession {
  context: APIRequestContext;
  csrfToken: string;
}

const browserFailures = new WeakMap<Page, string[]>();

function monitorBrowserFailures(page: Page): string[] {
  const failures: string[] = [];
  browserFailures.set(page, failures);
  page.on('console', (entry) => {
    // Chromium reports deliberately asserted 4xx/5xx API responses as generic
    // resource errors. Keep JavaScript console errors strict while the tests
    // assert the expected negative HTTP paths semantically through the UI.
    if (entry.type() === 'error' && !entry.text().startsWith('Failed to load resource:')) {
      failures.push(`console.error: ${entry.text()}`);
    }
  });
  page.on('pageerror', (error) => failures.push(`pageerror: ${error.message}`));
  return failures;
}

async function apiLogin(username: string, password: string): Promise<ApiSession> {
  const context = await request.newContext({ baseURL: apiBase });
  const response = await context.post('auth/login', { data: { username, password } });
  expect(response.ok(), `API login for ${username}`).toBeTruthy();
  const session = await response.json() as { csrfToken: string };
  return { context, csrfToken: session.csrfToken };
}

function mutationHeaders(session: ApiSession, extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-CSRF-Token': session.csrfToken, ...extra };
}

async function loginPage(page: Page, username = admin.username, password = admin.password): Promise<void> {
  await page.goto('/');
  await page.getByLabel('Benutzername').fill(username);
  await page.getByLabel('Passwort').fill(password);
  await page.getByRole('button', { name: 'Anmelden' }).click();
  await expect(page.getByText(`Angemeldet als ${username}`, { exact: false })).toBeVisible();
  await expect(page.getByRole('note')).toContainText('keine produktive PBX');
  await expect(page.getByLabel('Callflow-Graph')).toBeVisible();
}

async function selectGraphNode(page: Page, label: string): Promise<void> {
  // Newly placed nodes may sit beneath React Flow's minimap. Dispatching the
  // semantic node event avoids making editor correctness depend on random
  // placement coordinates while still exercising the application's handler.
  await page.locator('.react-flow__node').filter({ hasText: label }).dispatchEvent('click');
}

function pcmWav(): Buffer {
  const sampleRate = 8000;
  const samples = 800;
  const output = Buffer.alloc(44 + samples * 2);
  output.write('RIFF', 0);
  output.writeUInt32LE(36 + samples * 2, 4);
  output.write('WAVEfmt ', 8);
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(1, 22);
  output.writeUInt32LE(sampleRate, 24);
  output.writeUInt32LE(sampleRate * 2, 28);
  output.writeUInt16LE(2, 32);
  output.writeUInt16LE(16, 34);
  output.write('data', 36);
  output.writeUInt32LE(samples * 2, 40);
  for (let index = 0; index < samples; index++) {
    output.writeInt16LE(Math.round(Math.sin(index / 8) * 2000), 44 + index * 2);
  }
  return output;
}

function compose(...args: string[]): void {
  execFileSync(
    'docker',
    [
      'compose',
      '-p', process.env.E2E_COMPOSE_PROJECT ?? 'essentials-calls-e2e',
      '-f', path.join(repositoryRoot, 'docker-compose.yml'),
      '-f', path.join(repositoryRoot, 'docker-compose.acceptance.yml'),
      ...args,
    ],
    { cwd: repositoryRoot, env: process.env, stdio: 'pipe', timeout: 120_000 }
  );
}

test.describe.serial('Essentials+ Calls browser acceptance', () => {
  test.beforeEach(async ({ page }) => {
    monitorBrowserFailures(page);
  });

  test.afterEach(async ({ page }) => {
    expect(browserFailures.get(page) ?? [], 'browser console errors or unhandled page exceptions').toEqual([]);
  });

  test.beforeAll(async () => {
    const session = await apiLogin(admin.username, admin.password);
    try {
      const listed = await session.context.get('users');
      expect(listed.ok()).toBeTruthy();
      const existing = new Set(((await listed.json()) as { users: Array<{ username: string }> }).users.map((user) => user.username));
      for (const candidate of [
        { ...viewer, role: 'viewer' },
        { ...editor, role: 'editor' },
        { username: 'synthetic-role-switch', password: 'SyntheticRoleSwitch-2026!', role: 'viewer' },
      ] as const) {
        if (existing.has(candidate.username)) continue;
        const created = await session.context.post('users', {
          headers: mutationHeaders(session),
          data: { username: candidate.username, password: candidate.password, role: candidate.role },
        });
        expect(created.status(), `create ${candidate.username}`).toBe(201);
      }
    } finally {
      await session.context.dispose();
    }
  });

  test('login, graph/table editing, edges and bounded undo/redo are semantic', async ({ page, browser }) => {
    await loginPage(page);
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();

    await page.locator('.react-flow__node').first().click();
    await page.getByRole('button', { name: 'Zoom in' }).click();
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();

    const nodes = page.locator('.react-flow__node');
    const initialNodeCount = await nodes.count();
    await page.getByRole('button', { name: '+ Extension', exact: true }).click();
    await expect(nodes).toHaveCount(initialNodeCount + 1);

    // Saving is a persisted baseline, not an undo boundary: when creation is
    // the only edit, one Undo removes the node and Redo returns to the saved
    // revision state.
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Als neue Revision gespeichert.', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeEnabled();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('Neue Extension', { exact: true })).toHaveCount(0);
    await expect(page.locator('.revision-badge')).toContainText('ungespeichert');
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(page.getByText('Neue Extension', { exact: true })).toBeVisible();
    await expect(page.locator('.revision-badge')).not.toContainText('ungespeichert');

    // Multiple property edits before the next save remain individual history
    // entries instead of being collapsed into the original node creation.
    await selectGraphNode(page, 'Neue Extension');
    await page.getByLabel('Label', { exact: true }).fill('E2E Extension');
    await page.getByLabel('Nummer', { exact: true }).fill('199');
    await page.getByLabel('SIP User', { exact: true }).fill('199');

    await page.getByRole('button', { name: 'Tabelle' }).click();
    await expect(page.getByRole('table', { name: 'Nodes' }).locator('tbody tr').last().locator('input').first()).toHaveValue('E2E Extension');
    await page.getByRole('button', { name: 'Graph' }).click();
    await selectGraphNode(page, 'E2E Extension');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Als neue Revision gespeichert.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('E2E Extension', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Nummer', { exact: true })).toHaveValue('199');
    await expect(page.getByLabel('SIP User', { exact: true })).toHaveValue('100');
    await expect(page.locator('.revision-badge')).toContainText('ungespeichert');
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(page.getByLabel('SIP User', { exact: true })).toHaveValue('199');
    await expect(page.locator('.revision-badge')).not.toContainText('ungespeichert');

    // Edits after save use the same history and dirty-state contract.
    await page.getByLabel('Label', { exact: true }).fill('E2E Extension draft');
    await expect(page.locator('.revision-badge')).toContainText('ungespeichert');
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('E2E Extension', { exact: true })).toBeVisible();
    await expect(page.locator('.revision-badge')).not.toContainText('ungespeichert');
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(page.getByText('E2E Extension draft', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Rückgängig' }).click();

    await page.reload();
    await expect(page.getByText('E2E Extension', { exact: true })).toBeVisible();
    await selectGraphNode(page, 'E2E Extension');
    await expect(page.getByLabel('SIP User', { exact: true })).toHaveValue('199');
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();

    // Graph/table transitions and edge operations use the same topology and do
    // not compromise node history.
    await page.getByRole('button', { name: 'Tabelle' }).click();
    const edgeRows = page.getByRole('table', { name: 'Edges' }).locator('tbody tr');
    const initialEdgeCount = await edgeRows.count();
    await page.getByRole('button', { name: '+ Edge', exact: true }).click();
    await expect(edgeRows).toHaveCount(initialEdgeCount + 1);
    await edgeRows.last().getByRole('button', { name: 'löschen' }).click();
    await expect(edgeRows).toHaveCount(initialEdgeCount);

    await page.getByRole('button', { name: 'Graph' }).click();
    await selectGraphNode(page, 'E2E Extension');
    await page.getByRole('button', { name: 'Node löschen' }).click();
    await expect(page.getByText('E2E Extension', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('E2E Extension', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Wiederholen' }).click();
    await expect(page.getByText('E2E Extension', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Rückgängig' }).click();

    // A reload is an explicit history reset while the saved revision remains.
    await page.reload();
    await expect(page.getByText('E2E Extension', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();
    await selectGraphNode(page, 'E2E Extension');
    await page.getByLabel('Neues SIP-Secret (Admin)').fill('SyntheticE2eExtension-199!');
    await page.getByRole('button', { name: 'Secret ersetzen' }).click();
    await expect(page.getByText('Secret geändert. Der alte Wert wurde nicht zurückgegeben.', { exact: true })).toBeVisible();

    // Re-authentication in a fresh browser context proves server persistence,
    // not merely React state surviving a page reload.
    const restartedContext = await browser.newContext({ baseURL: browserBase });
    const restartedPage = await restartedContext.newPage();
    const restartedFailures = monitorBrowserFailures(restartedPage);
    try {
      await loginPage(restartedPage);
      await expect(restartedPage.getByText('E2E Extension', { exact: true })).toBeVisible();
      await selectGraphNode(restartedPage, 'E2E Extension');
      await expect(restartedPage.getByLabel('Nummer', { exact: true })).toHaveValue('199');
      await expect(restartedPage.getByLabel('SIP User', { exact: true })).toHaveValue('199');
      await expect(restartedPage.getByRole('button', { name: 'Rückgängig' })).toBeDisabled();
      expect(restartedFailures, 'fresh browser console errors or unhandled page exceptions').toEqual([]);
    } finally {
      await restartedContext.close();
    }
  });

  test('live validation blocks an invalid deploy and a valid revision deploys', async ({ page }) => {
    await loginPage(page);
    await page.locator('.react-flow__node').filter({ hasText: 'IVR' }).first().click();
    await page.getByLabel('Begrüßungsreferenz').fill('custom/missing-e2e-prompt');
    await expect(page.getByText(/\d+ Fehler/)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deploy' })).toBeDisabled();
    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('gültig', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Deploy' }).click();
    await expect(page.getByRole('status')).toContainText(/Revision \d+ aktiv; Runtime-Check erfolgreich/);
  });

  test('versioned import/export and referenced sound protection work through the UI', async ({ page }) => {
    await loginPage(page);
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Redigierter Export' }).click();
    const download = await downloadPromise;
    const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as Record<string, unknown>;
    expect(exported.schemaVersion).toBe(2);
    expect(exported.product).toBe('Essentials+ Calls');
    expect(exported.redacted).toBe(true);
    expect(JSON.stringify(exported)).not.toContain('sipPassword');

    await page.getByLabel('Topologie importieren').setInputFiles(path.join(repositoryRoot, 'tests/acceptance/fixtures/topology-v1.json'));
    await expect(page.getByRole('status')).toContainText('Dry-Run gültig (Schema v1, Migration erforderlich)');
    await page.getByRole('button', { name: 'Geprüften Import anwenden' }).click();
    await expect(page.getByText('Import als neue Revision gespeichert.', { exact: true })).toBeVisible();
    await expect(page.getByText('Synthetic IVR', { exact: true })).toBeVisible();

    await page.getByText('Synthetic IVR', { exact: true }).click();
    await page.getByLabel('Ansagedatei hochladen').setInputFiles({
      name: 'e2e-prompt.wav',
      mimeType: 'audio/wav',
      buffer: pcmWav(),
    });
    await expect(page.getByLabel('Begrüßungsreferenz')).toHaveValue('custom/e2e-prompt');
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByText('Als neue Revision gespeichert.', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: 'Tabelle' }).click();
    await page.getByRole('button', { name: 'Graph' }).click();
    await page.getByText('Synthetic IVR', { exact: true }).click();
    await expect(page.getByText('Referenziert von: Synthetic IVR')).toBeVisible();
    await page.getByRole('button', { name: 'Löschen', exact: true }).click();
    await expect(page.getByText(/Ansage wird verwendet von: Synthetic IVR/)).toBeVisible();
    await page.getByLabel('Ersatz vor Löschen').selectOption('hello-world');
    await page.getByRole('button', { name: 'Löschen', exact: true }).click();
    await page.getByText('Synthetic IVR', { exact: true }).click();
    await expect(page.getByLabel('Begrüßungsreferenz')).toHaveValue('hello-world');
  });

  test('theme preference persists across a reload', async ({ page }) => {
    await loginPage(page);
    const toggle = page.getByRole('button', { name: /^Design umschalten/ });
    await toggle.click();
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('admin user management and viewer/editor UI rights follow server roles', async ({ page }) => {
    await loginPage(page);
    await page.getByRole('button', { name: 'Benutzer' }).click();
    const roleSelect = page.getByLabel('Rolle für synthetic-role-switch');
    await expect(roleSelect).toHaveValue('viewer');
    await roleSelect.selectOption('editor');
    await expect(roleSelect).toHaveValue('editor');
    await roleSelect.selectOption('viewer');
    await expect(roleSelect).toHaveValue('viewer');

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await loginPage(page, viewer.username, viewer.password);
    await expect(page.getByRole('button', { name: '+ Extension', exact: true })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Speichern' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Deploy' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Benutzer' })).toHaveCount(0);

    await page.getByRole('button', { name: 'Abmelden' }).click();
    await loginPage(page, editor.username, editor.password);
    await expect(page.getByRole('button', { name: '+ Extension', exact: true })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Speichern' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Deploy' })).toHaveCount(0);
    await page.locator('.react-flow__node').first().click();
    await expect(page.getByText('Neues SIP-Secret (Admin)')).toHaveCount(0);
  });

  test('a parallel editor receives a visible revision conflict instead of overwriting', async ({ page }) => {
    await loginPage(page, editor.username, editor.password);
    await page.locator('.react-flow__node').first().click();
    const label = page.getByLabel('Label', { exact: true });
    await label.fill(`${await label.inputValue()} stale browser change`);

    const remote = await apiLogin(editor.username, editor.password);
    try {
      const loaded = await remote.context.get('topology');
      const document = await loaded.json() as { topology: { name: string }; revision: number };
      document.topology.name = `Parallel writer ${Date.now()}`;
      const saved = await remote.context.put('topology', {
        headers: mutationHeaders(remote, { 'If-Match': `"rev-${document.revision}"` }),
        data: document.topology,
      });
      expect(saved.ok()).toBeTruthy();
    } finally {
      await remote.context.dispose();
    }

    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('alert')).toContainText('Versionskonflikt');
  });

  test('an older immutable revision rolls forward as a new revision', async ({ page }) => {
    await loginPage(page);
    const api = await apiLogin(admin.username, admin.password);
    let targetRevision: number;
    try {
      const loaded = await api.context.get('topology');
      targetRevision = ((await loaded.json()) as { revision: number }).revision;
    } finally {
      await api.context.dispose();
    }

    await page.locator('.react-flow__node').first().click();
    const label = page.getByLabel('Label', { exact: true });
    const originalLabel = await label.inputValue();
    await label.fill(`${originalLabel} rollback marker`);
    await page.getByRole('button', { name: 'Speichern' }).click();
    await expect(page.getByRole('status')).toContainText('Als neue Revision gespeichert');
    await page.getByRole('button', { name: 'Revisionen' }).click();
    await page.getByRole('button', { name: `Auf r${targetRevision} zurückrollen` }).click();
    await expect(page.getByRole('status')).toContainText(new RegExp(`Revision ${targetRevision} als neue Revision \\d+ wiederhergestellt`));
    await page.getByRole('button', { name: 'Graph' }).click();
    await expect(page.getByText(originalLabel, { exact: true })).toBeVisible();
  });

  test('AMI outage is visible and the event connection recovers automatically', async ({ page }) => {
    await loginPage(page);
    await expect(page.getByText('AMI: connected', { exact: true })).toBeVisible();
    compose('stop', 'asterisk');
    try {
      await expect(page.locator('.connection-state')).toHaveText(/AMI: (reconnecting|degraded)/, { timeout: 30_000 });
    } finally {
      compose('start', 'asterisk');
    }
    await expect(page.getByText('AMI: connected', { exact: true })).toBeVisible({ timeout: 60_000 });
  });
});
