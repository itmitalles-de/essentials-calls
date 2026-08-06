// Browser-side audio conversion.
//
// Asterisk plays 16-bit PCM mono WAV at 8 kHz. Rather than putting ffmpeg into
// the backend image, whatever the user records or picks is decoded, downmixed,
// resampled and encoded here — the browser already has a full audio pipeline.

export const TARGET_SAMPLE_RATE = 8000;

/** Longest prompt we accept, to keep uploads and Asterisk playback sane. */
export const MAX_DURATION_SECONDS = 120;

export interface ConvertedAudio {
  wav: Blob;
  durationSeconds: number;
}

/**
 * Decodes any format the browser can read (wav, mp3, m4a, ogg, webm/opus from
 * MediaRecorder) and returns 8 kHz mono 16-bit PCM WAV bytes.
 */
export async function toAsteriskWav(input: Blob | ArrayBuffer): Promise<ConvertedAudio> {
  const bytes = input instanceof Blob ? await input.arrayBuffer() : input;

  const decodeContext = new AudioContext();
  let decoded: AudioBuffer;
  try {
    // decodeAudioData detaches the buffer, so hand it a copy.
    decoded = await decodeContext.decodeAudioData(bytes.slice(0));
  } catch {
    throw new Error('Audio konnte nicht gelesen werden. Unterstützt werden u.a. WAV, MP3, M4A und OGG.');
  } finally {
    void decodeContext.close();
  }

  if (decoded.duration > MAX_DURATION_SECONDS) {
    throw new Error(`Aufnahme ist zu lang (${Math.round(decoded.duration)}s, erlaubt sind ${MAX_DURATION_SECONDS}s).`);
  }

  const frames = Math.max(1, Math.ceil(decoded.duration * TARGET_SAMPLE_RATE));
  // OfflineAudioContext does the resampling; rendering into a 1-channel
  // destination downmixes stereo on the way.
  const offline = new OfflineAudioContext(1, frames, TARGET_SAMPLE_RATE);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();

  return {
    wav: encodeWav(rendered.getChannelData(0), TARGET_SAMPLE_RATE),
    durationSeconds: rendered.duration,
  };
}

function encodeWav(samples: Float32Array, sampleRate: number): Blob {
  const bytesPerSample = 2;
  const buffer = new ArrayBuffer(44 + samples.length * bytesPerSample);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * bytesPerSample, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM header size
  view.setUint16(20, 1, true); // audioFormat: PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true); // byte rate
  view.setUint16(32, bytesPerSample, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  writeAscii(36, 'data');
  view.setUint32(40, samples.length * bytesPerSample, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    // Clamp before scaling, so overdriven input distorts instead of wrapping.
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function isRecordingSupported(): boolean {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/** Microphone recorder that yields the raw recorded blob when stopped. */
export class MicRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private stream: MediaStream | null = null;

  async start(): Promise<void> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];
    this.recorder = new MediaRecorder(this.stream);
    this.recorder.ondataavailable = (e) => {
      if (e.data.size > 0) this.chunks.push(e.data);
    };
    this.recorder.start();
  }

  stop(): Promise<Blob> {
    return new Promise((resolve, reject) => {
      const recorder = this.recorder;
      if (!recorder) {
        reject(new Error('Es läuft keine Aufnahme.'));
        return;
      }
      recorder.onstop = () => {
        this.releaseStream();
        resolve(new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' }));
      };
      recorder.stop();
    });
  }

  cancel(): void {
    if (this.recorder && this.recorder.state !== 'inactive') {
      this.recorder.onstop = null;
      this.recorder.stop();
    }
    this.releaseStream();
  }

  private releaseStream(): void {
    // Without this the browser keeps showing the "recording" indicator.
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.recorder = null;
  }
}
