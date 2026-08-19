import { createSocket } from 'node:dgram';
import { readFile, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';

const API = process.env.ACCEPTANCE_API_URL ?? 'http://backend:4000/api';
const ASTERISK_HOST = process.env.ACCEPTANCE_ASTERISK_HOST ?? 'asterisk';
const ASTERISK_PORT = Number(process.env.ACCEPTANCE_ASTERISK_PORT ?? 5060);
const AMI_PORT = Number(process.env.ACCEPTANCE_AMI_PORT ?? 5038);
const AMI_USERNAME = process.env.AMI_USERNAME ?? 'visualpbx';
const AMI_SECRET = process.env.AMI_SECRET ?? '';
const ADMIN_USERNAME = process.env.ACCEPTANCE_ADMIN_USERNAME ?? 'synthetic-admin';
const ADMIN_PASSWORD = process.env.ACCEPTANCE_ADMIN_PASSWORD ?? '';
const ARTIFACT_ROOT = process.env.ACCEPTANCE_ARTIFACT_DIR ?? '/artifacts';
const FIXTURE = path.resolve('fixtures/topology-v1.json');
const SHARED_SOUNDS_DIR = process.env.ACCEPTANCE_SOUNDS_DIR ?? '/shared-sounds';
const ASTERISK_SOUND_GID = Number(process.env.ACCEPTANCE_ASTERISK_GID ?? 101);
const CUSTOM_PROMPT_NAME = 'synthetic-live-ivr';
const CUSTOM_PROMPT_REFERENCE = `custom/${CUSTOM_PROMPT_NAME}`;
const CUSTOM_PROMPT_DURATION_SECONDS = 3;
const CUSTOM_PROMPT_MEDIA_PORT = 16040;
const SYNTHETIC_SIP_SECRETS = [
  'synthetic-101-pass-2026',
  'synthetic-102-pass-2026',
  'synthetic-103-pass-2026',
];
const ROLE_FIXTURES = [
  { username: 'synthetic-recovery-viewer', password: 'SyntheticRecoveryViewer-2026!', role: 'viewer' },
  { username: 'synthetic-recovery-editor', password: 'SyntheticRecoveryEditor-2026!', role: 'editor' },
];
const RECOVERY_EVIDENCE_FILE = path.join(ARTIFACT_ROOT, 'recovery-state.json');

const results = [];
let cookie = '';
let csrfToken = '';
let revision = 0;
let activeRevision = null;

function record(name, details = '') {
  results.push({ name, details });
  process.stdout.write(`PASS ${name}${details ? ` — ${details}` : ''}\n`);
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function pcmToneWav(durationSeconds = CUSTOM_PROMPT_DURATION_SECONDS) {
  const sampleRate = 8000;
  const sampleCount = sampleRate * durationSeconds;
  const dataBytes = sampleCount * 2;
  const wav = Buffer.alloc(44 + dataBytes);
  wav.write('RIFF', 0, 'ascii');
  wav.writeUInt32LE(36 + dataBytes, 4);
  wav.write('WAVEfmt ', 8, 'ascii');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(sampleRate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'ascii');
  wav.writeUInt32LE(dataBytes, 40);
  for (let sample = 0; sample < sampleCount; sample++) {
    const value = Math.round(Math.sin(2 * Math.PI * 440 * sample / sampleRate) * 12_000);
    wav.writeInt16LE(value, 44 + sample * 2);
  }
  return wav;
}

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function waitFor(description, check, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      lastError = error;
    }
    await sleep(250);
  }
  throw new Error(`${description} was not ready in ${timeoutMs} ms${lastError ? `: ${lastError.message}` : ''}`);
}

async function api(url, options = {}) {
  const headers = new Headers(options.headers);
  if (cookie) headers.set('Cookie', cookie);
  if (csrfToken && options.method && !['GET', 'HEAD'].includes(options.method)) headers.set('X-CSRF-Token', csrfToken);
  const response = await fetch(`${API}${url}`, { ...options, headers });
  const text = await response.text();
  let body = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { response, body };
}

async function login() {
  invariant(ADMIN_PASSWORD, 'Synthetic acceptance admin password is missing.');
  const { response, body } = await api('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: ADMIN_USERNAME, password: ADMIN_PASSWORD }),
  });
  invariant(response.ok, `Login failed: HTTP ${response.status} ${body.error ?? ''}`);
  cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
  csrfToken = body.csrfToken;
  invariant(cookie && csrfToken, 'Login did not return a session cookie and CSRF token.');
  record('authenticated admin session');
}

async function ensureRoleFixtures() {
  const listed = await api('/users');
  invariant(listed.response.ok, `User listing failed: HTTP ${listed.response.status}`);
  const existing = new Set(listed.body.users.map((user) => user.username));
  for (const fixture of ROLE_FIXTURES) {
    if (existing.has(fixture.username)) continue;
    const created = await api('/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fixture),
    });
    invariant(created.response.status === 201, `Could not create synthetic ${fixture.role}: HTTP ${created.response.status}`);
  }
  record('administrator, editor and viewer role fixtures');
}

