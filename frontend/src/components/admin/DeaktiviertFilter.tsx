import React, { useState } from 'react';

/*
 * Was soll mit den deaktivierten Aufgaben passieren?
 *
 * Vorher war das ein Schalter mit zwei Stellungen: aus oder mitanzeigen.
 * "Nur die deaktivierten" liess sich damit nicht sagen - genau das braucht
 * man aber, wenn man aufraeumen oder eine wieder in Betrieb nehmen will.
 * Also drei Moeglichkeiten statt zwei, und weil es drei sind, ein Menue
 * statt eines Schalters - dieselbe Form wie beim Statusfilter daneben.
 *
 * Die Zahl ist immer "wie viele deaktivierte stecken in dem, was gerade
 * ausgewaehlt ist" - Tag und Status also eingerechnet. Sie zaehlte frueher
 * quer ueber alle Tage und versprach damit Zeilen, die der Klick gar nicht
 * zeigte.
 */

export type DeaktiviertWahl = 'aus' | 'mit' | 'nur';

const OPTIONEN: { value: DeaktiviertWahl; label: string; knopf: string }[] = [
  { value: 'aus', label: 'Ausblenden', knopf: 'Deaktivierte' },
  { value: 'mit', label: 'Mit anzeigen', knopf: 'Mit deaktivierten' },
  { value: 'nur', label: 'Nur deaktivierte', knopf: 'Nur deaktivierte' },
];

interface Props {
  value: DeaktiviertWahl;
  onChange: (wahl: DeaktiviertWahl) => void;
  /** Deaktivierte Aufgaben in der aktuellen Auswahl (Tag und Status). */
  anzahl: number;
}

export const DeaktiviertFilter: React.FC<Props> = ({ value, onChange, anzahl }) => {
  const [offen, setOffen] = useState(false);
  const aktuell = OPTIONEN.find((o) => o.value === value) ?? OPTIONEN[0];

  return (
    <div className="tv-dropdown">
      <button
        type="button"
        className={value === 'aus' ? 'tv-chip tv-trigger' : 'tv-chip-active tv-trigger'}
        onClick={() => setOffen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={offen}
        title="Deaktivierte Aufgaben: ausblenden, mit anzeigen oder nur diese"
      >
        {aktuell.knopf}
        {anzahl > 0 && (
          <b style={{ marginLeft: '0.35rem', fontVariantNumeric: 'tabular-nums' }}>{anzahl}</b>
        )}
        <span className="tv-caret" aria-hidden="true">▾</span>
      </button>

      {offen && (
        <>
          {/* Klick ins Leere schliesst das Menue */}
          <div className="tv-backdrop" onClick={() => setOffen(false)} />
          {/* Rechtsbuendig: dieses Menue steht am rechten Ende der Leiste,
              nach links aufgeklappt bleibt es auf dem Bildschirm. */}
          <div className="tv-menu tv-menu-rechts" role="listbox">
            {OPTIONEN.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                className={o.value === value ? 'tv-menuItem tv-menuItemActive' : 'tv-menuItem'}
                onClick={() => {
                  onChange(o.value);
                  setOffen(false);
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
