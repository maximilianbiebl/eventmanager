import React, { useState } from 'react';

/*
 * Kompakter Statusfilter für die Werkzeugleiste.
 *
 * Ein natives <select> richtet seine Breite immer nach der LÄNGSTEN Option
 * ("Nicht gestartet") - unabhängig davon, was gerade gewählt ist. Auf dem
 * Handy hat es dadurch rund die Hälfte der Leiste belegt. Dieses Menü ist
 * so breit wie der gewählte Wert.
 *
 * Nebeneffekt: ein gesetzter Filter wird als aktiver Chip dargestellt,
 * genau wie beim Tagesfilter daneben.
 */

export const STATUS_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: 'all', label: 'Alle' },
  { value: 'not_started', label: 'Nicht gestartet' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'completed', label: 'Erledigt' },
  { value: 'overdue', label: 'Überfällig' },
];

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export const StatusFilter: React.FC<Props> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const current =
    STATUS_FILTER_OPTIONS.find((o) => o.value === value) ?? STATUS_FILTER_OPTIONS[0];

  return (
    <div className="tv-dropdown">
      <button
        type="button"
        className={value === 'all' ? 'tv-chip tv-trigger' : 'tv-chip-active tv-trigger'}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {current.label}
        <span className="tv-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/* Klick ins Leere schliesst das Menü */}
          <div className="tv-backdrop" onClick={() => setOpen(false)} />
          <div className="tv-menu" role="listbox">
            {STATUS_FILTER_OPTIONS.map((o) => (
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
