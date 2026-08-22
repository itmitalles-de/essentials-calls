import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference, THEME_LABELS } from '../theme';

const OPTIONS = [
  { value: 'system' as const, Icon: Monitor },
  { value: 'light' as const, Icon: Sun },
  { value: 'dark' as const, Icon: Moon },
];

export function ThemeSelector({
  preference,
  onChange,
  label = 'Darstellung',
}: {
  preference: ThemePreference;
  onChange: (preference: ThemePreference) => void;
  label?: string;
}) {
  return (
    <div className="sb-segmented" role="radiogroup" aria-label={label}>
      {OPTIONS.map(({ value, Icon }) => (
        <button
          className="sb-segment-button"
          key={value}
          type="button"
          role="radio"
          aria-checked={preference === value}
          onClick={() => onChange(value)}
        >
          <Icon className="sb-icon" aria-hidden="true" />
          {THEME_LABELS[value]}
        </button>
      ))}
    </div>
  );
}