async function loadTopology() {
  const { response, body } = await api('/topology');
  invariant(response.ok, `Topology load failed: HTTP ${response.status}`);
  revision = body.revision;
  activeRevision = body.activeRevision;
  return body;
}

async function importFixture() {
  const document = JSON.parse(await readFile(FIXTURE, 'utf8'));
  const dryRun = await api('/topology/import/dry-run', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(document),
  });
  invariant(dryRun.response.ok && dryRun.body.valid && dryRun.body.sourceSchemaVersion === 1, 'V1 dry-run migration failed.');
  record('versioned import dry-run and v1 migration');

  const imported = await api('/topology/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` },
    body: JSON.stringify(document),
  });
  invariant(imported.response.status === 201 && imported.body.imported, `Atomic import failed: ${imported.body.error ?? imported.response.status}`);
  revision = imported.body.revision;
  activeRevision = imported.body.activeRevision;
  invariant(imported.body.topology.nodes.every((node) => !node.properties?.sipPassword), 'Plaintext secret leaked after migration.');
  record('atomic legacy import with redacted secrets', `revision ${revision}`);
}

async function uploadCustomIvrPrompt() {
  invariant(Number.isInteger(ASTERISK_SOUND_GID) && ASTERISK_SOUND_GID >= 0, 'Synthetic Asterisk sound GID is invalid.');
  const upload = await api(`/sounds/${CUSTOM_PROMPT_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'audio/wav' },
    body: pcmToneWav(),
  });
  invariant(
    upload.response.ok && upload.body.sound?.reference === CUSTOM_PROMPT_REFERENCE,
    `Custom WAV upload failed: HTTP ${upload.response.status} ${upload.body.error ?? ''}`
  );

  const [directoryInfo, fileInfo] = await Promise.all([
    stat(SHARED_SOUNDS_DIR),
    stat(path.join(SHARED_SOUNDS_DIR, `${CUSTOM_PROMPT_NAME}.wav`)),
  ]);
  const directoryMode = directoryInfo.mode & 0o777;
  const fileMode = fileInfo.mode & 0o777;
  invariant(
    directoryInfo.gid === ASTERISK_SOUND_GID && directoryMode === 0o750,
    `Custom sound directory is not Asterisk-traversable (gid=${directoryInfo.gid}, mode=${directoryMode.toString(8)}).`
  );
  invariant(
    fileInfo.gid === ASTERISK_SOUND_GID && fileMode === 0o640,
    `Uploaded custom WAV is not group-readable by Asterisk (gid=${fileInfo.gid}, mode=${fileMode.toString(8)}).`
  );
  record('custom WAV upload is group-readable by Asterisk', `gid ${fileInfo.gid}, mode ${fileMode.toString(8)}`);

  const current = await loadTopology();
  const topology = structuredClone(current.topology);
  const ivr = topology.nodes.find((node) => node.id === 'ivr-main');
  invariant(ivr?.type === 'ivr', 'Synthetic IVR node is missing.');
  ivr.properties.greeting = CUSTOM_PROMPT_REFERENCE;
  const saved = await api('/topology', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'If-Match': `"rev-${revision}"`,
      'X-Revision-Comment': 'Use uploaded synthetic IVR prompt',
    },
    body: JSON.stringify(topology),
  });
  invariant(saved.response.ok && saved.body.saved, `Custom IVR topology save failed: HTTP ${saved.response.status}`);
  revision = saved.body.revision;
  activeRevision = saved.body.activeRevision;
}

async function assertRestoredCustomIvrPrompt() {
  const [directoryInfo, fileInfo, sounds] = await Promise.all([
    stat(SHARED_SOUNDS_DIR),
    stat(path.join(SHARED_SOUNDS_DIR, `${CUSTOM_PROMPT_NAME}.wav`)),
    api('/sounds'),
  ]);
  invariant(sounds.response.ok, `Restored sound inventory failed: HTTP ${sounds.response.status}`);
  invariant(
    sounds.body.sounds.some((sound) => sound.reference === CUSTOM_PROMPT_REFERENCE),
    'Restored custom WAV is missing from the authoritative sound inventory.'
  );
  invariant(
    directoryInfo.gid === ASTERISK_SOUND_GID && (directoryInfo.mode & 0o777) === 0o750,
    `Restored sound directory permissions are wrong (gid=${directoryInfo.gid}, mode=${(directoryInfo.mode & 0o777).toString(8)}).`
  );
  invariant(
    fileInfo.gid === ASTERISK_SOUND_GID && (fileInfo.mode & 0o777) === 0o640,
    `Restored custom WAV permissions are wrong (gid=${fileInfo.gid}, mode=${(fileInfo.mode & 0o777).toString(8)}).`
  );
  record('restored custom WAV inventory and Asterisk file permissions', `gid ${fileInfo.gid}, mode ${(fileInfo.mode & 0o777).toString(8)}`);
}

async function blockedDeploy() {
  const loaded = await loadTopology();
  const invalid = structuredClone(loaded.topology);
  invalid.nodes.find((node) => node.id === 'ivr-main').properties.greeting = 'custom/missing-synthetic-prompt';
  const attempt = await api('/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` },
    body: JSON.stringify({ topology: invalid }),
  });
  invariant(attempt.response.status === 400 && attempt.body.deployed === false, 'Invalid sound reference was not blocked.');
  const unchanged = await loadTopology();
  invariant(unchanged.revision === revision, 'Invalid deploy partially persisted its topology.');
  record('invalid callflow blocked without partial save');
}

