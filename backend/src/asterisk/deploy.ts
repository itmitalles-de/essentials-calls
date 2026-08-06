import fs from 'fs';
import path from 'path';
import { Topology } from '@visual-pbx/shared';
import { generateAll } from './configGenerator';
import { AmiClient } from './amiClient';

const CONFIG_OUT_DIR = process.env.CONFIG_OUT_DIR ?? path.join(__dirname, '..', '..', 'data', 'generated');
const AMI_HOST = process.env.AMI_HOST ?? 'localhost';
const AMI_PORT = Number(process.env.AMI_PORT ?? 5038);
const AMI_USERNAME = process.env.AMI_USERNAME ?? 'visualpbx';
const AMI_SECRET = process.env.AMI_SECRET ?? 'visualpbx';

let cachedClient: AmiClient | null = null;
let connecting: Promise<AmiClient> | null = null;

/**
 * Returns a logged-in AMI client, reusing the existing connection.
 *
 * The status poller and a deploy can ask for a client at the same time, so
 * in-flight connects are shared instead of opening a second socket, and a
 * client that reports a closed socket is dropped from the cache.
 */
export async function getAmiClient(): Promise<AmiClient> {
  if (cachedClient?.connected) return cachedClient;
  if (connecting) return connecting;

  connecting = (async () => {
    const client = new AmiClient(AMI_HOST, AMI_PORT, AMI_USERNAME, AMI_SECRET);
    client.once('closed', () => {
      if (cachedClient === client) cachedClient = null;
    });
    try {
      await client.connect();
      cachedClient = client;
      return client;
    } catch (err) {
      client.disconnect();
      throw err;
    } finally {
      connecting = null;
    }
  })();

  return connecting;
}

export function writeGeneratedConfigs(topology: Topology): void {
  fs.mkdirSync(CONFIG_OUT_DIR, { recursive: true });
  const { pjsip, extensions, queues, voicemail } = generateAll(topology);
  fs.writeFileSync(path.join(CONFIG_OUT_DIR, 'pjsip_generated.conf'), pjsip);
  fs.writeFileSync(path.join(CONFIG_OUT_DIR, 'extensions_generated.conf'), extensions);
  fs.writeFileSync(path.join(CONFIG_OUT_DIR, 'queues_generated.conf'), queues);
  fs.writeFileSync(path.join(CONFIG_OUT_DIR, 'voicemail_generated.conf'), voicemail);
}

export interface DeployResult {
  configsWritten: boolean;
  reloaded: boolean;
  reloadError?: string;
}

export async function deployTopology(topology: Topology): Promise<DeployResult> {
  writeGeneratedConfigs(topology);

  try {
    const ami = await getAmiClient();
    await ami.deployReload();
    return { configsWritten: true, reloaded: true };
  } catch (err) {
    return { configsWritten: true, reloaded: false, reloadError: (err as Error).message };
  }
}
