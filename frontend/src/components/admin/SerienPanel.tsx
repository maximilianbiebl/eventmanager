import React, { useCallback, useEffect, useState } from 'react';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { SerieBearbeitenModal } from './SerieBearbeitenModal';

/*
 * Serien einer Veranstaltung - im selben Gewand wie die Aufgabengruppen
 * nebenan: eine Zeile je Serie, Anlegen als Zeile darüber, Bearbeiten in
 * einem eigenen Dialog.
 *
 * Vorher stand hier ein Erklärabsatz, ein großer Knopf, eine Zwischen-
 * überschrift und je Serie ein Kasten mit zwei kräftigen Knöpfen. Für zwei
 * Serien war das eine ganze Bildschirmseite.
 */

interface Props {
  eventId: number;
  onGeaendert?: () => void;
  /** Löschen fragt nach, was mit den Aufgaben geschieht - das macht der Elternteil. */
  onLoeschen: (serie: TaskSeries) => void;
  /** Zähler, den der Elternteil hochzählt, wenn er ein Neuladen erzwingen will. */
  neuLaden?: number;
}

export const SerienPanel: React.FC<Props> = ({ eventId, onGeaendert, onLoeschen, neuLaden }) => {
  const [serien, setSerien] = useState<TaskSeries[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [neu, setNeu] = useState('');
  const [legtAn, setLegtAn] = useState(false);
  const [bearbeite, setBearbeite] = useState<TaskSeries | null>(null);

  const laden = useCallback(async () => {
    try {
      setSerien(await taskSeriesApi.getByEvent(eventId));
      setFehler('');
    } catch {
      setFehler('Serien konnten nicht geladen werden');
    } finally {
      setLaedt(false);
    }
  }, [eventId]);

  useEffect(() => { laden(); }, [laden, neuLaden]);

  const anlegen = async () => {
    if (!neu.trim()) return;
    setLegtAn(true);
    try {
      await taskSeriesApi.create({ event_id: eventId, name: neu.trim() });
      setNeu('');
      await laden();
      onGeaendert?.();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Anlegen fehlgeschlagen');
    } finally {
      setLegtAn(false);
    }
  };

  return (
    <div>
      <div style={stil.kopfZeile}>
        <input
          type="text"
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anlegen(); } }}
          placeholder="Neue Serie anlegen …"
          style={stil.eingabe}
        />
        <button type="button" onClick={anlegen} disabled={legtAn || !neu.trim()} style={stil.anlegen}>
          Anlegen
        </button>
      </div>

      {fehler && <div style={stil.fehler}>{fehler}</div>}

      <div style={stil.liste}>
        {laedt ? (
          <div style={stil.leer}>Lade …</div>
        ) : serien.length === 0 ? (
          <div style={stil.leer}>Noch keine Serie angelegt.</div>
        ) : serien.map((s) => {
          const a = Number(s.task_count || 0);
          const m = Number(s.member_count || 0);
          return (
            <div key={s.id} style={stil.zeile}>
              <b style={stil.name}>{s.name}</b>
              <span style={stil.zahl}>
                {a} {a === 1 ? 'Aufgabe' : 'Aufgaben'} · {m} {m === 1 ? 'Mitglied' : 'Mitglieder'}
              </span>
              {s.description && <span style={stil.beschreibung}>{s.description}</span>}
              <span style={stil.rechts}>
                <button type="button" onClick={() => setBearbeite(s)} style={stil.knopf}>Bearbeiten</button>
                <button type="button" onClick={() => onLoeschen(s)} style={stil.entfernen}>Entfernen</button>
              </span>
            </div>
          );
        })}
      </div>
      <p style={stil.hinweis}>
        Das Team einer Serie bekommt alle ihre Aufgaben zugewiesen – auch die aus Gruppen, die zur
        Serie gehören.
      </p>

      {bearbeite && (
        <SerieBearbeitenModal
          serie={bearbeite}
          eventId={eventId}
          onClose={() => setBearbeite(null)}
          onGespeichert={() => { laden(); onGeaendert?.(); }}
        />
      )}
    </div>
  );
};

const stil: { [k: string]: React.CSSProperties } = {
  kopfZeile: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  eingabe: {
    flex: '1 1 12rem', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
    borderRadius: '4px', color: 'var(--c-text)', backgroundColor: 'var(--c-surface)',
  },
  anlegen: {
    padding: '0.5rem 1rem', borderRadius: '4px', border: 'none', cursor: 'pointer',
    fontWeight: 500, backgroundColor: 'var(--c-accent)', color: 'var(--c-text-inverse)',
  },
  fehler: {
    padding: '0.5rem 0.75rem', marginBottom: '0.5rem', borderRadius: '4px',
    backgroundColor: 'var(--c-danger-soft)', color: 'var(--c-danger-strong)', fontSize: '0.875rem',
  },
  liste: { border: '1px solid var(--c-border-strong)', borderRadius: '6px', overflow: 'hidden' },
  zeile: {
    display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.5rem 0.625rem',
    fontSize: '0.875rem', color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)',
    flexWrap: 'wrap',
  },
  name: { fontWeight: 600 },
  zahl: { color: 'var(--c-text-muted)', fontSize: '0.75rem', whiteSpace: 'nowrap' },
  beschreibung: {
    color: 'var(--c-text-subtle)', fontSize: '0.75rem', overflow: 'hidden',
    textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '12rem',
  },
  rechts: { marginLeft: 'auto', display: 'flex', gap: '0.25rem' },
  knopf: {
    padding: '0.1875rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer',
    background: 'none', border: '1px solid var(--c-border-strong)', color: 'var(--c-text)',
  },
  entfernen: {
    padding: '0.1875rem 0.5rem', fontSize: '0.75rem', borderRadius: '4px', cursor: 'pointer',
    backgroundColor: 'var(--c-danger-soft)', border: '1px solid var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
  },
  leer: { padding: '0.75rem', fontSize: '0.8125rem', color: 'var(--c-text-muted)' },
  hinweis: { margin: '0.375rem 0 0 0', fontSize: '0.75rem', color: 'var(--c-text-muted)' },
};