async function deploy() {
  const attempt = await api('/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` },
    body: '{}',
  });
  invariant(attempt.response.ok && attempt.body.deployed && attempt.body.runtimeHealthy, `Deploy failed: ${attempt.body.error ?? attempt.response.status}`);
  const generatedPjsip = await readFile(
    path.join(process.env.ACCEPTANCE_CONFIG_DIR ?? '/shared-config-control', 'current', 'pjsip_generated.conf'),
    'utf8'
  );
  invariant(/auth_type=md5[\s\S]*md5_cred=[0-9a-f]{32}/.test(generatedPjsip), 'Asterisk 18 HA1 auth was not generated.');
  invariant(!/synthetic-(?:101|102|103)-pass-2026/.test(generatedPjsip), 'Generated PJSIP config contains a plaintext SIP secret.');
  record('generated PJSIP stores Asterisk 18 HA1 credentials without plaintext');
  activeRevision = attempt.body.revision;
  record('Asterisk staging preflight, atomic activate, reload and runtime canary', attempt.body.deploymentId);
  return attempt.body;
}

class AmiConnection {
  constructor() {
    this.socket = null;
    this.buffer = '';
    this.messages = [];
    this.waiters = [];
    this.sequence = 0;
    this.events = [];
  }

  async connect() {
    this.socket = net.createConnection({ host: ASTERISK_HOST, port: AMI_PORT });
    this.socket.setEncoding('utf8');
    this.socket.on('data', (chunk) => this.onData(chunk));
    await new Promise((resolve, reject) => {
      this.socket.once('connect', resolve);
      this.socket.once('error', reject);
    });
    await this.waitFor((message) => message.banner, 5000);
    const login = await this.action({ Action: 'Login', Username: AMI_USERNAME, Secret: AMI_SECRET });
    invariant(login.Response === 'Success', `AMI login failed: ${login.Message ?? ''}`);
  }

  onData(chunk) {
    this.buffer += chunk;
    if (this.buffer.startsWith('Asterisk Call Manager/')) {
      const index = this.buffer.indexOf('\r\n');
      if (index >= 0) {
        this.buffer = this.buffer.slice(index + 2);
        this.dispatch({ banner: true });
      }
    }
    let index;
    while ((index = this.buffer.indexOf('\r\n\r\n')) >= 0) {
      const block = this.buffer.slice(0, index);
      this.buffer = this.buffer.slice(index + 4);
      const message = {};
      for (const line of block.split('\r\n')) {
        const separator = line.indexOf(':');
        if (separator < 0) continue;
        const key = line.slice(0, separator).trim();
        const value = line.slice(separator + 1).trim();
        message[key] = key === 'Output' && message[key] ? `${message[key]}\n${value}` : value;
      }
      if (message.Event) this.events.push(message);
      this.dispatch(message);
    }
  }

  dispatch(message) {
    for (const waiter of [...this.waiters]) {
      if (!waiter.predicate(message)) continue;
      clearTimeout(waiter.timer);
      this.waiters.splice(this.waiters.indexOf(waiter), 1);
      waiter.resolve(message);
      return;
    }
    this.messages.push(message);
  }

