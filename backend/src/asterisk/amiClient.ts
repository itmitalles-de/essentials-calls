import net from 'net';
import { EventEmitter } from 'events';

export type AmiMessage = Record<string, string>;

interface PendingAction {
  resolve: (msgs: AmiMessage[]) => void;
  reject: (err: Error) => void;
  collected: AmiMessage[];
  completeEvent?: string;
  timer: NodeJS.Timeout;
}

// Minimal Asterisk Manager Interface (AMI) client: enough to log in, run CLI
// commands (used for config reloads) and collect list-style events
// (PJSIPShowEndpoints / QueueStatus) for the status panel.
export class AmiClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private buffer = '';
  private bannerReceived = false;
  private actionCounter = 0;
  private pending = new Map<string, PendingAction>();
  public connected = false;

  constructor(
    private host: string,
    private port: number,
    private username: string,
    private secret: string
  ) {
    super();
  }

  connect(timeoutMs = 4000): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host: this.host, port: this.port });
      this.socket = socket;
      this.buffer = '';
      this.bannerReceived = false;
      socket.setEncoding('utf-8');

      const connectTimer = setTimeout(() => {
        socket.destroy();
        reject(new Error(`AMI connect timeout (${this.host}:${this.port})`));
      }, timeoutMs);

      socket.on('data', (chunk: string) => this.onData(chunk));
      socket.once('connect', () => {
        clearTimeout(connectTimer);
      });
      socket.on('error', (err) => {
        clearTimeout(connectTimer);
        this.failAllPending(err);
        this.connected = false;
        this.emit('closed');
        reject(err);
      });
      socket.on('close', () => {
        // Anything still waiting for a reply will never get one; rejecting here
        // stops those promises (and their timers) from lingering after a drop.
        this.failAllPending(new Error('AMI connection closed'));
        this.connected = false;
        this.emit('closed');
      });

      this.login()
        .then(() => {
          this.connected = true;
          resolve();
        })
        .catch((err) => {
          clearTimeout(connectTimer);
          reject(err);
        });
    });
  }

  private failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  disconnect(): void {
    this.failAllPending(new Error('AMI client disconnected'));
    this.socket?.removeAllListeners();
    this.socket?.destroy();
    this.socket = null;
    this.connected = false;
  }

  private onData(chunk: string): void {
    this.buffer += chunk;

    if (!this.bannerReceived) {
      const idx = this.buffer.indexOf('\r\n');
      if (idx === -1) return;
      this.buffer = this.buffer.slice(idx + 2);
      this.bannerReceived = true;
    }

    let idx: number;
    while ((idx = this.buffer.indexOf('\r\n\r\n')) !== -1) {
      const block = this.buffer.slice(0, idx);
      this.buffer = this.buffer.slice(idx + 4);
      this.handleBlock(block);
    }
  }

  private handleBlock(block: string): void {
    const msg: AmiMessage = {};
    for (const line of block.split('\r\n')) {
      const sep = line.indexOf(':');
      if (sep === -1) continue;
      msg[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
    }
    if (Object.keys(msg).length === 0) return;

    this.emit('message', msg);

    const actionId = msg.ActionID;
    if (!actionId || !this.pending.has(actionId)) return;
    const p = this.pending.get(actionId)!;
    p.collected.push(msg);

    const isCompleteEvent = p.completeEvent && msg.Event === p.completeEvent;
    const isPlainResponse = !!msg.Response && !p.completeEvent;

    if (isPlainResponse || isCompleteEvent) {
      clearTimeout(p.timer);
      this.pending.delete(actionId);
      p.resolve(p.collected);
    }
  }

  sendAction(fields: Record<string, string>, opts?: { completeEvent?: string; timeoutMs?: number }): Promise<AmiMessage[]> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('AMI socket not connected'));
        return;
      }
      const actionId = `a${++this.actionCounter}`;
      const payload =
        Object.entries({ ...fields, ActionID: actionId })
          .map(([k, v]) => `${k}: ${v}`)
          .join('\r\n') + '\r\n\r\n';

      const timer = setTimeout(() => {
        this.pending.delete(actionId);
        reject(new Error(`AMI action "${fields.Action}" timed out`));
      }, opts?.timeoutMs ?? 5000);

      this.pending.set(actionId, { resolve, reject, collected: [], completeEvent: opts?.completeEvent, timer });
      this.socket.write(payload, (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending.delete(actionId);
          reject(err);
        }
      });
    });
  }

  private async login(): Promise<void> {
    const msgs = await this.sendAction({ Action: 'Login', Username: this.username, Secret: this.secret });
    if (msgs[0]?.Response !== 'Success') {
      throw new Error(`AMI login failed: ${msgs[0]?.Message ?? 'unknown error'}`);
    }
  }

  async runCommand(command: string): Promise<void> {
    const msgs = await this.sendAction({ Action: 'Command', Command: command });
    if (msgs[0]?.Response !== 'Success') {
      throw new Error(`AMI command "${command}" failed: ${msgs[0]?.Message ?? 'unknown error'}`);
    }
  }

  async deployReload(): Promise<void> {
    await this.runCommand('dialplan reload');
    await this.runCommand('pjsip reload');
    await this.runCommand('queue reload all');
    await this.runCommand('voicemail reload');
  }

  async getEndpointStatuses(): Promise<{ endpoint: string; state: string }[]> {
    const msgs = await this.sendAction({ Action: 'PJSIPShowEndpoints' }, { completeEvent: 'EndpointListComplete' });
    return msgs
      .filter((m) => m.Event === 'EndpointList')
      .map((m) => ({ endpoint: m.ObjectName ?? '', state: m.DeviceState ?? 'unknown' }));
  }

  async getQueueStatuses(): Promise<{ queue: string; calls: number }[]> {
    const msgs = await this.sendAction({ Action: 'QueueStatus' }, { completeEvent: 'QueueStatusComplete' });
    return msgs
      .filter((m) => m.Event === 'QueueParams')
      .map((m) => ({ queue: m.Queue ?? '', calls: Number(m.Calls ?? 0) }));
  }
}
