import crypto from 'node:crypto';
import { NextFunction, Request, Response, Router } from 'express';
import { Actor, PbxDatabase, Role, SessionRecord, UserSafetyError } from '../model/database';
import { hashPassword, verifyPassword } from './password';

const COOKIE_NAME = 'essentials_calls_session';
const SESSION_MS = 8 * 60 * 60_000;
const dummyPasswordHash = hashPassword('unusable-synthetic-timing-equalizer');

export interface AuthenticatedRequest extends Request {
  auth?: SessionRecord;
}

const ROLE_LEVEL: Record<Role, number> = { viewer: 1, editor: 2, admin: 3 };

function tokenHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function cookies(req: Request): Record<string, string> {
  const output: Record<string, string> = {};
  for (const entry of (req.headers.cookie ?? '').split(';')) {
    const separator = entry.indexOf('=');
    if (separator < 0) continue;
    const key = entry.slice(0, separator).trim();
    const value = entry.slice(separator + 1).trim();
    if (key) output[key] = decodeURIComponent(value);
  }
  return output;
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function actor(req: AuthenticatedRequest): Actor {
  if (!req.auth) return { id: null, username: 'anonymous' };
  return { id: req.auth.user.id, username: req.auth.user.username, role: req.auth.user.role };
}

export function authMiddleware(database: PbxDatabase) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction) => {
    const raw = cookies(req)[COOKIE_NAME];
    if (raw) req.auth = database.session(tokenHash(raw));
    next();
  };
}

export function sessionFromCookieHeader(database: PbxDatabase, header: string | undefined): SessionRecord | undefined {
  const fakeRequest = { headers: { cookie: header ?? '' } } as Request;
  const raw = cookies(fakeRequest)[COOKIE_NAME];
  return raw ? database.session(tokenHash(raw)) : undefined;
}

export function requireRole(minimum: Role) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.auth) {
      res.status(401).json({ error: 'Authentisierung erforderlich.' });
      return;
    }
    if (ROLE_LEVEL[req.auth.user.role] < ROLE_LEVEL[minimum]) {
      res.status(403).json({ error: 'Für diese Aktion fehlen die erforderlichen Rechte.' });
      return;
    }
    next();
  };
}

export function csrfProtection(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || req.path === '/auth/login') {
    next();
    return;
  }
  const supplied = req.get('X-CSRF-Token') ?? '';
  if (!req.auth || !supplied || !safeEqual(supplied, req.auth.csrfToken)) {
    res.status(403).json({ error: 'CSRF-Prüfung fehlgeschlagen.' });
    return;
  }
  next();
}

function secureCookies(): boolean {
  const secure = process.env.PBX_SECURE_COOKIES === 'true';
  if ((process.env.PBX_ENV ?? 'development') === 'production' && !secure) {
    throw new Error('PBX_SECURE_COOKIES=true ist in PBX_ENV=production verpflichtend.');
  }
  return secure;
}

export function validateAuthConfiguration(): void {
  secureCookies();
}

function cookie(value: string, maxAgeSeconds: number): string {
  return [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Strict',
    secureCookies() ? 'Secure' : '',
    `Max-Age=${maxAgeSeconds}`,
  ]
    .filter(Boolean)
    .join('; ');
}

