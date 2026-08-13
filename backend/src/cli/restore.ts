import path from 'node:path';
import { restoreBackup } from '../backup/archive';
import { loadSecretCipher } from '../security/crypto';

async function main(): Promise<void> {
  const inputIndex = process.argv.indexOf('--input');
  const input = inputIndex >= 0 ? process.argv[inputIndex + 1] : undefined;
  if (!input) throw new Error('Usage: restore --input <archive.tar.gz>');
  const dataDir = process.env.DATA_DIR ?? path.resolve('backend/data');
  const manifest = await restoreBackup({
    archivePath: path.resolve(input),
    dataDir,
    soundsDir: process.env.SOUNDS_DIR ?? path.join(dataDir, 'sounds'),
    configDir: process.env.CONFIG_OUT_DIR ?? path.join(dataDir, 'generated'),
    cipher: loadSecretCipher(),
  });
  console.log(`Backup vom ${manifest.createdAt} wurde in leere Zielverzeichnisse wiederhergestellt.`);
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
