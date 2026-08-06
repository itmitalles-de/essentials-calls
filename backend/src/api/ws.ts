import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { loadTopology } from '../model/store';
import { computeStatuses } from '../asterisk/status';

const POLL_INTERVAL_MS = 3000;

export function attachStatusWebSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/ws/status' });

  const broadcast = async () => {
    if (wss.clients.size === 0) return;
    const topology = loadTopology();
    const statuses = await computeStatuses(topology);
    const payload = JSON.stringify({ type: 'status', statuses });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  };

  const interval = setInterval(broadcast, POLL_INTERVAL_MS);
  wss.on('connection', (ws) => {
    broadcast();
    ws.on('close', () => {
      /* nothing to clean up per-connection */
    });
  });
  wss.on('close', () => clearInterval(interval));
}
