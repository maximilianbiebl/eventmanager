import React, { useMemo, useState } from 'react';
import { TaskGroup } from '../../api/program';
import { tasksApi } from '../../api/tasks';

/*
 * Mehrere Aufgaben auf einmal verschieben oder kopieren: auf einen anderen
 * Tag und/oder in eine andere Aufgabengruppe. Geoeffnet aus der
 * Auswahlleiste der Tabelle. (Die Reihenfolge aendern die Pfeile - sie
 * nehmen alle markierten mit.)
 *
 * Eine Kopie beginnt als "nicht begonnen"; Einteilungen und Notizen
 * kommen nur mit, wenn das jeweilige Haekchen gesetzt ist.
 *
 * Eine Gruppe gehoert zu genau einem Tag. Deshalb bietet die Gruppenliste
 * nur die Gruppen des gewaehlten Tages an, und "Gruppe behalten" gibt es nur,
 * solange der Tag bleibt - bei einem Tageswechsel verlieren die Aufgaben ihre
 * alte Gruppe (sonst stuenden sie unter einer Ueberschrift eines anderen
 * Tages). Was passiert, steht als Satz unter den Feldern.
 */

interface Props {
  eventId: number;
  /** Womit das Fenster aufgeht - je nach Knopf in der Auswahlleiste. */
  startArt?: 'verschieben' | 'kopieren';
  taskIds: number[];
  eventDays: number;
  gruppen: TaskGroup[];
  onClose: () => void;
  onFertig: (anzahl: number, kopiert: boolean) => void;
}

const BEHALTEN = 'behalten';
const KEINE = 'keine';

export const VerschiebenDialog: React.FC<Props> = ({ eventId, startArt = 'verschieben', taskIds, eventDays, gruppen, onClose, onFertig }) => {
  const [art, setArt] = useState<'verschieben' | 'kopieren'>(startArt);
  const [mitNotiz, setMitNotiz] = useState(false);
  const [mitEinteilung, setMitEinteilung] = useState(false);
  const [tag, setTag] = useState<string>(BEHALTEN);
  const [gruppe, setGruppe] = useState<string>(BEHALTEN);
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  const tagZahl = tag === BEHALTEN ? null : Number(tag);
  const gruppenDesTages = useMemo(
    () => (tagZahl === null ? [] : gruppen.filter((g) => g.day_number === tagZahl)),
    [gruppen, tagZahl]
  );

  const waehleTag = (wert: string) => {
    setTag(wert);
    // Eine Gruppe vom alten Tag passt nicht mehr; "behalten" auch nicht.
    setGruppe(wert === BEHALTEN ? BEHALTEN : KEINE);
  };

  const anzahl = taskIds.length;
  const aufgaben = anzahl === 1 ? '1 Aufgabe' : `${anzahl} Aufgaben`;
  const gruppenName = gruppenDesTages.find((g) => String(g.id) === gruppe)?.title;
  const kopieren = art === 'kopieren';
  const zielText = gruppe === KEINE ? ', ohne Gruppe' : gruppenName ? `, in „${gruppenName}“` : '';
  const satz = kopieren
    ? (tagZahl === null
        ? (gruppe === BEHALTEN
            ? `Von ${anzahl === 1 ? 'der Aufgabe' : `jeder der ${anzahl} Aufgaben`} entsteht eine Kopie am selben Tag, in derselben Gruppe.`
            : `Kopien entstehen am selben Tag${zielText}.`)
        : `Kopien entstehen auf Tag ${tagZahl}${zielText}.`)
      + ` ${anzahl === 1 ? 'Sie beginnt' : 'Sie beginnen'} als „nicht begonnen“${mitEinteilung ? ', mit denselben Leuten eingeteilt' : ', ohne Einteilung'}${mitNotiz ? ' und mit ihrer Notiz' : ''}.`
    : tagZahl === null
      ? (gruppe === BEHALTEN ? 'Es ändert sich nichts.' : `${aufgaben} bleiben an ihrem Tag und kommen ${gruppe === KEINE ? 'aus ihrer Gruppe heraus' : `in „${gruppenName}“`}.`)
      : `${aufgaben} kommen auf Tag ${tagZahl}${zielText}.`;
  // Kopieren ohne Ziel ist erlaubt: dann entsteht die Kopie am selben Tag, in derselben Gruppe.
  const nichts = !kopieren && tagZahl === null && gruppe === BEHALTEN;

  const los = async () => {
    setLaeuft(true);
    setFehler('');
    try {
      const daten: { day_number?: number; program_item_id?: number | null } = {};
      if (tagZahl !== null) daten.day_number = tagZahl;
      if (gruppe === KEINE) daten.program_item_id = null;
      else if (gruppe !== BEHALTEN) daten.program_item_id = Number(gruppe);
      if (kopieren) {
        const antwort = await tasksApi.bulkCopy(eventId, taskIds, { ...daten, mit_zuweisungen: mitEinteilung, mit_notiz: mitNotiz });
        onFertig(antwort.kopiert ?? anzahl, true);
      } else {
        const antwort = await tasksApi.bulkMove(eventId, taskIds, daten);
        onFertig(antwort.verschoben ?? anzahl, false);
      }
    } catch (e: any) {
      setFehler(e.response?.data?.error || (kopieren ? 'Kopieren fehlgeschlagen' : 'Verschieben fehlgeschlagen'));
      setLaeuft(false);
    }
  };

  return (
    <div className="app-modal-overlay" style={stil.hintergrund} onClick={onClose}>
      <div className="app-modal" style={stil.kasten} role="dialog" aria-labelledby="verschieben-titel" onClick={(e) => e.stopPropagation()}>
        <h2 id="verschieben-titel" style={stil.titel}>{aufgaben} {kopieren ? 'kopieren' : 'verschieben'}</h2>

        <div role="radiogroup" aria-label="Was soll passieren?" style={stil.umschalter}>
          {(['verschieben', 'kopieren'] as const).map((a) => (
            <button
              key={a} type="button" role="radio" aria-checked={art === a}
              onClick={() => setArt(a)}
              style={{ ...stil.umschaltKnopf, ...(art === a ? stil.umschaltAn : {}) }}
            >
              {a === 'verschieben' ? 'Verschieben' : 'Kopieren'}
            </button>
          ))}
        </div>

        <label style={stil.label} htmlFor="verschieben-tag">Auf welchen Tag?</label>
        <select id="verschieben-tag" value={tag} onChange={(e) => waehleTag(e.target.value)} style={stil.feld}>
          <option value={BEHALTEN}>Tag beibehalten</option>
          {Array.from({ length: eventDays }, (_, i) => i + 1).map((t) => (
            <option key={t} value={String(t)}>Tag {t}</option>
          ))}
        </select>

        <label style={stil.label} htmlFor="verschieben-gruppe">In welche Aufgabengruppe?</label>
        <select id="verschieben-gruppe" value={gruppe} onChange={(e) => setGruppe(e.target.value)} style={stil.feld}>
          {tagZahl === null && <option value={BEHALTEN}>Gruppe beibehalten</option>}
          <option value={KEINE}>Keine Gruppe</option>
          {gruppenDesTages.map((g) => (
            <option key={g.id} value={String(g.id)}>
              {g.title}{g.time ? ` · ${String(g.time).slice(0, 5)} Uhr` : ''}
            </option>
          ))}
        </select>
        {tagZahl === null && (
          <p style={stil.hinweis}>Gruppen lassen sich nach Tag auswählen – eine Gruppe gehört zu genau einem Tag.</p>
        )}

        {kopieren && (
          <label style={stil.haken}>
            <input type="checkbox" checked={mitEinteilung} onChange={(e) => setMitEinteilung(e.target.checked)} />
            Einteilungen mitkopieren
          </label>
        )}
        {kopieren && (
          <label style={{ ...stil.haken, marginTop: '0.4rem' }}>
            <input type="checkbox" checked={mitNotiz} onChange={(e) => setMitNotiz(e.target.checked)} />
            Notizen mitkopieren
          </label>
        )}

        <p style={stil.satz}>{satz}</p>
        {fehler && <p style={stil.fehler}>{fehler}</p>}

        <div className="app-modal-actions" style={stil.knoepfe}>
          <button type="button" onClick={onClose} style={stil.abbrechen}>Abbrechen</button>
          <button type="button" onClick={los} disabled={laeuft || nichts} style={{ ...stil.los, ...(laeuft || nichts ? stil.aus : {}) }}>
            {laeuft ? (kopieren ? 'Kopiere…' : 'Verschiebe…') : (kopieren ? 'Kopieren' : 'Verschieben')}
          </button>
        </div>
      </div>
    </div>
  );
};

