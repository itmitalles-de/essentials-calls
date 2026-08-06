import { Router } from 'express';
import express from 'express';
import {
  deleteSound,
  listSounds,
  readSound,
  saveSound,
  SoundValidationError,
} from '../../asterisk/sounds';

export const soundsRouter = Router();

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

soundsRouter.get('/sounds', (_req, res) => {
  res.json({ sounds: listSounds() });
});

soundsRouter.get('/sounds/:name', (req, res) => {
  const data = readSound(req.params.name);
  if (!data) {
    res.status(404).json({ error: 'Aufnahme nicht gefunden.' });
    return;
  }
  res.type('audio/wav').send(data);
});

// Raw body rather than multipart: the browser converts to 8 kHz mono WAV before
// uploading, so there is exactly one file and no need for a multipart parser.
soundsRouter.put(
  '/sounds/:name',
  express.raw({ type: ['audio/wav', 'audio/x-wav', 'application/octet-stream'], limit: MAX_UPLOAD_BYTES }),
  (req, res) => {
    if (!Buffer.isBuffer(req.body) || req.body.length === 0) {
      res.status(400).json({ error: 'Kein Audio-Inhalt im Request-Body.' });
      return;
    }
    try {
      res.json({ sound: saveSound(req.params.name, req.body) });
    } catch (err) {
      if (err instanceof SoundValidationError) {
        res.status(400).json({ error: err.message });
        return;
      }
      throw err;
    }
  }
);

soundsRouter.delete('/sounds/:name', (req, res) => {
  res.json({ deleted: deleteSound(req.params.name) });
});
