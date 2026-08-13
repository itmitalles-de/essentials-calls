import path from 'node:path';
import { createBackup } from '../backup/archive';
import { getDatabase } from '../model/store';

async function main(): Promise<void> {
  const outputIndex = process.argv.indexOf('--output');
  const output = outputIndex >= 0 ? process.argv[outputIndex + 1] : undefined;
  if (!output) throw new Error('Usage: backup --output <archive.tar.gz>');
  const database = getDatabase();
  const manifest = await createBackup({
    database,
    soundsDir: process.env.SOUNDS_DIR ?? path.join(database.dataDir, 'sounds'),
    configDir: process.env.CONFIG_OUT_DIR ?? path.join(database.dataDir, 'generated'),
    outputPath: path.resolve(output),
  });
  console.log(`Backup erstellt: ${manifest.entries.length} geprüfte Einträge; Master-Key nicht enthalten.`);
  database.close();
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
