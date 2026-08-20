import { strict as assert } from 'node:assert';
import net from 'node:net';
import { afterEach, describe, test } from 'node:test';
import { AmiClient } from '../src/asterisk/amiClient';

const servers: net.Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function fakeAmi(onCommand: (socket: net.Socket, actionId: string) => void): Promise<number> {
  const server = net.createServer((socket) => {
    socket.setEncoding('utf8');
    socket.write('Asterisk Call Manager/5.0.0\r\n');
    let buffer = '';
    socket.on('data', (chunk) => {
      buffer += chunk;
      let end: number;
      while ((end = buffer.indexOf('\r\n\r\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 4);
        const fields = Object.fromEntries(block.split('\r\n').map((line) => {
          const separator = line.indexOf(':');
          return [line.slice(0, separator), line.slice(separator + 1).trim()];
        }));
        if (fields.Action === 'Login') {
          socket.write(`Response: Success\r\nActionID: ${fields.ActionID}\r\nMessage: Authentication accepted\r\n\r\n`);
        } else if (fields.Action === 'Command') {
          onCommand(socket, fields.ActionID);
        }
      }
    });
  });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return (server.address() as net.AddressInfo).port;
}

describe('AMI client protocol', () => {
  test('accepts the Response: Follows form used by CLI commands', async () => {
    const port = await fakeAmi((socket, actionId) => {
      socket.write(
        `Response: Follows\r\nActionID: ${actionId}\r\nOutput: Asterisk 22.10.1\r\nOutput: --END COMMAND--\r\n\r\n`
      );
    });
    const client = new AmiClient('127.0.0.1', port, 'synthetic-user', 'synthetic-secret');
    await client.connect();
    assert.match(await client.runCommand('core show version'), /Asterisk 22/);
    client.disconnect();
  });

  test('closes the failed login socket and rejects without leaking a secret', async () => {
    const server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      socket.write('Asterisk Call Manager/5.0.0\r\n');
      socket.once('data', (block) => {
        const actionId = /ActionID: ([^\r]+)/.exec(block)?.[1] ?? '';
        socket.write(`Response: Error\r\nActionID: ${actionId}\r\nMessage: Authentication failed\r\n\r\n`);
      });
    });
    servers.push(server);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const client = new AmiClient('127.0.0.1', (server.address() as net.AddressInfo).port, 'synthetic-user', 'do-not-log');
    await assert.rejects(client.connect(), (error: Error) => {
      assert.match(error.message, /Authentication failed/);
      assert.ok(!error.message.includes('do-not-log'));
      return true;
    });
    assert.equal(client.connected, false);
  });
});
