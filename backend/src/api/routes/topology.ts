import { NextFunction, Response, Router } from 'express';
import {
  BUILTIN_PROMPTS,
  MAX_TOPOLOGY_IMPORT_BYTES,
  Topology,
  createTopologyExport,
  hasPlaintextSipSecrets,
  hasErrors,
  migrateTopologyDocument,
  validateTopology,
  validateTopologyShape,
} from '@visual-pbx/shared';
import {
  PbxDatabase,
  PlaintextSecretError,
  RevisionConflictError,
} from '../../model/database';
import { deployTopology } from '../../asterisk/deploy';
import { getStatusService } from '../../asterisk/status';
import { listSounds } from '../../asterisk/sounds';
import { actor, AuthenticatedRequest, requireRole } from '../../security/auth';

function asyncRoute(handler: (req: AuthenticatedRequest, res: Response) => Promise<void>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function inventory(): ReadonlySet<string> {
  return new Set([...BUILTIN_PROMPTS, ...listSounds().map((sound) => sound.reference)]);
}

function etag(revision: number): string {
  return `"rev-${revision}"`;
}

function expectedRevision(req: AuthenticatedRequest, res: Response): number | undefined {
  const value = req.get('If-Match');
  if (!value) {
    res.status(428).json({ error: 'If-Match mit der geladenen Topologie-Revision ist erforderlich.' });
    return undefined;
  }
  const match = /^(?:W\/)?"?rev-(\d+)"?$/.exec(value.trim()) ?? /^(\d+)$/.exec(value.trim());
  if (!match) {
    res.status(400).json({ error: 'If-Match enthält keine gültige Revision.' });
    return undefined;
  }
  const revision = Number(match[1]);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    res.status(400).json({ error: 'If-Match enthält keine gültige Revision.' });
    return undefined;
  }
  return revision;
}

function requestedRevision(raw: string, res: Response): number | undefined {
  if (!/^\d+$/.test(raw)) {
    res.status(400).json({ error: 'Revision muss eine positive Ganzzahl sein.' });
    return undefined;
  }
  const revision = Number(raw);
  if (!Number.isSafeInteger(revision) || revision < 1) {
    res.status(400).json({ error: 'Revision muss eine positive Ganzzahl sein.' });
    return undefined;
  }
  return revision;
}

function topologyFromBody(body: unknown, res: Response): Topology | undefined {
  const shapeIssues = validateTopologyShape(body);
  if (shapeIssues.length > 0) {
    res.status(400).json({ saved: false, deployed: false, issues: shapeIssues });
    return undefined;
  }
  return body as Topology;
}

function respondRevisionConflict(res: Response, error: RevisionConflictError): void {
  res.status(409).setHeader('ETag', etag(error.current)).json({
    error: error.message,
    code: 'revision-conflict',
    expectedRevision: error.expected,
    currentRevision: error.current,
  });
}

