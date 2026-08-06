import fs from 'fs';
import path from 'path';

// Custom prompts live in a volume shared with the Asterisk container. Asterisk
// resolves a relative prompt name against <astdatadir>/sounds/<lang>/ and then
// <astdatadir>/sounds/ — and on Debian/Ubuntu
// /usr/share/asterisk/sounds/custom is a symlink to /usr/local/share/asterisk/sounds.
// So a file stored here as "greeting.wav" is played as "custom/greeting".
const SOUNDS_DIR = process.env.SOUNDS_DIR ?? path.join(__dirname, '..', '..', 'data', 'sounds');

/** Prefix Asterisk needs to find files in the custom sounds directory. */
export const CUSTOM_SOUND_PREFIX = 'custom/';

export interface SoundInfo {
  /** Bare name without extension, e.g. "willkommen". */
  name: string;
  /** What to put in an IVR greeting field, e.g. "custom/willkommen". */
  reference: string;
  sizeBytes: number;
  updatedAt: string;
  durationSeconds: number;
}

export class SoundValidationError extends Error {}

export function soundsDir(): string {
  fs.mkdirSync(SOUNDS_DIR, { recursive: true });
  return SOUNDS_DIR;
}

/**
 * Normalises a user-supplied prompt name into something safe to use as both a
 * filename and an Asterisk prompt reference.
 */
export function sanitizeSoundName(raw: string): string {
  // Deliberately no dots: the name is joined onto the storage directory, and
  // allowing them would let ".." survive as a literal filename fragment.
  const name = raw
    .trim()
    .toLowerCase()
    .replace(/\.wav$/i, '')
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (!name) throw new SoundValidationError('Ungültiger Dateiname.');
  return name;
}

function soundPath(name: string): string {
  // sanitizeSoundName strips separators, so the join cannot escape the directory.
  return path.join(soundsDir(), `${sanitizeSoundName(name)}.wav`);
}

interface WavHeader {
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  dataBytes: number;
}

/**
 * Parses and checks a RIFF/WAVE header. Asterisk's format_wav only handles
 * 8 kHz / 16 kHz 16-bit mono PCM; anything else is accepted silently by the
 * upload but fails at call time, so it is rejected here instead.
 */
export function parseWav(buffer: Buffer): WavHeader {
  if (buffer.length < 44) throw new SoundValidationError('Datei ist zu klein für eine WAV-Datei.');
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new SoundValidationError('Keine WAV-Datei (RIFF/WAVE-Kennung fehlt).');
  }

  let offset = 12;
  let fmt: { audioFormat: number; channels: number; sampleRate: number; bitsPerSample: number } | undefined;
  let dataBytes = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;

    if (chunkId === 'fmt ' && body + 16 <= buffer.length) {
      fmt = {
        audioFormat: buffer.readUInt16LE(body),
        channels: buffer.readUInt16LE(body + 2),
        sampleRate: buffer.readUInt32LE(body + 4),
        bitsPerSample: buffer.readUInt16LE(body + 14),
      };
    } else if (chunkId === 'data') {
      dataBytes = Math.min(chunkSize, buffer.length - body);
    }

    offset = body + chunkSize + (chunkSize % 2); // chunks are word-aligned
  }

  if (!fmt) throw new SoundValidationError('WAV-Datei ohne fmt-Chunk.');
  if (fmt.audioFormat !== 1) throw new SoundValidationError('Nur unkomprimiertes PCM wird unterstützt.');
  if (fmt.channels !== 1) throw new SoundValidationError(`Nur Mono wird unterstützt (Datei hat ${fmt.channels} Kanäle).`);
  if (fmt.bitsPerSample !== 16) throw new SoundValidationError(`Nur 16 Bit werden unterstützt (Datei hat ${fmt.bitsPerSample} Bit).`);
  if (fmt.sampleRate !== 8000 && fmt.sampleRate !== 16000) {
    throw new SoundValidationError(`Nur 8000 oder 16000 Hz werden unterstützt (Datei hat ${fmt.sampleRate} Hz).`);
  }
  if (dataBytes === 0) throw new SoundValidationError('WAV-Datei enthält keine Audiodaten.');

  return { channels: fmt.channels, sampleRate: fmt.sampleRate, bitsPerSample: fmt.bitsPerSample, dataBytes };
}

export function saveSound(rawName: string, buffer: Buffer): SoundInfo {
  const header = parseWav(buffer);
  const name = sanitizeSoundName(rawName);
  fs.writeFileSync(soundPath(name), buffer);
  return {
    name,
    reference: `${CUSTOM_SOUND_PREFIX}${name}`,
    sizeBytes: buffer.length,
    updatedAt: new Date().toISOString(),
    durationSeconds: header.dataBytes / (header.sampleRate * (header.bitsPerSample / 8) * header.channels),
  };
}

export function listSounds(): SoundInfo[] {
  const dir = soundsDir();
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.wav'))
    .map((file) => {
      const full = path.join(dir, file);
      const stat = fs.statSync(full);
      const name = file.replace(/\.wav$/i, '');
      let durationSeconds = 0;
      try {
        const header = parseWav(fs.readFileSync(full));
        durationSeconds = header.dataBytes / (header.sampleRate * (header.bitsPerSample / 8) * header.channels);
      } catch {
        // A file that is not readable as WAV still gets listed, so the user can
        // see and delete it rather than wondering where it went.
      }
      return {
        name,
        reference: `${CUSTOM_SOUND_PREFIX}${name}`,
        sizeBytes: stat.size,
        updatedAt: stat.mtime.toISOString(),
        durationSeconds,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function readSound(name: string): Buffer | undefined {
  const file = soundPath(name);
  return fs.existsSync(file) ? fs.readFileSync(file) : undefined;
}

export function deleteSound(name: string): boolean {
  const file = soundPath(name);
  if (!fs.existsSync(file)) return false;
  fs.unlinkSync(file);
  return true;
}