export function createAuthRouter(database: PbxDatabase): Router {
  const router = Router();

  router.get('/auth/session', (req: AuthenticatedRequest, res) => {
    if (!req.auth) {
      res.status(401).json({ authenticated: false, bootstrapRequired: database.countUsers() === 0 });
      return;
    }
    res.json({
      authenticated: true,
      user: req.auth.user,
      csrfToken: req.auth.csrfToken,
      expiresAt: new Date(req.auth.expiresAt).toISOString(),
    });
  });

  router.post('/auth/login', async (req: AuthenticatedRequest, res, next) => {
    try {
      const submittedUsername = typeof req.body?.username === 'string' ? req.body.username.trim() : '';
      const usernameValid = /^[a-zA-Z0-9._@-]{3,64}$/.test(submittedUsername);
      const username = usernameValid ? submittedUsername : '';
      const submittedPassword = typeof req.body?.password === 'string' ? req.body.password : '';
      const password = submittedPassword.length <= 1024 ? submittedPassword : '';
      const attemptKey = tokenHash(`${req.ip}\0${username.toLowerCase()}`);
      const rate = database.loginRate(attemptKey);
      if (rate.blocked) {
        res.setHeader('Retry-After', String(rate.retryAfterSeconds));
        res.status(429).json({ error: 'Zu viele Anmeldeversuche. Bitte später erneut versuchen.' });
        return;
      }

      const user = database.userByUsername(username);
      const passwordValid = await verifyPassword(password, user?.passwordHash ?? await dummyPasswordHash);
      const valid = !!user && !user.disabled && submittedPassword.length <= 1024 && passwordValid;
      if (!valid || !user) {
        database.recordLoginFailure(attemptKey);
        database.audit({ id: user?.id ?? null, username: submittedUsername.slice(0, 64) || 'unknown' }, 'auth.login', 'session', 'failure', {
          ipHash: tokenHash(req.ip ?? ''),
        });
        res.status(401).json({ error: 'Benutzername oder Passwort ist ungültig.' });
        return;
      }

      database.clearLoginFailures(attemptKey);
      const token = crypto.randomBytes(32).toString('base64url');
      const csrfToken = crypto.randomBytes(24).toString('base64url');
      const createdAt = Date.now();
      const expiresAt = createdAt + SESSION_MS;
      database.createSession(user.id, tokenHash(token), csrfToken, createdAt, expiresAt);
      database.audit({ id: user.id, username: user.username, role: user.role }, 'auth.login', 'session', 'success', {
        ipHash: tokenHash(req.ip ?? ''),
      });
      res.setHeader('Set-Cookie', cookie(token, Math.floor(SESSION_MS / 1000)));
      res.json({
        authenticated: true,
        user: { ...user, passwordHash: undefined },
        csrfToken,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (error) {
      next(error);
    }
  });

  router.post('/auth/logout', requireRole('viewer'), (req: AuthenticatedRequest, res) => {
    if (req.auth) {
      database.deleteSession(req.auth.tokenHash);
      database.audit(actor(req), 'auth.logout', 'session', 'success');
    }
    res.setHeader('Set-Cookie', cookie('', 0));
    res.json({ loggedOut: true });
  });

  router.get('/users', requireRole('admin'), (_req, res) => res.json({ users: database.listUsers() }));

  router.post('/users', requireRole('admin'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      const role = req.body?.role as Role;
      if (!['viewer', 'editor', 'admin'].includes(role)) {
        res.status(400).json({ error: 'Ungültige Rolle.' });
        return;
      }
      const user = database.createUser(username, await hashPassword(password), role, actor(req));
      res.status(201).json({ user: { ...user, passwordHash: undefined } });
    } catch (error) {
      next(error);
    }
  });

  router.patch('/users/:id', requireRole('admin'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const patch: { role?: Role; disabled?: boolean; passwordHash?: string } = {};
      if (req.body?.role !== undefined) {
        if (!['viewer', 'editor', 'admin'].includes(req.body.role)) {
          res.status(400).json({ error: 'Ungültige Rolle.' });
          return;
        }
        patch.role = req.body.role;
      }
      if (typeof req.body?.disabled === 'boolean') patch.disabled = req.body.disabled;
      if (typeof req.body?.password === 'string') patch.passwordHash = await hashPassword(req.body.password);
      const user = database.updateUser(req.params.id, patch, actor(req));
      res.json({ user: { ...user, passwordHash: undefined } });
    } catch (error) {
      if (error instanceof UserSafetyError) {
        res.status(409).json({ error: error.message, code: 'user-safety' });
        return;
      }
      next(error);
    }
  });

  router.get('/audit', requireRole('admin'), (req, res) => {
    res.json({ audit: database.listAudit(Number(req.query.limit ?? 100)) });
  });

  return router;
}

export { COOKIE_NAME, hashPassword };
