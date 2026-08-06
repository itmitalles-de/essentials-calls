import express, { NextFunction, Request, Response } from 'express';
import cors from 'cors';
import http from 'http';
import { topologyRouter } from './api/routes/topology';
import { soundsRouter } from './api/routes/sounds';
import { attachStatusWebSocket } from './api/ws';

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
// The sounds router parses raw audio bodies itself, so it is mounted before the
// JSON parser would try to read an upload as JSON.
app.use('/api', soundsRouter);
app.use(express.json({ limit: '2mb' }));
app.use('/api', topologyRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Turns malformed JSON and unexpected handler errors into responses. Without
// this Express' default handler still replies, but an async throw would become
// an unhandled rejection and take the process down.
app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
  if (res.headersSent) {
    next(err);
    return;
  }
  if (err.type === 'entity.parse.failed' || err.status === 400) {
    res.status(400).json({ error: 'Ungültiges JSON im Request-Body.' });
    return;
  }
  console.error('Unhandled request error:', err);
  res.status(500).json({ error: 'Interner Serverfehler.' });
});

const server = http.createServer(app);
attachStatusWebSocket(server);

// Last line of defence: log instead of dying, so one bad request or a dropped
// AMI socket cannot take the whole API down.
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

server.listen(PORT, () => {
  console.log(`visual-pbx backend listening on :${PORT}`);
});
