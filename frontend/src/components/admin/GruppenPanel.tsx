import React, { useCallback, useEffect, useState } from 'react';
import { programApi, TaskGroup } from '../../api/program';
import { farbeVon } from '../../utils/gruppenFarben';
import { zeitFeldProps } from '../../utils/zeitFeld';
import { GruppeBearbeitenModal } from './GruppeBearbeitenModal';

/*
 * Aufgabengruppen eines Tages verwalten.
 *
 * Gezeigt wird immer genau ein Tag - eine Gruppe gehört zu einem Tag, und
 * eine Liste über alle Tage hinweg wäre bei einer Woche schnell unlesbar.
 *
 * Eine Gruppe ohne Aufgaben ist keine leere Hülle, sondern eine reine
 * Zwischenüberschrift für den Tagesablauf. Deshalb steht dort "nur
 * Überschrift" und keine Null.
 */

interface Props {
  eventId: number;
  eventDays: number;
  onGeaendert?: () => void;
}

const hhmm = (wert?: string | null) => (wert ? String(wert).slice(0, 5) : '');

export const GruppenPanel: React.FC<Props> = ({ eventId, eventDays, onGeaendert }) => {
  const [tag, setTag] = useState(1);
  const [gruppen, setGruppen] = useState<TaskGroup[]>([]);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState('');
  const [neu, setNeu] = useState('');
  const [neuZeit, setNeuZeit] = useState('');
  const [legtAn, setLegtAn] = useState(false);
  const [bearbeite, setBearbeite] = useState<TaskGroup | null>(null);

  const laden = useCallback(async () => {
    try {
      setGruppen(await programApi.getByEvent(eventId));
      setFehler('');
    } catch {
      setFehler('Gruppen konnten nicht geladen werden');
    } finally {
      setLaedt(false);
    }
  }, [eventId]);

  useEffect(() => { laden(); }, [laden]);

  const anlegen = async () => {
    if (!neu.trim()) return;
    setLegtAn(true);
    try {
      await programApi.create({
        event_id: eventId, day_number: tag, title: neu.trim(), time: neuZeit || null,
      });
      setNeu('');
      setNeuZeit('');
      await laden();
      onGeaendert?.();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Anlegen fehlgeschlagen');
    } finally {
      setLegtAn(false);
    }
  };

  const entfernen = async (g: TaskGroup) => {
    const n = Number(g.task_count || 0);
    const frage = n > 0
      ? `Gruppe „${g.title}" entfernen? Die ${n} ${n === 1 ? 'Aufgabe bleibt' : 'Aufgaben bleiben'} erhalten.`
      : `Gruppe „${g.title}" entfernen?`;
    if (!window.confirm(frage)) return;
    try {
      await programApi.delete(g.id);
      await laden();
      onGeaendert?.();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Entfernen fehlgeschlagen');
    }
  };

  const desTages = gruppen.filter((g) => g.day_number === tag);
  const tage = Array.from({ length: Math.max(1, eventDays) }, (_, i) => i + 1);

  return (
    <div>
      <div style={stil.kopfZeile}>
        <select value={tag} onChange={(e) => setTag(Number(e.target.value))} style={stil.tagWahl}>
          {tage.map((t) => <option key={t} value={t}>Tag {t}</option>)}
        </select>
        <input
          type="text"
          value={neu}
          onChange={(e) => setNeu(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); anlegen(); } }}
          placeholder="Neue Gruppe anlegen …"
          style={stil.eingabe}
        />
        <input type="time" {...zeitFeldProps} value={neuZeit}
          onChange={(e) => setNeuZeit(e.target.value)} style={stil.zeitFeld} title="Uhrzeit (optional)" />
        <button type="button" onClick={anlegen} disabled={legtAn || !neu.trim()} style={stil.anlegen}>
          Anlegen
        </button>
      </div>

      {fehler && <div style={stil.fehler}>{fehler}</div>}

      <div style={stil.liste}>
        {laedt ? (
          <div style={stil.leer}>Lade …</div>
        ) : desTages.length === 0 ? (
          <div style={stil.leer}>Für Tag {tag} gibt es noch keine Gruppe.</div>
        ) : desTages.map((g) => {
          const f = farbeVon(g.color);
          const n = Number(g.task_count || 0);
          return (
            <div key={g.id} style={stil.zeile}>
              <span style={{ ...stil.punkt, backgroundColor: f ? f.kraeftig : 'var(--c-border-strong)' }} />
              <b style={stil.name}>{g.title}</b>
              <span style={stil.zahl}>
                {n === 0 ? 'nur Überschrift' : `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`}
              </span>
              {g.series_name && <span style={stil.serie}>{g.series_name}</span>}
              <span style={stil.zeit}>{hhmm(g.time)}</span>
              <button type="button" onClick={() => setBearbeite(g)} style={stil.knopf}>Bearbeiten</button>
              <button type="button" onClick={() => entfernen(g)} style={stil.entfernen}>Entfernen</button>
            </div>
          );
        })}
      </div>
      <p style={stil.hinweis}>Nur die Gruppen des gewählten Tages.</p>

      {bearbeite && (
        <GruppeBearbeitenModal
          gruppe={bearbeite}
          eventId={eventId}
          eventDays={eventDays}
          onClose={() => setBearbeite(null)}
          onGespeichert={() => { laden(); onGeaendert?.(); }}
        />
      )}
    </div>
  );
};

const stil: { [k: string]: React.CSSProperties } = {
  kopfZeile: { display: 'flex', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' },
  tagWahl: {
    flex: '0 0 7rem', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
    borderRadius: '4px', color: 'var(--c-text)', backgroundColor: 'var(--c-surface)',
  },
  eingabe: {
    flex: '1 1 12rem', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
    borderRadius: '4px', color: 'var(--c-text)', backgroundColor: 'var(--c-surface)',
  },
  zeitFeld: {
    flex: '0 0 8rem', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
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
  punkt: { width: '0.5rem', height: '0.5rem', borderRadius: '50%', flex: '0 0 auto' },
  name: { fontWeight: 600 },
  zahl: { color: 'var(--c-text-muted)', fontSize: '0.75rem' },
  serie: {
    fontSize: '0.6875rem', color: 'var(--c-accent-text)', backgroundColor: 'var(--c-accent-soft)',
    padding: '0 0.375rem', borderRadius: '9999px',
  },
  zeit: {
    marginLeft: 'auto', color: 'var(--c-text-muted)', fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
  },
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
