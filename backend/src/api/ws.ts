import { WebSocketServer } from 'ws';
import { Server } from 'http';
import { getStatusService } from '../asterisk/status';
import { PbxDatabase } from '../model/database';
import { sessionFromCookieHeader } from '../security/auth';

export function attachStatusWebSocket(server: Server, database: PbxDatabase): void {
  const wss = new WebSocketServer({
    server,
    path: '/ws/status',
    verifyClient: ({ req }, done) => done(!!sessionFromCookieHeader(database, req.headers.cookie), 401, 'Authentication required'),
  });

  const service = getStatusService(database);
  const broadcast = () => {
    if (wss.clients.size === 0) return;
    const snapshot = service.snapshot();
    const payload = JSON.stringify({ type: 'status', ...snapshot });
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(payload);
    }
  };

  service.on('update', broadcast);
  wss.on('connection', (ws, request) => {
    const session = sessionFromCookieHeader(database, request.headers.cookie);
    if (!session) {
      ws.close(4001, 'Session expired');
      return;
    }

    // A WebSocket outlives the HTTP request that created it. Revalidate the
    // backing session so logout, user deactivation, and expiry also revoke an
    // already-open status stream instead of leaving it authorized indefinitely.
    const revalidate = setInterval(() => {
      if (!sessionFromCookieHeader(database, request.headers.cookie)) ws.close(4001, 'Session expired');
    }, 30_000);
    revalidate.unref?.();
    const expire = setTimeout(() => ws.close(4001, 'Session expired'), Math.max(0, session.expiresAt - Date.now()));
    expire.unref?.();

    broadcast();
    ws.on('close', () => {
      clearInterval(revalidate);
      clearTimeout(expire);
    });
  });
  wss.on('close', () => service.off('update', broadcast));
}
