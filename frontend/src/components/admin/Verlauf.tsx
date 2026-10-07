import React, { useEffect, useState } from 'react';
import { aenderungenApi, Aenderung } from '../../api/aenderungen';

/*
 * Aenderungsprotokoll anzeigen.
 *
 *   VerlaufDialog          Verlauf einer Veranstaltung (Aktionen -> Verlauf)
 *   AbwesenheitsHinweis    "Waehrend du weg warst" nach dem Oeffnen der App
 *
 * Beide gruppieren nach Tag und zeigen Uhrzeit, Person und den Satz, den
 * der Server geschrieben hat (backend utils/protokoll).
 */

const tagText = (d: Date) => {
  const heute = new Date();
  const gestern = new Date(); gestern.setDate(heute.getDate() - 1);
  const gleich = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (gleich(d, heute)) return 'Heute';
  if (gleich(d, gestern)) return 'Gestern';
  return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
};
const uhrText = (d: Date) => d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });

/** Eintraege nach Kalendertag gruppieren - Reihenfolge bleibt (neueste zuerst). */
const nachTag = (eintraege: Aenderung[]) => {
  const gruppen: { tag: string; eintraege: Aenderung[] }[] = [];
  for (const e of eintraege) {
    const tag = tagText(new Date(e.zeit));
    const letzte = gruppen[gruppen.length - 1];
    if (letzte && letzte.tag === tag) letzte.eintraege.push(e);
    else gruppen.push({ tag, eintraege: [e] });
  }
  return gruppen;
};

const Zeilen: React.FC<{ eintraege: Aenderung[] }> = ({ eintraege }) => (
  <>
    {nachTag(eintraege).map((g) => (
      <div key={g.tag} style={stil.tagBlock}>
        <div style={stil.tagKopf}>{g.tag}</div>
        <ul style={stil.liste}>
          {g.eintraege.map((e) => (
            <li key={e.id} style={stil.zeile}>
              <span style={stil.uhr}>{uhrText(new Date(e.zeit))}</span>
              <span style={stil.wer}>{e.user_name}</span>
              <span style={stil.was}>{e.text}</span>
            </li>
          ))}
        </ul>
      </div>
    ))}
  </>
);

