import http from 'node:http';
import { createApp } from './app';
import { attachStatusWebSocket } from './api/ws';
import { getDatabase } from './model/store';

const PORT = Number(process.env.PORT ?? 4000);

try {
  const database = getDatabase();
  const server = http.createServer(createApp(database));
  attachStatusWebSocket(server, database);

  process.on('unhandledRejection', (reason) => {
    const error = reason instanceof Error ? `${reason.name}: ${reason.message}` : 'unknown rejection';
    console.error('Unhandled promise rejection:', error);
  });

  server.listen(PORT, () => {
    console.log(`Simple Calls backend listening on :${PORT}`);
  });
} catch (error) {
  console.error(`Simple Calls refused to start: ${(error as Error).message}`);
  process.exitCode = 1;
}