  waitFor(predicate, timeoutMs = 5000) {
    const existing = this.messages.findIndex(predicate);
    if (existing >= 0) return Promise.resolve(this.messages.splice(existing, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          this.waiters.splice(this.waiters.indexOf(waiter), 1);
          reject(new Error('AMI response timed out.'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async action(fields, timeoutMs = 8000) {
    const ActionID = `acceptance-${++this.sequence}`;
    this.socket.write(`${Object.entries({ ...fields, ActionID }).map(([key, value]) => `${key}: ${value}`).join('\r\n')}\r\n\r\n`);
    return this.waitFor((message) => message.ActionID === ActionID && !!message.Response, timeoutMs);
  }

  async command(command) {
    const response = await this.action({ Action: 'Command', Command: command });
    invariant(
      response.Response !== 'Error',
      `AMI command failed (${command}): ${response.Message ?? ''}; response ${JSON.stringify(response)}`
    );
    return response.Output ?? response.Message ?? '';
  }

  close() {
    this.socket?.end();
    this.socket?.destroy();
  }
}

function runSipp(args, name, timeoutMs = 25_000) {
  return new Promise((resolve, reject) => {
    const child = spawn('sipp', args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${name} timed out.\n${output.slice(-2000)}`));
    }, timeoutMs);
    child.once('error', reject);
    child.once('exit', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(output);
      else reject(new Error(`${name} exited ${code}.\n${output.slice(-4000)}`));
    });
  });
}

function startUas(extension, password, port) {
  const input = `/tmp/uas-${extension}-${port}.csv`;
  const ready = BunCompatWrite(input, `SEQUENTIAL\n${password};${port}\n`);
  const uasArgs = [ASTERISK_HOST, '-sf', 'scenarios/uas.xml', '-s', extension,
    '-p', String(port), '-t', 'u1', '-rtp_echo', '-trace_err', '-nostdin'];
  let output = '';
  const holder = {
    child: null,
    stopping: false,
    output: () => output,
    stop() {
      this.stopping = true;
      this.child?.kill('SIGTERM');
    },
  };
  holder.started = ready.then(async () => {
    const child = spawn('sipp', uasArgs, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    holder.child = child;
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    child.once('exit', (code) => {
      if (code !== 0 && !holder.stopping) process.stderr.write(`SIPp UAS ${extension}:${port} exited ${code}: ${output.slice(-2000)}\n`);
    });
    await sleep(150);
    await runSipp([
      ASTERISK_HOST, '-sf', 'scenarios/register.xml', '-inf', input, '-s', extension,
      '-au', extension, '-ap', password, '-p', String(port + 1000), '-t', 'u1', '-m', '1', '-nostdin',
    ], `registration for ${extension}`);
    return child;
  });
  return holder;
}

async function waitForRegistered(ami, users) {
  await waitFor('synthetic SIP registration', async () => {
    const contacts = await ami.command('pjsip show contacts');
    const lines = contacts.split('\n');
    return users.every((user) => lines.some((line) => new RegExp(`\\b${user}/`).test(line)));
  }, 20_000);
}

async function directCallAndReregistration(ami) {
  const endpoint = startUas('102', 'synthetic-102-pass-2026', 5072);
  const endpoint103 = startUas('103', 'synthetic-103-pass-2026', 5073);
  try {
    await Promise.all([endpoint.started, endpoint103.started]);
    await waitForRegistered(ami, ['102', '103']);
    const input = '/tmp/direct-call.csv';
    await BunCompatWrite(input, 'SEQUENTIAL\nsynthetic-101-pass-2026;102;1200\n');
    await runSipp([ASTERISK_HOST, '-sf', 'scenarios/uac.xml', '-inf', input, '-s', '101', '-au', '101', '-ap', 'synthetic-101-pass-2026', '-p', '5071', '-m', '1', '-nostdin'], 'direct internal call');
    record('multiple synthetic registration plus direct internal call');
  } finally {
    endpoint.stop();
    endpoint103.stop();
    await sleep(400);
  }

  const replacement = startUas('102', 'synthetic-102-pass-2026', 5082);
  try {
    await replacement.started;
    await waitForRegistered(ami, ['102']);
    const contacts = await ami.command('pjsip show contacts');
    invariant(contacts.includes(':5082'), 'Repeated registration did not replace the old contact port.');
    record('repeated registration replaces previous contact');
  } finally {
    replacement.stop();
  }
}

async function customIvrMedia(ami) {
  const socket = createSocket('udp4');
  let rtpPackets = 0;
  let rtpBytes = 0;
  const payloadValues = new Set();
  socket.on('message', (message) => {
    if (message.length < 12 || message[0] >> 6 !== 2) return;
    const payloadType = message[1] & 0x7f;
    if (payloadType !== 0 && payloadType !== 8) return;
    const payloadOffset = 12 + (message[0] & 0x0f) * 4;
    if (payloadOffset >= message.length) return;
    rtpPackets += 1;
    rtpBytes += message.length - payloadOffset;
    for (const value of message.subarray(payloadOffset)) payloadValues.add(value);
  });
  await new Promise((resolve, reject) => {
    const onError = (error) => reject(error);
    socket.once('error', onError);
    socket.bind(CUSTOM_PROMPT_MEDIA_PORT, '0.0.0.0', () => {
      socket.off('error', onError);
      resolve();
    });
  });

  const before = ami.events.length;
  const input = '/tmp/custom-ivr-media.csv';
  await BunCompatWrite(input, `SEQUENTIAL\nsynthetic-101-pass-2026;604;${CUSTOM_PROMPT_MEDIA_PORT}\n`);
  try {
    await runSipp([
      ASTERISK_HOST, '-sf', 'scenarios/uac-media.xml', '-inf', input, '-s', '101',
      '-au', '101', '-ap', 'synthetic-101-pass-2026', '-p', '5104',
      '-m', '1', '-nostdin',
    ], 'custom IVR media call', 30_000);
    await waitFor(
      'custom IVR Background application',
      () => ami.events.slice(before).some(
        (event) => event.Event === 'Newexten' &&
          event.Application?.toLowerCase() === 'background' &&
          event.AppData === CUSTOM_PROMPT_REFERENCE
      ),
      5000
    );
  } finally {
    socket.close();
  }
  invariant(rtpPackets >= 20 && rtpBytes >= 3200, `Custom IVR prompt produced insufficient RTP media (${rtpPackets} packets, ${rtpBytes} bytes).`);
  invariant(payloadValues.size >= 8, `Custom IVR RTP media did not contain the uploaded tone (${payloadValues.size} payload values).`);
  record('uploaded custom WAV traverses a synthetic IVR media call', `${rtpPackets} RTP packets`);
}

async function BunCompatWrite(file, content) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(file, content, 'utf8');
}

async function originate(ami, extension, context = 'entrypoints', callerLifetimeSeconds = 1) {
  const response = await ami.action({
    Action: 'Originate',
    Channel: `Local/${extension}@${context}`,
    Application: 'Wait',
    Data: String(callerLifetimeSeconds),
    Async: 'true',
    Variable: 'ESSENTIALS_SYNTHETIC_ACCEPTANCE=1',
  });
  invariant(response.Response === 'Success', `Originate ${context}/${extension} failed: ${response.Message ?? ''}`);
  await sleep(1500);
}

async function syntheticCallflows(ami) {
  const before = ami.events.length;
  const routes = [
    {
      extension: 603,
      name: 'ring group',
      matches: (event) => event.Event === 'Newexten' && event.Application === 'Dial' && /PJSIP\/102&PJSIP\/103/.test(event.AppData ?? ''),
    },
    {
      extension: 606,
      name: 'queue',
      matches: (event) => event.Event === 'Newexten' && event.Application === 'Queue' && /^queue_support(?:,|$)/.test(event.AppData ?? ''),
    },
    {
      extension: 607,
      name: 'schedule open branch',
      matches: (event) => event.Event === 'Newexten' && event.Application === 'Dial' && /PJSIP\/102&PJSIP\/103/.test(event.AppData ?? ''),
    },
  ];
  for (const [index, route] of routes.entries()) {
    const endpoint102 = startUas('102', 'synthetic-102-pass-2026', 5082 + index);
    try {
      await endpoint102.started;
      await waitForRegistered(ami, ['102']);
      const routeStart = ami.events.length;
      await originate(ami, route.extension);
      await waitFor(`${route.name} application`, () => ami.events.slice(routeStart).some(route.matches), 8000);
      record(`${route.name} reaches its expected Asterisk application`);
    } finally {
      endpoint102.stop();
      await sleep(250);
    }
  }
  await waitFor('queue caller departure event', () => ami.events.slice(before).some(
    (event) => ['QueueCallerLeave', 'QueueCallerAbandon', 'Leave', 'AgentComplete'].includes(event.Event)
  ), 12_000);
  const runtimeEvents = ami.events.slice(before);
  invariant(runtimeEvents.some((event) => event.Event === 'Newchannel'), 'No AMI channel event observed.');
  invariant(runtimeEvents.some((event) => event.Event === 'Hangup'), 'No AMI hangup event observed.');
  invariant(
    runtimeEvents.some((event) => ['QueueCallerJoin', 'Join'].includes(event.Event)) &&
      runtimeEvents.some((event) => ['QueueCallerLeave', 'QueueCallerAbandon', 'Leave', 'AgentComplete'].includes(event.Event)),
    `No AMI queue join/departure event pair observed (events: ${[...new Set(runtimeEvents.map((event) => event.Event))].join(', ')}).`
  );
  record('AMI channel and hangup event stream');

  const ivrStart = ami.events.length;
  await originate(ami, 604, 'entrypoints', 6);
  await waitFor('IVR timeout voicemail destination', () => ami.events.slice(ivrStart).some(
    (event) => event.Event === 'Newexten' && event.Application === 'VoiceMail' && /^900@default/.test(event.AppData ?? '')
  ), 12_000);
  record('IVR announcement and timeout reach voicemail');

  const voicemailStart = ami.events.length;
  await originate(ami, 605, 'entrypoints', 3);
  await waitFor('direct voicemail application', () => ami.events.slice(voicemailStart).some(
    (event) => event.Event === 'Newexten' && event.Application === 'VoiceMail' && /^900@default/.test(event.AppData ?? '')
  ), 8000);
  record('direct voicemail application executes synthetically');
}

async function queueUnavailableTimeoutFallback(ami) {
  for (const endpoint of ['102', '103']) {
    const paused = await ami.action({
      Action: 'QueuePause',
      Queue: 'queue_support',
      Interface: `PJSIP/${endpoint}`,
      Paused: 'true',
    });
    invariant(paused.Response === 'Success', `Could not pause synthetic queue member ${endpoint}: ${paused.Message ?? ''}`);
  }
  const before = ami.events.length;
  try {
    await originate(ami, 606, 'entrypoints', 8);
    await waitFor(
      'queue unavailable-agent timeout fallback',
      () => ami.events.slice(before).some(
        (event) => event.Event === 'Newexten' && event.Application === 'VoiceMail' && /^900@default/.test(event.AppData ?? '')
      ),
      12_000
    );
    const events = ami.events.slice(before);
    invariant(events.some((event) => ['QueueCallerJoin', 'Join'].includes(event.Event)), 'Unavailable-agent call never joined the queue.');
    invariant(
      events.some((event) => ['QueueCallerLeave', 'QueueCallerAbandon', 'Leave'].includes(event.Event)),
      'Unavailable-agent call did not leave the queue after its total timeout.'
    );
    record('queue unavailable-agent total timeout and voicemail fallback');
  } finally {
    for (const endpoint of ['102', '103']) {
      await ami.action({
        Action: 'QueuePause',
        Queue: 'queue_support',
        Interface: `PJSIP/${endpoint}`,
        Paused: 'false',
      });
    }
  }
}

async function reloadExistingQueue(ami) {
  const before = await ami.command('queue show queue_support');
  invariant(/queue_support/.test(before), 'Synthetic queue is missing before reload.');
  const attempt = await api('/deploy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` },
    body: '{}',
  });
  invariant(attempt.response.ok && attempt.body.deployed && attempt.body.runtimeHealthy, 'Existing-queue reload deploy failed.');
  const after = await ami.command('queue show queue_support');
  invariant(/queue_support/.test(after) && /rrmemory/i.test(after), 'Queue strategy/state disappeared after reload.');
  record('reload preserves an existing native queue', attempt.body.deploymentId);
  return attempt.body;
}

async function dtmfPaths(ami) {
  const cases = [
    {
      name: 'valid DTMF selection reaches ring group',
      digit: '1',
      matches: (event) => event.Event === 'Newexten' && event.Application === 'Dial' && /PJSIP\/102&PJSIP\/103/.test(event.AppData ?? ''),
    },
    {
      name: 'invalid DTMF retry limit reaches explicit fallback',
      digit: '9',
      matches: (event) => event.Event === 'Newexten' && event.Application === 'Dial' && /^PJSIP\/103(?:,|$)/.test(event.AppData ?? ''),
    },
  ];
  for (let index = 0; index < cases.length; index++) {
    const item = cases[index];
    const file = `/tmp/dtmf-${index}.csv`;
    await BunCompatWrite(file, `SEQUENTIAL\nsynthetic-101-pass-2026;604;${item.digit}\n`);
    const before = ami.events.length;
    await runSipp([ASTERISK_HOST, '-sf', 'scenarios/uac-dtmf.xml', '-inf', file, '-s', '101', '-au', '101', '-ap', 'synthetic-101-pass-2026', '-p', String(5091 + index), '-m', '1', '-nostdin'], item.name, 30_000);
    try {
      await waitFor(item.name, () => ami.events.slice(before).some(item.matches), 8000);
    } catch (error) {
      const routeEvidence = ami.events.slice(before)
        .filter((event) => /^(?:DTMFBegin|DTMFEnd|Newexten|Hangup)$/.test(event.Event ?? ''))
        .map(({ Event, Digit, Extension, Context, Application, AppData, CauseTxt }) => ({
          Event, Digit, Extension, Context, Application, AppData, CauseTxt,
        }));
      throw new Error(`${error.message}; observed route evidence: ${JSON.stringify(routeEvidence)}`);
    }
    record(item.name);
  }
}

async function cdrEvidence(ami) {
  await sleep(1000);
  const cdrStatus = await ami.command('cdr show status');
  invariant(/Logging:\s+Enabled/i.test(cdrStatus), 'Asterisk CDR engine is not enabled.');
  const cdrEvents = ami.events.filter((event) => event.Event === 'Cdr');
  invariant(cdrEvents.length > 0, 'No completed synthetic CDR entry was emitted by Asterisk.');
  invariant(cdrEvents.every((event) => !/trunk|did|provider/i.test(JSON.stringify(event))), 'Unexpected provider-like data in synthetic CDR.');
  record('completed Asterisk CDR entries', `${cdrEvents.length} AMI Cdr events`);
}

async function rollbackCanary(previousDeploymentId) {
  const response = await api('/test/deploy/corrupt-next', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
  });
  invariant(response.response.status === 404, 'Production API unexpectedly exposed a test fault endpoint.');
  // The backend acceptance container creates this marker through its shared
  // filesystem before this runner is started by the host orchestration.
  if (process.env.ACCEPTANCE_EXPECT_ROLLBACK !== 'true') return;
  const { writeFile } = await import('node:fs/promises');
  await writeFile(path.join(process.env.ACCEPTANCE_CONFIG_DIR ?? '/shared-config-control', '.test-corrupt-next-deploy'), '', 'utf8');
  const attempt = await api('/deploy', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'If-Match': `"rev-${revision}"` }, body: '{}',
  });
  invariant(attempt.response.status === 503 && attempt.body.rolledBack, 'Corrupt post-preflight config did not trigger rollback.');
  record('automatic rollback after deliberately invalid activated config', previousDeploymentId);
}

async function websocketEvidence() {
  const status = await api('/status');
  invariant(status.response.ok && ['connected', 'reconnecting', 'degraded'].includes(status.body.connection.state), 'Status snapshot unavailable.');
  record('status snapshot for WebSocket event model', status.body.connection.state);
  const websocketFrame = await rawWebSocketFrame();
  invariant(websocketFrame.includes('"type":"status"') && websocketFrame.includes('"connection"'), 'Authenticated WebSocket did not emit a semantic status frame.');
  record('authenticated WebSocket status update');
}

async function rawWebSocketFrame() {
  const key = Buffer.alloc(16, 0x45).toString('base64');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: 'backend', port: 4000 });
    let buffer = Buffer.alloc(0);
    const timer = setTimeout(() => { socket.destroy(); reject(new Error('WebSocket status frame timed out.')); }, 8000);
    socket.once('connect', () => socket.write([
      'GET /ws/status HTTP/1.1', 'Host: backend:4000', 'Upgrade: websocket', 'Connection: Upgrade',
      `Sec-WebSocket-Key: ${key}`, 'Sec-WebSocket-Version: 13', `Cookie: ${cookie}`, '', '',
    ].join('\r\n')));
    socket.on('data', (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      const headerEnd = buffer.indexOf('\r\n\r\n');
      if (headerEnd < 0) return;
      const headers = buffer.subarray(0, headerEnd).toString('utf8');
      if (!headers.startsWith('HTTP/1.1 101')) {
        clearTimeout(timer); socket.destroy(); reject(new Error(`WebSocket upgrade failed: ${headers.split('\r\n')[0]}`)); return;
      }
      const frame = buffer.subarray(headerEnd + 4);
      if (frame.length < 2) return;
      let length = frame[1] & 0x7f;
      let offset = 2;
      if (length === 126) { if (frame.length < 4) return; length = frame.readUInt16BE(2); offset = 4; }
      if (length === 127) { if (frame.length < 10) return; length = Number(frame.readBigUInt64BE(2)); offset = 10; }
      if (frame.length < offset + length) return;
      clearTimeout(timer); socket.destroy(); resolve(frame.subarray(offset, offset + length).toString('utf8'));
    });
    socket.once('error', (error) => { clearTimeout(timer); reject(error); });
  });
}