const stil: { [k: string]: React.CSSProperties } = {
  hintergrund: {
    position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'center',
    justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.5)', padding: '1rem',
  },
  kasten: {
    // Fuer die Fussleiste aus styles/modal.css: sie rechnet mit diesem Abstand.
    ['--modal-pad' as any]: '1.5rem',
    width: '100%', maxWidth: '26rem', padding: '1.5rem', borderRadius: '8px',
    backgroundColor: 'var(--c-surface)', boxShadow: 'var(--shadow-lg)',
  },
  titel: { margin: '0 0 1rem', fontSize: '1.25rem', color: 'var(--c-text)' },
  umschalter: {
    display: 'flex', padding: '3px', borderRadius: '6px', gap: '3px',
    backgroundColor: 'var(--c-surface-muted)', border: '1px solid var(--c-border)',
  },
  umschaltKnopf: {
    flex: 1, padding: '0.4rem 0.75rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
    backgroundColor: 'transparent', color: 'var(--c-text-muted)', fontWeight: 500, minHeight: 'auto',
  },
  umschaltAn: { backgroundColor: 'var(--c-surface)', color: 'var(--c-text)', boxShadow: 'var(--shadow-sm, 0 1px 2px rgba(0,0,0,0.12))' },
  haken: { display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.85rem', fontSize: '0.9375rem', color: 'var(--c-text)', cursor: 'pointer' },
  label: { display: 'block', margin: '0.75rem 0 0.25rem', fontSize: '0.875rem', fontWeight: 500, color: 'var(--c-text)' },
  feld: {
    width: '100%', padding: '0.5rem', borderRadius: '4px', fontSize: '1rem',
    border: '1px solid var(--c-border-strong)', backgroundColor: 'var(--c-surface)', color: 'var(--c-text)',
  },
  hinweis: { margin: '0.35rem 0 0', fontSize: '0.8125rem', color: 'var(--c-text-muted)' },
  satz: {
    margin: '1rem 0 0', padding: '0.6rem 0.75rem', borderRadius: '6px', fontSize: '0.875rem',
    backgroundColor: 'var(--c-surface-muted)', color: 'var(--c-text)',
  },
  fehler: { margin: '0.75rem 0 0', color: 'var(--c-danger-text)', fontSize: '0.875rem' },
  knoepfe: { display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' },
  abbrechen: {
    padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', backgroundColor: 'transparent',
    border: '1px solid var(--c-border-strong)', color: 'var(--c-text)',
  },
  los: {
    padding: '0.5rem 1rem', borderRadius: '4px', cursor: 'pointer', border: 'none',
    backgroundColor: 'var(--c-accent)', color: 'var(--c-text-inverse)', fontWeight: 500,
  },
  aus: { opacity: 0.5, cursor: 'not-allowed' },
};
