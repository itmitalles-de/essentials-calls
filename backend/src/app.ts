import express, { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { PbxDatabase } from './model/database';
import { authMiddleware, createAuthRouter, csrfProtection, validateAuthConfiguration } from './security/auth';
import { createTopologyRouter } from './api/routes/topology';
import { createSoundsRouter } from './api/routes/sounds';

export const PRODUCT = {
  name: 'Essentials+ Calls',
  version: '0.2.0',
  apiVersion: 'v1',
  capabilityIds: [
    'calls.topology',
    'calls.deploy.atomic',
    'calls.revisions',
    'calls.sounds',
    'calls.schedule',
    'calls.status.events',
    'calls.backup',
  ],
  authMode: 'local-session',
} as const;

export function createApp(database: PbxDatabase) {
  validateAuthConfiguration();
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', process.env.PBX_TRUST_PROXY === 'true' ? 1 : false);
  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginResourcePolicy: { policy: 'same-origin' },
      hsts: (process.env.PBX_ENV ?? 'development') === 'production' ? undefined : false,
    })
  );
  app.use(express.json({ limit: '2mb', strict: true }));
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(authMiddleware(database));
  app.use('/api', csrfProtection);

  const health = (_req: Request, res: Response) => res.json({ ok: true, product: PRODUCT.name, ...PRODUCT });
  const ready = (_req: Request, res: Response) => {
    try {
      database.db.prepare('SELECT 1').get();
      res.json({ ready: true, product: PRODUCT.name, ...PRODUCT, components: { database: 'ready' } });
    } catch {
      res.status(503).json({ ready: false, product: PRODUCT.name, ...PRODUCT, components: { database: 'unavailable' } });
    }
  };
  app.get('/health', health);
  app.get('/ready', ready);
  app.get('/api/health', health);
  app.get('/api/ready', ready);
  app.get('/api/service', (_req, res) => res.json(PRODUCT));

  app.use('/api', createAuthRouter(database));
  app.use('/api', createSoundsRouter(database));
  app.use('/api', createTopologyRouter(database));

  app.use((err: Error & { status?: number; type?: string }, _req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) {
      next(err);
      return;
    }
    if (err.type === 'entity.parse.failed' || err.status === 400) {
      res.status(400).json({ error: 'Ungültiges JSON im Request-Body.' });
      return;
    }
    if (err.type === 'entity.too.large' || err.status === 413) {
      res.status(413).json({ error: 'Request-Body überschreitet das erlaubte Größenlimit.' });
      return;
    }
    if (/UNIQUE constraint failed: users\.username/.test(err.message)) {
      res.status(409).json({ error: 'Benutzername ist bereits vergeben.' });
      return;
    }
    if (/^(Ungültiger Benutzername|Passwort muss|SIP-Secret muss)/.test(err.message)) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (/^(Benutzer|Extension) nicht gefunden/.test(err.message)) {
      res.status(404).json({ error: err.message });
      return;
    }
    console.error('Unhandled request error:', err.name, err.message);
    res.status(500).json({ error: 'Interner Serverfehler.' });
  });
  return app;
}