async function persistEvidence() {
  const current = await loadTopology();
  invariant(
    current.topology.id === 'synthetic-acceptance-topology' && current.activeRevision !== null && current.lastGoodRevision !== null,
    'Topology/deploy state did not persist.'
  );
  const revisions = await api('/topology/revisions');
  invariant(revisions.response.ok && revisions.body.revisions.length >= 2, 'Revision history missing after import/deploy.');
  invariant(
    revisions.body.revisions.some((entry) => entry.revision === current.activeRevision && entry.active),
    'Active revision is not represented in immutable history.'
  );
  const users = await api('/users');
  invariant(users.response.ok, `Restored user listing failed: HTTP ${users.response.status}`);
  invariant(
    ['admin', 'editor', 'viewer'].every((role) => users.body.users.some((user) => user.role === role)),
    'User roles did not persist.'
  );
  const audit = await api('/audit?limit=500');
  invariant(audit.response.ok, `Restored audit listing failed: HTTP ${audit.response.status}`);
  if (process.env.ACCEPTANCE_AFTER_RESTORE === 'true') {
    invariant(audit.body.audit.some((entry) => entry.action === 'backup.restore'), 'Restore audit event is missing.');
  }
  if (process.env.ACCEPTANCE_EXPECT_ROTATION_AUDIT === 'true') {
    invariant(audit.body.audit.some((entry) => entry.action === 'secret.rotate-master-key'), 'Master-key rotation audit event is missing.');
  }
  const redacted = JSON.stringify(current.topology);
  invariant(!redacted.includes('sipPassword') && !SYNTHETIC_SIP_SECRETS.some((secret) => redacted.includes(secret)), 'Restored API topology leaked SIP credentials.');
  invariant(!/"(?:ami|availability|activity|connection|runtimeStatus|nodeStatus)"\s*:/i.test(redacted), 'Ephemeral AMI state leaked into persisted topology.');

  const sourceEvidencePath = process.env.ACCEPTANCE_SOURCE_EVIDENCE;
  if (sourceEvidencePath) {
    const expected = JSON.parse(await readFile(sourceEvidencePath, 'utf8'));
    invariant(current.topology.id === expected.topologyId, 'Restored topology ID differs from the source backup.');
    invariant(current.revision === expected.revision, 'Restored current revision differs from the source backup.');
    invariant(current.activeRevision === expected.activeRevision, 'Restored active revision differs from the source backup.');
    invariant(current.lastGoodRevision === expected.lastGoodRevision, 'Restored last-good revision differs from the source backup.');
  }
  record('SQLite users, roles, topology, revisions, audit and active-deploy persistence');
}