export const VerlaufDialog: React.FC<{ eventId: number; eventName: string; onClose: () => void }> = ({ eventId, eventName, onClose }) => {
  const [eintraege, setEintraege] = useState<Aenderung[]>([]);
  const [mehr, setMehr] = useState(false);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');

  const lade = async (vor?: number) => {
    setLaedt(true);
    try {
      const r = await aenderungenApi.verlauf(eventId, vor);
      setEintraege((alt) => (vor ? [...alt, ...r.eintraege] : r.eintraege));
      setMehr(r.mehr);
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Verlauf konnte nicht geladen werden');
    } finally {
      setLaedt(false);
    }
  };

  useEffect(() => { lade(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [eventId]);

  return (
    <div className="app-modal-overlay" style={stil.hintergrund} onClick={onClose}>
      <div style={stil.kasten} role="dialog" aria-labelledby="verlauf-titel" onClick={(e) => e.stopPropagation()}>
        <div style={stil.kopf}>
          <h2 id="verlauf-titel" style={stil.titel}>Verlauf</h2>
          <button type="button" onClick={onClose} style={stil.zu} aria-label="Schließen">✕</button>
        </div>
        <p style={stil.unter}>Was die Leitung an „{eventName}“ geändert hat – neueste zuerst.</p>
        <div style={stil.inhalt}>
          {fehler && <p style={stil.leer}>{fehler}</p>}
          {!fehler && !laedt && eintraege.length === 0 && (
            <p style={stil.leer}>Noch keine Änderungen aufgezeichnet. Der Verlauf beginnt mit dieser Version der App.</p>
          )}
          <Zeilen eintraege={eintraege} />
          {mehr && (
            <button type="button" onClick={() => lade(eintraege[eintraege.length - 1]?.id)} disabled={laedt} style={stil.mehr}>
              {laedt ? 'Lädt…' : 'Ältere laden'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const AbwesenheitsHinweis: React.FC<{
  veranstaltungen: { event_id: number; event_name: string; eintraege: Aenderung[] }[];
  gesamt: number;
  mehr?: boolean;
  onClose: () => void;
}> = ({ veranstaltungen, gesamt, mehr, onClose }) => {
  // Je Veranstaltung die neuesten 8 - der Rest steht im Verlauf.
  const JE = 8;
  return (
    <div className="app-modal-overlay" style={stil.hintergrund} onClick={onClose}>
      <div style={stil.kasten} role="dialog" aria-labelledby="abwesend-titel" onClick={(e) => e.stopPropagation()}>
        <div style={stil.kopf}>
          <h2 id="abwesend-titel" style={stil.titel}>Während du weg warst</h2>
          <button type="button" onClick={onClose} style={stil.zu} aria-label="Schließen">✕</button>
        </div>
        <p style={stil.unter}>
          {mehr ? 'Über 300' : gesamt} {gesamt === 1 ? 'Änderung' : 'Änderungen'} anderer an deinen Veranstaltungen.
        </p>
        <div style={stil.inhalt}>
          {veranstaltungen.map((v) => (
            <section key={v.event_id} style={stil.event}>
              <h3 style={stil.eventName}>{v.event_name}</h3>
              <Zeilen eintraege={v.eintraege.slice(0, JE)} />
              {v.eintraege.length > JE && (
                <p style={stil.weitere}>
                  und {v.eintraege.length - JE} weitere – alles unter „Aktionen → Verlauf“ in der Veranstaltung.
                </p>
              )}
            </section>
          ))}
        </div>
        <div style={stil.fuss}>
          <button type="button" onClick={onClose} style={stil.ok}>Alles klar</button>
        </div>
      </div>
    </div>
  );
};

/*
 * Eigener Aufbau (Kopf, rollender Inhalt, Fuss) - deshalb NICHT die
 * allgemeinen Klassen app-modal/app-modal-actions: deren Fussleiste rechnet
 * mit 2 rem Innenabstand des Fensters und rutschte hier unten heraus.
 */
const stil: { [k: string]: React.CSSProperties } = {
  hintergrund: {
    position: 'fixed', inset: 0, zIndex: 2500, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '1rem',
  },
  kasten: {
    width: '100%', maxWidth: '40rem', maxHeight: 'min(85vh, calc(100dvh - 1.5rem))', display: 'flex', flexDirection: 'column',
    backgroundColor: 'var(--c-surface)', borderRadius: '8px', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
  },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem 1.25rem 0' },
  titel: { margin: 0, fontSize: '1.25rem', color: 'var(--c-text)' },
  zu: {
    background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--c-text-muted)',
    minHeight: 'auto', padding: '0.25rem 0.5rem',
  },
  unter: { margin: '0.35rem 1.25rem 0.75rem', fontSize: '0.875rem', color: 'var(--c-text-muted)' },
  inhalt: { overflowY: 'auto', padding: '0 1.25rem 1rem', overscrollBehavior: 'contain' },
  leer: { color: 'var(--c-text-muted)', fontSize: '0.9375rem' },
  event: { marginTop: '0.75rem' },
  eventName: { margin: '0 0 0.25rem', fontSize: '1rem', color: 'var(--c-text)' },
  tagBlock: { marginTop: '0.75rem' },
  tagKopf: {
    fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
    color: 'var(--c-text-muted)', marginBottom: '0.25rem',
  },
  liste: { listStyle: 'none', margin: 0, padding: 0 },
  zeile: {
    display: 'grid', gridTemplateColumns: '3rem 5.5rem 1fr', gap: '0.5rem', alignItems: 'baseline',
    padding: '0.4rem 0', borderBottom: '1px solid var(--c-border)', fontSize: '0.875rem', lineHeight: 1.4,
  },
  uhr: { color: 'var(--c-text-muted)', fontVariantNumeric: 'tabular-nums' },
  wer: { fontWeight: 600, color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  was: { color: 'var(--c-text)', overflowWrap: 'anywhere' },
  weitere: { margin: '0.4rem 0 0', fontSize: '0.8125rem', color: 'var(--c-text-muted)' },
  mehr: {
    marginTop: '0.75rem', padding: '0.4rem 0.9rem', borderRadius: '4px', cursor: 'pointer',
    border: '1px solid var(--c-border-strong)', backgroundColor: 'transparent', color: 'var(--c-text)',
  },
  fuss: { display: 'flex', justifyContent: 'flex-end', padding: '0.75rem 1.25rem', borderTop: '1px solid var(--c-border)' },
  ok: {
    padding: '0.5rem 1.25rem', borderRadius: '4px', border: 'none', cursor: 'pointer', fontWeight: 500,
    backgroundColor: 'var(--c-accent)', color: 'var(--c-text-inverse)',
  },
};
