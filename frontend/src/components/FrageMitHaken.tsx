import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';

/*
 * Rueckfrage mit einem Haekchen - wie confirm(), nur mit einer Option.
 *
 * Gebraucht beim Kopieren in eine Vorlage und beim Duplizieren: "Notizen
 * der Leitung mitnehmen?". Der Browser-Dialog confirm() kann kein
 * Haekchen, und ein eigenes Fenster an jeder der sieben Stellen waere
 * siebenmal derselbe Code. Deshalb als Aufruf:
 *
 *   const haken = await frageMitHaken({ titel, text, haken: 'Notizen mitnehmen' });
 *   if (haken === null) return;   // abgebrochen
 */

interface Optionen {
  titel: string;
  text?: string;
  /** Beschriftung des Haekchens - ohne: einfache Rueckfrage. */
  haken?: string;
  /** Erklaerung unter dem Haekchen. */
  hakenHinweis?: string;
  /** Voreinstellung des Haekchens. */
  vorgabe?: boolean;
  /** Beschriftung des Bestaetigen-Knopfs. */
  knopf?: string;
}

const Dialog: React.FC<Optionen & { fertig: (wert: boolean | null) => void }> = ({
  titel, text, haken, hakenHinweis, vorgabe = false, knopf = 'OK', fertig,
}) => {
  const [an, setAn] = useState(vorgabe);
  return (
    <div className="app-modal-overlay" style={stil.hintergrund} onClick={() => fertig(null)}>
      <div className="app-modal" style={stil.kasten} role="dialog" aria-labelledby="frage-titel"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => { if (e.key === 'Escape') fertig(null); }}>
        <h2 id="frage-titel" style={stil.titel}>{titel}</h2>
        {text && <p style={stil.text}>{text}</p>}
        {haken && (
          <label style={stil.haken}>
            <input type="checkbox" checked={an} onChange={(e) => setAn(e.target.checked)} />
            <span>
              {haken}
              {hakenHinweis && <span style={stil.hinweis}>{hakenHinweis}</span>}
            </span>
          </label>
        )}
        <div className="app-modal-actions" style={stil.knoepfe}>
          <button type="button" onClick={() => fertig(null)} style={stil.abbrechen}>Abbrechen</button>
          <button type="button" autoFocus onClick={() => fertig(an)} style={stil.los}>{knopf}</button>
        </div>
      </div>
    </div>
  );
};

/** Zeigt die Rueckfrage. Ergebnis: Stand des Haekchens, oder null bei Abbruch. */
export const frageMitHaken = (optionen: Optionen): Promise<boolean | null> =>
  new Promise((aufloesen) => {
    const ort = document.createElement('div');
    document.body.appendChild(ort);
    const wurzel = createRoot(ort);
    const fertig = (wert: boolean | null) => {
      wurzel.unmount();
      ort.remove();
      aufloesen(wert);
    };
    wurzel.render(<Dialog {...optionen} fertig={fertig} />);
  });

/*
 * Rueckfrage beim Kopieren einer Veranstaltung (Vorlage, Vorschlag,
 * Annehmen): das Haekchen "Notizen mitnehmen" erscheint nur, wenn es dort
 * ueberhaupt Notizen gibt - sonst ist es eine einfache Rueckfrage.
 * Ergebnis wie frageMitHaken: mitnehmen ja/nein, null bei Abbruch.
 */
export const frageNachNotizen = async (
  anzahl: number,
  optionen: { titel: string; text?: string; knopf?: string; vorgabe?: boolean }
): Promise<boolean | null> => frageMitHaken({
  ...optionen,
  haken: anzahl > 0 ? `Notizen der Leitung mitnehmen (${anzahl} vorhanden)` : undefined,
  hakenHinweis: anzahl > 0 ? 'Interne Notizen an Gruppen und Aufgaben. Sie gelten oft nur für eine Durchführung.' : undefined,
});

const stil: { [k: string]: React.CSSProperties } = {
  hintergrund: {
    position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '1rem',
  },
  kasten: {
    // Fuer die Fussleiste aus styles/modal.css: sie rechnet mit diesem Abstand.
    ['--modal-pad' as any]: '1.5rem',
    width: '100%', maxWidth: '26rem', padding: '1.5rem', borderRadius: '8px',
    backgroundColor: 'var(--c-surface)', boxShadow: 'var(--shadow-lg)',
  },
  titel: { margin: '0 0 0.5rem', fontSize: '1.2rem', color: 'var(--c-text)' },
  text: { margin: '0 0 1rem', fontSize: '0.9375rem', lineHeight: 1.5, color: 'var(--c-text-muted)' },
  haken: {
    display: 'flex', alignItems: 'flex-start', gap: '0.6rem', fontSize: '0.9375rem',
    color: 'var(--c-text)', cursor: 'pointer', lineHeight: 1.4,
  },
  hinweis: { display: 'block', fontSize: '0.8125rem', color: 'var(--c-text-muted)', marginTop: '0.15rem' },
  knoepfe: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' },
  abbrechen: {
    padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent',
    border: '1px solid var(--c-border-strong)', color: 'var(--c-text)',
  },
  los: {
    padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', border: 'none',
    backgroundColor: 'var(--c-accent)', color: 'var(--c-text-inverse)', fontWeight: 500,
  },
};
