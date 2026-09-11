import React, { useLayoutEffect, useRef, useState } from 'react';

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
  { value: 'not_started', label: 'Offen' },
  { value: 'in_progress', label: 'In Arbeit' },
  { value: 'completed', label: 'Erledigt' },
  { value: 'overdue', label: 'Überfällig' },
];

interface Props {
  value: string;
  label: string;
  color: string;
  /** Zeitlich überfällig - kommt zum Status hinzu, ersetzt ihn nicht. */
  overdue?: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
}

/** Breite des Klappmenues - fuer die Lage am Rand. */
const MENUE_BREITE = 160;

export const StatusCell: React.FC<Props> = ({ value, label, color, overdue, disabled, onChange }) => {
  const [open, setOpen] = useState(false);
  const ausloeser = useRef<HTMLButtonElement>(null);
  const menue = useRef<HTMLDivElement>(null);
  const [lage, setLage] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  /*
   * Das Menue haengt mit position:fixed am Knopf statt im Fluss der Zelle.
   *
   * Vorher stand es absolut in der Zelle - und die Tabelle rollt. In der
   * letzten Zeile lag es damit ausserhalb des rollenden Bereichs: die
   * Tabelle bekam eine eigene Bildlaufleiste und das Menue war
   * abgeschnitten. Mit fester Lage im Bildschirm kann nichts es
   * beschneiden; passt es unten nicht, klappt es nach oben.
   */
  useLayoutEffect(() => {
    if (!open) return;

    const setzen = () => {
      const knopf = ausloeser.current?.getBoundingClientRect();
      if (!knopf) return;
      const hoehe = menue.current?.offsetHeight ?? 180;
      const sicht = window.visualViewport;
      const breite = sicht?.width ?? window.innerWidth;
      const sichtHoehe = sicht?.height ?? window.innerHeight;
      const klemme = (wert: number, hoechstens: number) =>
        Math.max(8, Math.min(wert, Math.max(8, hoechstens)));

      const untenPasst = knopf.bottom + 4 + hoehe <= sichtHoehe - 8;
      setLage({
        top: klemme(untenPasst ? knopf.bottom + 4 : knopf.top - hoehe - 4, sichtHoehe - hoehe - 8),
        left: klemme(knopf.left, breite - MENUE_BREITE - 8),
      });
    };

    setzen();
    // Beim Rollen mitwandern - sonst bleibt das Menue stehen und der
    // Knopf faehrt darunter weg.
    window.addEventListener('scroll', setzen, true);
    window.addEventListener('resize', setzen);
    return () => {
      window.removeEventListener('scroll', setzen, true);
      window.removeEventListener('resize', setzen);
    };
  }, [open]);

  const title = overdue ? `${label} - Endzeit überschritten` : undefined;

  if (disabled) {
    return (
      <span className="status-pill" style={{ backgroundColor: color }} title={title}>
        {label}
      </span>
    );
  }

  return (
    <div className="tv-dropdown">
      <button
        ref={ausloeser}
        type="button"
        className="status-pill status-pill-button"
        style={{ backgroundColor: color }}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
      >
        {label}
        <span className="status-caret" aria-hidden="true">▾</span>
      </button>

      {open && (
        <>
          {/* Klick ins Leere schliesst das Menü */}
          <div className="tv-backdrop" onClick={() => setOpen(false)} />
          <div
            ref={menue}
            className="tv-menu tv-menu-fest"
            role="listbox"
            style={{ top: lage.top, left: lage.left, width: MENUE_BREITE }}
          >
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