async function writeRecoveryEvidence() {
  const current = await loadTopology();
  const { mkdir, writeFile } = await import('node:fs/promises');
  await mkdir(ARTIFACT_ROOT, { recursive: true });
  await writeFile(
    RECOVERY_EVIDENCE_FILE,
    `${JSON.stringify({
      topologyId: current.topology.id,
      revision: current.revision,
      activeRevision: current.activeRevision,
      lastGoodRevision: current.lastGoodRevision,
    })}\n`,
    { encoding: 'utf8', mode: 0o600 }
  );
}

async function diagnosticArtifacts(error) {
  const redact = (value) => [ADMIN_PASSWORD, AMI_SECRET, ...SYNTHETIC_SIP_SECRETS, ...ROLE_FIXTURES.map((fixture) => fixture.password)]
    .filter(Boolean)
    .reduce((output, secret) => output.replaceAll(secret, '[REDACTED]'), String(value));
  const safe = {
    error: redact(error?.stack ?? error),
    passed: results,
    timestamp: new Date().toISOString(),
  };
  try {
    const { mkdir, writeFile } = await import('node:fs/promises');
    await mkdir(ARTIFACT_ROOT, { recursive: true });
    await writeFile(path.join(ARTIFACT_ROOT, 'acceptance-failure.json'), `${JSON.stringify(safe, null, 2)}\n`, 'utf8');
  } catch {
    // The primary error remains more useful than artifact-write failures.
  }
}

