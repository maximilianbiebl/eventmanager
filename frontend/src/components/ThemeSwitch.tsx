import React from 'react';
import { useTheme, ThemeMode } from '../context/ThemeContext';

/*
 * Segment-Umschalter für das Farbschema, gedacht für die Menüs.
 * Drei Optionen, weil "System" ein eigener Zustand ist und nicht durch
 * Hell/Dunkel ersetzt werden kann - wer System wählt, folgt später
 * automatisch der Umstellung des Betriebssystems.
 */

const OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Hell' },
  { value: 'dark', label: 'Dunkel' },
];

export const ThemeSwitch: React.FC = () => {
  const { mode, setMode } = useTheme();

  return (
    <div className="theme-switch">
      <span className="theme-switch-label">Darstellung</span>
      <div className="theme-switch-group" role="group" aria-label="Darstellung">
        {OPTIONS.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => setMode(o.value)}
            className={mode === o.value ? 'theme-switch-option-active' : 'theme-switch-option'}
            aria-pressed={mode === o.value}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
};
