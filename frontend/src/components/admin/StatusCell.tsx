import React, { useState } from 'react';

/*
 * Status-Zelle der Aufgaben-Tabelle.
 *
 * Vorher ein natives <select>: es erbte die globale Touch-Regel
 * `select { min-height: 44px }` und wurde im Handy-Querformat auf die
 * Spaltenbreite gequetscht - "Nicht gestartet" war dann als "Nicht ges…"
 * abgeschnitten, ohne dass ein Overflow messbar gewesen wäre (ein select
 * beschneidet seinen Text intern).
 *
 * Ein Button passt sich seinem Inhalt an und wird nicht beschnitten.
 * Die Statusfarbe bleibt erhalten - sie ist die eigentliche Information.
 */

const STATUS_CHOICES: { value: string; label: string }[] = [
  { value: 'not_started', label: 'Nicht gestartet' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'completed', label: 'Erledigt' },
  { value: 'overdue', label: 'Überfällig' },
];

interface Props {
  value: string;
  label: string;
  color: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}

export const StatusCell: React.FC<Props> = ({ value, label, color, disabled, onChange }) => {
  const [open, setOpen] = useState(false);

  if (disabled) {
    return (
      <span className="status-pill" style={{ backgroundColor: color }}>
        {label}
      </span>
    );
  }

  return (
    <div className="tv-dropdown">
      <button
        type="button"
        className="status-pill status-pill-button"
        style={{ backgroundColor: color }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {label}
        <span className="status-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/* Klick ins Leere schliesst das Menü */}
          <div className="tv-backdrop" onClick={() => setOpen(false)} />
          <div className="tv-menu" role="listbox">
            {STATUS_CHOICES.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'tv-menuItem tv-menuItemActive' : 'tv-menuItem'}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                {o.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
