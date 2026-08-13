import express, { NextFunction, Response, Router } from 'express';
import { BUILTIN_PROMPTS } from '@visual-pbx/shared';
import {
  CUSTOM_SOUND_PREFIX,
  deleteSound,
  listSounds,
  readSound,
  sanitizeSoundName,
  saveSound,
  SoundValidationError,
} from '../../asterisk/sounds';
import { PbxDatabase, RevisionConflictError } from '../../model/database';
import { actor, AuthenticatedRequest, requireRole } from '../../security/auth';
import { etag, expectedRevision } from './topology';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export function createSoundsRouter(database: PbxDatabase): Router {
  const router = Router();

  router.get('/sounds', requireRole('viewer'), (_req, res) => {
    res.json({
      sounds: listSounds().map((sound) => ({ ...sound, references: database.soundReferences(sound.reference) })),
    });
  });

  router.get('/sounds/:name', requireRole('viewer'), (req, res, next) => {
    try {
      const data = readSound(sanitizeSoundName(req.params.name));
      if (!data) {
        res.status(404).json({ error: 'Aufnahme nicht gefunden.' });
        return;
      }
      res.type('audio/wav').send(data);
    } catch (error) {
      if (error instanceof SoundValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  router.put(
    '/sounds/:name',
    requireRole('editor'),
    express.raw({ type: ['audio/wav', 'audio/x-wav', 'application/octet-stream'], limit: MAX_UPLOAD_BYTES }),
    (req, res, next) => {
      if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
        res.status(400).json({ error: 'Kein Audio-Inhalt im Request-Body.' });
        return;
      }
      try {
        const sound = saveSound(req.params.name, req.body);
        database.audit(actor(req), 'sound.upload', `sound:${sound.name}`, 'success', { sizeBytes: sound.sizeBytes });
        res.json({ sound: { ...sound, references: database.soundReferences(sound.reference) } });
      } catch (error) {
        if (error instanceof SoundValidationError) {
          res.status(400).json({ error: error.message });
          return;
        }
        next(error);
      }
    }
  );

  router.delete('/sounds/:name', requireRole('editor'), (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const name = sanitizeSoundName(req.params.name);
      const reference = `${CUSTOM_SOUND_PREFIX}${name}`;
      const references = database.soundReferences(reference);
      const replacement = typeof req.body?.replacement === 'string' ? req.body.replacement : undefined;
      let revision: number | undefined;
      if (references.length > 0 && !replacement) {
        res.status(409).json({
          deleted: false,
          code: 'sound-in-use',
          error: 'Die Ansage wird noch referenziert.',
          references,
        });
        return;
      }
      if (replacement) {
        const available = new Set([...BUILTIN_PROMPTS, ...listSounds().map((sound) => sound.reference)]);
        if (!available.has(replacement) || replacement === reference) {
          res.status(400).json({ error: 'Ersatzansage existiert nicht oder ist identisch mit der gelöschten Ansage.' });
          return;
        }
        const expected = expectedRevision(req, res);
        if (expected === undefined) return;
        const stored = database.replaceSoundReference(reference, replacement, expected, actor(req));
        revision = stored.revision;
        res.setHeader('ETag', etag(revision));
      }
      const deleted = deleteSound(name);
      database.audit(actor(req), 'sound.delete', `sound:${name}`, deleted ? 'success' : 'not-found', {
        referencesReplaced: references.length,
        replacement,
        revision,
      });
      res.json({ deleted, referencesReplaced: references.length, revision });
    } catch (error) {
      if (error instanceof RevisionConflictError) {
        res.status(409).setHeader('ETag', etag(error.current)).json({
          code: 'revision-conflict',
          expectedRevision: error.expected,
          currentRevision: error.current,
        });
        return;
      }
      if (error instanceof SoundValidationError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