export function createTopologyRouter(database: PbxDatabase): Router {
  const router = Router();

  router.get('/topology', requireRole('viewer'), (_req, res) => {
    const current = database.currentTopology();
    res.setHeader('ETag', etag(current.revision));
    res.json(current);
  });

  router.put('/topology', requireRole('editor'), (req: AuthenticatedRequest, res, next) => {
    const expected = expectedRevision(req, res);
    if (expected === undefined) return;
    const topology = topologyFromBody(req.body, res);
    if (!topology) return;
    if (hasPlaintextSipSecrets(topology)) {
      res.status(400).json({ error: 'SIP-Secrets dürfen nur über den expliziten Secret-Endpunkt geändert werden.', code: 'plaintext-secret-rejected' });
      return;
    }
    const issues = validateTopology(topology, { soundReferences: inventory() });
    if (hasErrors(issues)) {
      res.status(400).json({ saved: false, issues });
      return;
    }
    try {
      const stored = database.saveTopology(
        topology,
        expected,
        actor(req),
        req.get('X-Revision-Comment') ?? 'Saved from editor'
      );
      res.setHeader('ETag', etag(stored.revision));
      res.json({ saved: true, issues, ...stored });
    } catch (error) {
      if (error instanceof RevisionConflictError) return respondRevisionConflict(res, error);
      if (error instanceof PlaintextSecretError) {
        res.status(400).json({ error: error.message, code: 'plaintext-secret-rejected' });
        return;
      }
      next(error);
    }
  });

  router.post('/topology/validate', requireRole('editor'), (req, res) => {
    const shapeIssues = validateTopologyShape(req.body);
    if (shapeIssues.length > 0) {
      res.json({ issues: shapeIssues });
      return;
    }
    const topology = req.body as Topology;
    const issues = validateTopology(topology, { soundReferences: inventory() });
    if (hasPlaintextSipSecrets(topology)) {
      issues.unshift({
        severity: 'error',
        code: 'plaintext-secret-rejected',
        message: 'SIP-Secrets dürfen nur über den expliziten Secret-Endpunkt geändert werden.',
      });
    }
    res.json({ issues });
  });

  router.get('/topology/revisions', requireRole('viewer'), (req, res) => {
    res.json({ revisions: database.listRevisions(Number(req.query.limit ?? 50)) });
  });

  router.get('/topology/revisions/:revision', requireRole('viewer'), (req, res, next) => {
    const revision = requestedRevision(req.params.revision, res);
    if (revision === undefined) return;
    try {
      res.json({ revision, topology: database.revisionTopology(revision) });
    } catch (error) {
      if (error instanceof Error && /existiert nicht/.test(error.message)) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.post('/topology/revisions/:revision/rollback', requireRole('admin'), (req: AuthenticatedRequest, res, next) => {
    const targetRevision = requestedRevision(req.params.revision, res);
    if (targetRevision === undefined) return;
    const expected = expectedRevision(req, res);
    if (expected === undefined) return;
    try {
      const stored = database.rollbackTopology(
        targetRevision,
        expected,
        actor(req),
        typeof req.body?.comment === 'string' ? req.body.comment : undefined
      );
      res.setHeader('ETag', etag(stored.revision));
      res.status(201).json({ rolledBack: true, ...stored });
    } catch (error) {
      if (error instanceof RevisionConflictError) return respondRevisionConflict(res, error);
      if (error instanceof Error && /existiert nicht/.test(error.message)) {
        res.status(404).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.get('/topology/export', requireRole('viewer'), (_req, res) => {
    const current = database.currentTopology();
    res.setHeader('Content-Disposition', `attachment; filename="essentials-calls-topology-r${current.revision}.json"`);
    res.json(createTopologyExport(current.topology));
  });

  const importHandler = (dryRun: boolean) => (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const rawBytes = Buffer.byteLength(JSON.stringify(req.body ?? null), 'utf8');
      if (rawBytes > MAX_TOPOLOGY_IMPORT_BYTES) {
        res.status(413).json({ error: `Import überschreitet das Limit von ${MAX_TOPOLOGY_IMPORT_BYTES} Byte.` });
        return;
      }
      const migrated = migrateTopologyDocument(req.body);
      if (migrated.sourceSchemaVersion !== 1 && hasPlaintextSipSecrets(migrated.topology)) {
        throw new PlaintextSecretError(
          'Schema-v2-Importe dürfen keine SIP-Secrets im Klartext enthalten.'
        );
      }
      const shapeIssues = validateTopologyShape(migrated.topology);
      const issues = shapeIssues.length
        ? shapeIssues
        : validateTopology(migrated.topology, { soundReferences: inventory() });
      const migration = {
        sourceSchemaVersion: migrated.sourceSchemaVersion,
        migrated: migrated.migrated,
      };
      if (hasErrors(issues)) {
        res.status(400).json({ valid: false, imported: false, issues, ...migration });
        return;
      }
      if (dryRun) {
        res.json({ valid: true, imported: false, issues, ...migration });
        return;
      }
      const expected = expectedRevision(req, res);
      if (expected === undefined) return;
      const stored = database.saveTopology(
        migrated.topology,
        expected,
        actor(req),
        `Imported schema v${migrated.sourceSchemaVersion}`,
        'import',
        migrated.sourceSchemaVersion === 1
      );
      database.audit(actor(req), 'topology.import', `revision:${stored.revision}`, 'success', {
        sourceSchemaVersion: migrated.sourceSchemaVersion,
        migrated: migrated.migrated,
      });
      res.setHeader('ETag', etag(stored.revision));
      res.status(201).json({ valid: true, imported: true, issues, ...migration, ...stored });
    } catch (error) {
      if (error instanceof RevisionConflictError) return respondRevisionConflict(res, error);
      if (error instanceof PlaintextSecretError) {
        res.status(400).json({ valid: false, imported: false, code: 'plaintext-secret-rejected', error: error.message });
        return;
      }
      if (error instanceof Error && /Import|Schema|Topologie/.test(error.message)) {
        res.status(400).json({ valid: false, imported: false, error: error.message });
        return;
      }
      next(error);
    }
  };

  router.post('/topology/import/dry-run', requireRole('admin'), importHandler(true));
  router.post('/topology/import', requireRole('admin'), importHandler(false));

  router.post('/extensions/:nodeId/secret', requireRole('admin'), (req: AuthenticatedRequest, res, next) => {
    const expected = expectedRevision(req, res);
    if (expected === undefined) return;
    if (typeof req.body?.secret !== 'string') {
      res.status(400).json({ error: 'Feld "secret" fehlt.' });
      return;
    }
    try {
      const stored = database.updateSipSecret(req.params.nodeId, req.body.secret, expected, actor(req));
      res.setHeader('ETag', etag(stored.revision));
      res.json({ updated: true, nodeId: req.params.nodeId, ...stored });
    } catch (error) {
      if (error instanceof RevisionConflictError) return respondRevisionConflict(res, error);
      next(error);
    }
  });

  router.post(
    '/deploy',
    requireRole('admin'),
    asyncRoute(async (req, res) => {
      const expected = expectedRevision(req, res);
      if (expected === undefined) return;
      let current = database.currentTopology();
      if (current.revision !== expected) {
        respondRevisionConflict(res, new RevisionConflictError(expected, current.revision));
        return;
      }

      const candidate = req.body?.topology ?? (validateTopologyShape(req.body).length === 0 ? req.body : undefined);
      if (candidate) {
        const topology = topologyFromBody(candidate, res);
        if (!topology) return;
        if (hasPlaintextSipSecrets(topology)) {
          res.status(400).json({ deployed: false, code: 'plaintext-secret-rejected', error: 'SIP-Secrets dürfen nur über den expliziten Secret-Endpunkt geändert werden.' });
          return;
        }
        const issues = validateTopology(topology, { soundReferences: inventory() });
        if (hasErrors(issues)) {
          res.status(400).json({ deployed: false, issues });
          return;
        }
        try {
          current = database.saveTopology(topology, expected, actor(req), 'Saved for deploy', 'deploy-save');
        } catch (error) {
          if (error instanceof RevisionConflictError) return respondRevisionConflict(res, error);
          throw error;
        }
      }

      const issues = validateTopology(current.topology, { soundReferences: inventory() });
      if (hasErrors(issues)) {
        res.status(400).json({ deployed: false, issues });
        return;
      }
      const materialized = database.materializedTopology(current.revision);
      const result = await deployTopology(materialized, current.revision, actor(req), database);
      res.status(result.deployed ? 200 : 503).json({ issues, revision: current.revision, ...result });
    })
  );

  router.get(
    '/status',
    requireRole('viewer'),
    asyncRoute(async (_req, res) => {
      res.json(getStatusService(database).snapshot());
    })
  );

  return router;
}

export { etag, expectedRevision, inventory };
