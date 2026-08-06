import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteSound, fetchSounds, SoundInfo, soundUrl, uploadSound } from '../api/client';
import { isRecordingSupported, MicRecorder, toAsteriskWav } from '../audio';

/**
 * Prompts that ship with Asterisk's core sounds package, so the field is usable
 * before anything has been uploaded.
 */
const BUILTIN_PROMPTS = ['hello-world', 'demo-thanks', 'demo-congrats', 'pls-hold-while-try', 'invalid'];

interface GreetingPickerProps {
  value: string;
  onChange: (greeting: string) => void;
  /** Used to pre-fill the name of a new recording. */
  suggestedName: string;
}

type Busy = null | { kind: 'recording' } | { kind: 'working'; label: string };

export function GreetingPicker({ value, onChange, suggestedName }: GreetingPickerProps) {
  const [sounds, setSounds] = useState<SoundInfo[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recorder = useRef<MicRecorder | null>(null);

  const reload = useCallback(() => {
    fetchSounds()
      .then((r) => setSounds(r.sounds))
      .catch((err: Error) => setError(err.message));
  }, []);

  useEffect(reload, [reload]);

  // Stop the microphone if the inspector unmounts mid-recording.
  useEffect(() => () => recorder.current?.cancel(), []);

  const store = async (blob: Blob, rawName: string) => {
    setError(null);
    setBusy({ kind: 'working', label: 'Konvertiere…' });
    try {
      const { wav } = await toAsteriskWav(blob);
      setBusy({ kind: 'working', label: 'Lade hoch…' });
      const sound = await uploadSound(rawName, wav);
      onChange(sound.reference);
      reload();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    await store(file, file.name.replace(/\.[^.]+$/, '') || suggestedName);
    if (fileInput.current) fileInput.current.value = '';
  };

  const startRecording = async () => {
    setError(null);
    try {
      const mic = new MicRecorder();
      await mic.start();
      recorder.current = mic;
      setBusy({ kind: 'recording' });
    } catch {
      setError('Kein Mikrofonzugriff. Im Browser erlauben und erneut versuchen.');
    }
  };

  const stopRecording = async () => {
    const mic = recorder.current;
    if (!mic) return;
    recorder.current = null;
    try {
      const blob = await mic.stop();
      await store(blob, `${suggestedName}-${new Date().toISOString().slice(11, 16).replace(':', '')}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(null);
    }
  };

  const removeSound = async (name: string) => {
    await deleteSound(name);
    reload();
  };

  const custom = value.startsWith('custom/') ? value.slice('custom/'.length) : null;
  const known = BUILTIN_PROMPTS.includes(value) || sounds.some((s) => s.reference === value);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 8 }}>
      <label style={{ fontSize: 11, color: 'var(--fg-muted)' }}>Begrüßung</label>

      <select value={known ? value : '__custom__'} onChange={(e) => onChange(e.target.value)}>
        <optgroup label="Eigene Aufnahmen">
          {sounds.length === 0 && <option disabled>— noch keine —</option>}
          {sounds.map((s) => (
            <option key={s.reference} value={s.reference}>
              {s.name} ({s.durationSeconds.toFixed(1)}s)
            </option>
          ))}
        </optgroup>
        <optgroup label="Mitgelieferte Ansagen">
          {BUILTIN_PROMPTS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </optgroup>
        {!known && <option value="__custom__">{value || '(leer)'} — frei eingetragen</option>}
      </select>

      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Dateiname ohne Endung"
        title="Wird von Asterisk unter /usr/share/asterisk/sounds/ aufgelöst"
      />

      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        <button onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          Datei wählen
        </button>

        {isRecordingSupported() &&
          (busy?.kind === 'recording' ? (
            <button onClick={stopRecording} style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }}>
              ⏹ Aufnahme stoppen
            </button>
          ) : (
            <button onClick={startRecording} disabled={busy !== null}>
              ● Aufnehmen
            </button>
          ))}

        {value && (
          <button
            onClick={() => new Audio(custom ? soundUrl(custom) : '').play().catch(() => setError('Vorschau nur für eigene Aufnahmen.'))}
            disabled={!custom || busy !== null}
            title={custom ? 'Anhören' : 'Vorschau nur für eigene Aufnahmen möglich'}
          >
            ▶ Anhören
          </button>
        )}

        {custom && sounds.some((s) => s.name === custom) && (
          <button onClick={() => removeSound(custom)} disabled={busy !== null} style={{ color: 'var(--danger)' }}>
            Löschen
          </button>
        )}
      </div>

      <input
        ref={fileInput}
        type="file"
        accept="audio/*"
        style={{ display: 'none' }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />

      {busy?.kind === 'recording' && (
        <div style={{ fontSize: 11, color: 'var(--danger)' }}>● Aufnahme läuft…</div>
      )}
      {busy?.kind === 'working' && <div style={{ fontSize: 11, color: 'var(--fg-muted)' }}>{busy.label}</div>}
      {error && <div style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</div>}

      <div style={{ fontSize: 10, color: 'var(--fg-muted)' }}>
        Aufnahmen werden im Browser nach 8 kHz Mono WAV konvertiert und als <code>custom/&lt;name&gt;</code> abgelegt.
      </div>
    </div>
  );
}
