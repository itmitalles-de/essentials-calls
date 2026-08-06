import { strict as assert } from 'node:assert';
import { test, describe } from 'node:test';
import { parseWav, sanitizeSoundName, SoundValidationError } from '../src/asterisk/sounds';

/** Builds a RIFF/WAVE buffer with the given format, for validation tests. */
function wav({
  channels = 1,
  sampleRate = 8000,
  bitsPerSample = 16,
  audioFormat = 1,
  samples = 800,
}: Partial<{
  channels: number;
  sampleRate: number;
  bitsPerSample: number;
  audioFormat: number;
  samples: number;
}> = {}): Buffer {
  const blockAlign = channels * (bitsPerSample / 8);
  const dataBytes = samples * blockAlign;
  const buf = Buffer.alloc(44 + dataBytes);
  buf.write('RIFF', 0, 'ascii');
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii');
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(audioFormat, 20);
  buf.writeUInt16LE(channels, 22);
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * blockAlign, 28);
  buf.writeUInt16LE(blockAlign, 32);
  buf.writeUInt16LE(bitsPerSample, 34);
  buf.write('data', 36, 'ascii');
  buf.writeUInt32LE(dataBytes, 40);
  return buf;
}

describe('parseWav', () => {
  test('accepts 8 kHz mono 16-bit PCM', () => {
    const header = parseWav(wav());
    assert.equal(header.sampleRate, 8000);
    assert.equal(header.channels, 1);
  });

  test('accepts 16 kHz, which format_wav also supports', () => {
    assert.equal(parseWav(wav({ sampleRate: 16000 })).sampleRate, 16000);
  });

  test('reports duration from the data chunk', () => {
    // 8000 samples at 8 kHz is exactly one second.
    const header = parseWav(wav({ samples: 8000 }));
    const seconds = header.dataBytes / (header.sampleRate * (header.bitsPerSample / 8) * header.channels);
    assert.equal(seconds, 1);
  });

  // Asterisk accepts these uploads silently but fails at call time, so the
  // format has to be rejected here.
  const rejected: [string, Parameters<typeof wav>[0], RegExp][] = [
    ['stereo', { channels: 2 }, /Mono/],
    ['44.1 kHz', { sampleRate: 44100 }, /8000 oder 16000/],
    ['8-bit', { bitsPerSample: 8 }, /16 Bit/],
    ['non-PCM', { audioFormat: 3 }, /PCM/],
  ];

  for (const [label, opts, pattern] of rejected) {
    test(`rejects ${label}, which Asterisk cannot play`, () => {
      assert.throws(
        () => parseWav(wav(opts)),
        (err: Error) => err instanceof SoundValidationError && pattern.test(err.message)
      );
    });
  }

  test('rejects data that is not a WAV file at all', () => {
    assert.throws(() => parseWav(Buffer.from('this is not audio, but long enough to pass the size check!!')), SoundValidationError);
  });

  test('rejects a truncated file', () => {
    assert.throws(() => parseWav(Buffer.alloc(10)), SoundValidationError);
  });
});

describe('sanitizeSoundName', () => {
  test('lowercases and replaces unsafe characters', () => {
    assert.equal(sanitizeSoundName('Willkommen Ansage!'), 'willkommen-ansage');
  });

  test('strips a .wav suffix so names do not double up', () => {
    assert.equal(sanitizeSoundName('greeting.wav'), 'greeting');
  });

  test('cannot escape the sounds directory', () => {
    // Path separators and traversal must not survive, since the name is joined
    // onto the storage directory.
    for (const evil of ['../../etc/passwd', '/etc/passwd', 'a/../../b']) {
      const safe = sanitizeSoundName(evil);
      assert.ok(!safe.includes('/'), `"${safe}" must not contain a separator`);
      assert.ok(!safe.includes('..'), `"${safe}" must not contain a traversal`);
    }
  });

  test('rejects a name that sanitizes to nothing', () => {
    assert.throws(() => sanitizeSoundName('///'), SoundValidationError);
  });
});
