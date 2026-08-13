import crypto from 'node:crypto';
const N = 32768;
const R = 8;
const P = 1;
const KEY_BYTES = 32;
const MAXMEM = 64 * 1024 * 1024;

function derive(password: string, salt: Buffer, length: number, options: crypto.ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, length, options, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 1024) {
    throw new Error('Passwort muss zwischen 12 und 1024 Zeichen lang sein.');
  }
  const salt = crypto.randomBytes(16);
  const derived = await derive(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${derived.toString('base64')}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  const [algorithm, nRaw, rRaw, pRaw, saltRaw, hashRaw] = encoded.split('$');
  if (algorithm !== 'scrypt' || !nRaw || !rRaw || !pRaw || !saltRaw || !hashRaw) return false;
  const expected = Buffer.from(hashRaw, 'base64');
  try {
    const actual = await derive(password, Buffer.from(saltRaw, 'base64'), expected.length, {
      N: Number(nRaw),
      r: Number(rRaw),
      p: Number(pRaw),
      maxmem: MAXMEM,
    });
    return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}
