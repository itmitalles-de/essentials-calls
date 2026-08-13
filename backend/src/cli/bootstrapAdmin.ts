import { getDatabase } from '../model/store';
import { hashPassword } from '../security/password';

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
}

async function main(): Promise<void> {
  const usernameIndex = process.argv.indexOf('--username');
  const username = usernameIndex >= 0 ? process.argv[usernameIndex + 1] : undefined;
  if (!username || !process.argv.includes('--password-stdin')) {
    throw new Error('Usage: bootstrap-admin --username <name> --password-stdin');
  }
  const database = getDatabase();
  if (database.countUsers() !== 0) throw new Error('Bootstrap ist nur erlaubt, solange noch kein Benutzer existiert.');
  const password = await readStdin();
  const user = database.createUser(username, await hashPassword(password), 'admin', { id: null, username: 'bootstrap-cli' });
  console.log(`Administrator "${user.username}" wurde ohne Default-Zugangsdaten angelegt.`);
  database.close();
}

main().catch((error) => {
  console.error((error as Error).message);
  process.exitCode = 1;
});