async function main() {
  invariant(AMI_SECRET, 'Synthetic AMI secret is missing.');
  await waitFor('backend health', async () => (await fetch(`${API.replace(/\/api$/, '')}/health`)).ok);
  const health = await fetch(`${API.replace(/\/api$/, '')}/health`).then((response) => response.json());
  invariant(health.product === 'Essentials+ Calls', 'Visible product name is incorrect.');
  record('backend health and branding');
  const frontend = await fetch('http://frontend/');
  invariant(frontend.ok && (await frontend.text()).includes('Essentials+ Calls'), 'Frontend health/branding failed.');
  record('frontend health and branding');
  await login();
  await ensureRoleFixtures();
  await loadTopology();
  if (process.env.ACCEPTANCE_AFTER_RESTART === 'true') {
    await persistEvidence();
    return;
  }
  if (process.env.ACCEPTANCE_AFTER_RESTORE === 'true') {
    await persistEvidence();
    await assertRestoredCustomIvrPrompt();
    const ami = new AmiConnection();
    try {
      await ami.connect();
      const version = await ami.command('core show version');
      invariant(/Asterisk 18\./.test(version), `Unexpected restored Asterisk major: ${version}`);
      await customIvrMedia(ami);
      await directCallAndReregistration(ami);
      await syntheticCallflows(ami);
      await cdrEvidence(ami);
      await websocketEvidence();
      record('restored topology and generated config execute synthetic callflows');
    } finally {
      ami.close();
    }
    return;
  }
  await importFixture();
  await uploadCustomIvrPrompt();
  await blockedDeploy();
  const deployed = await deploy();
  const ami = new AmiConnection();
  try {
    await ami.connect();
    const version = await ami.command('core show version');
    invariant(/Asterisk 18\./.test(version), `Unexpected Asterisk major: ${version}`);
    record('Asterisk 18 runtime without configuration rejection');
    await customIvrMedia(ami);
    await directCallAndReregistration(ami);
    await syntheticCallflows(ami);
    await queueUnavailableTimeoutFallback(ami);
    await dtmfPaths(ami);
    await cdrEvidence(ami);
    await websocketEvidence();
    const reloaded = await reloadExistingQueue(ami);
    await rollbackCanary(reloaded.deploymentId ?? deployed.deploymentId);
  } finally {
    ami.close();
  }
  await writeRecoveryEvidence();
  process.stdout.write(`\nSynthetic acceptance complete: ${results.length} semantic checks passed.\n`);
}

main().catch(async (error) => {
  await diagnosticArtifacts(error);
  const sensitive = [ADMIN_PASSWORD, AMI_SECRET, ...SYNTHETIC_SIP_SECRETS, ...ROLE_FIXTURES.map((fixture) => fixture.password)].filter(Boolean);
  const redacted = sensitive.reduce((value, secret) => value.replaceAll(secret, '[REDACTED]'), String(error?.stack ?? error));
  process.stderr.write(`FAIL ${redacted}\n`);
  process.exitCode = 1;
});
