import express from 'express';
import cors from 'cors';
import http from 'http';
import { topologyRouter } from './api/routes/topology';
import { attachStatusWebSocket } from './api/ws';

const PORT = Number(process.env.PORT ?? 4000);

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', topologyRouter);
app.get('/api/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
attachStatusWebSocket(server);

server.listen(PORT, () => {
  console.log(`visual-pbx backend listening on :${PORT}`);
});
