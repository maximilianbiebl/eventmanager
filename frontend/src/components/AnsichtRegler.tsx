import React, { useId, useState } from 'react';
import {
  Darstellung, GRENZEN, STANDARD, leseDarstellung, merkeDarstellung,
} from '../utils/darstellung';

/*
 * Zwei Regler: Schriftgroesse und Abstand.
 *
 * Beide sind Faktoren, keine festen Werte - die Groessenverhaeltnisse
 * bleiben erhalten (siehe utils/darstellung). Die Wirkung ist sofort zu
 * sehen, waehrend man schiebt; gemerkt wird sie auf diesem Geraet.
 *
 * Steht neben dem Umschalter fuer das Farbschema - beides gehoert zur
 * Frage "wie soll es aussehen".
 */

const beschriftung = (wert: number) => `${Math.round(wert * 100)} %`;

export const AnsichtRegler: React.FC = () => {
  const [d, setD] = useState<Darstellung>(leseDarstellung);
  /*
   * Eigene Kennungen je Einbau: die Regler stehen an mehreren Stellen
   * gleichzeitig im Dokument (Menue am Schreibtisch und am Handy). Feste
   * ids waeren doppelt - dann zeigt die Beschriftung auf den falschen
   * Regler.
   */
  const kennung = useId();

  const setze = (teil: Partial<Darstellung>) => {
    const neu = { ...d, ...teil };
    setD(neu);
    merkeDarstellung(neu);
  };

  const regler = (
    id: string,
    titel: string,
    wert: number,
    grenze: { min: number; max: number; schritt: number },
    aendern: (n: number) => void
  ) => (
    <div className="ansicht-regler">
      <label className="ansicht-regler-kopf" htmlFor={id}>
        <span>{titel}</span>
        <span className="ansicht-regler-wert">{beschriftung(wert)}</span>
      </label>
      <input
        id={id}
        type="range"
        min={grenze.min}
        max={grenze.max}
        step={grenze.schritt}
        value={wert}
        onChange={(e) => aendern(Number(e.target.value))}
      />
    </div>
  );

  const unveraendert = d.skala === STANDARD.skala && d.abstand === STANDARD.abstand;

  return (
    <div className="theme-switch">
      <span className="theme-switch-label">Größe &amp; Abstand</span>
      {regler(`${kennung}-skala`, 'Schrift', d.skala, GRENZEN.skala, (n) => setze({ skala: n }))}
      {regler(`${kennung}-abstand`, 'Abstand', d.abstand, GRENZEN.abstand, (n) => setze({ abstand: n }))}
      {!unveraendert && (
        <button
          type="button"
          className="ansicht-regler-zurueck"
          onClick={() => setze(STANDARD)}
        >
          Zurücksetzen
        </button>
      )}
    </div>
  );
};
