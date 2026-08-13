import fs from 'node:fs';
import { getDatabase } from '../model/store';
import { SecretCipher } from '../security/crypto';

function newCipher(): SecretCipher {
  const file = process.env.PBX_NEW_MASTER_KEY_FILE;
  const encoded = file ? fs.readFileSync(file, 'utf8') : process.env.PBX_NEW_MASTER_KEY;
  if (!encoded) throw new Error('PBX_NEW_MASTER_KEY_FILE oder PBX_NEW_MASTER_KEY ist erforderlich.');
  return SecretCipher.fromEncoded(encoded);
}

try {
  const database = getDatabase();
  const oldCipher = process.env.PBX_MASTER_KEY_FILE
    ? SecretCipher.fromEncoded(fs.readFileSync(process.env.PBX_MASTER_KEY_FILE, 'utf8'))
    : SecretCipher.fromEncoded(process.env.PBX_MASTER_KEY ?? '');
  const rotated = database.rotateSecrets(oldCipher, newCipher(), { id: null, username: 'rotate-master-key-cli' });
  console.log(`${rotated} verschlüsselte SIP-Credentials wurden atomar rotiert.`);
  database.close();
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
}
