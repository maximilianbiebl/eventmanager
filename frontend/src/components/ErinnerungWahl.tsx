import React, { useMemo, useState } from 'react';
import { tasksApi, TaskAssignment } from '../api/tasks';
import { toLocalDate } from '../utils/date';

/*
 * Eigene Erinnerung an einer Aufgabe - vier Arten in einer Zeile.
 *
 *   In … Min     ab jetzt, einmalig
 *   … Min vorher vor der Aufgabe, bleibt stehen
 *   Um … Uhr     fester Tag und Uhrzeit, einmalig
 *   Keine        gar keine Erinnerung
 *
 * "… Min vorher" braucht eine Uhrzeit an der Aufgabe. Hat sie keine, steht
 * die Art durchgestrichen da statt zu verschwinden: so sieht man, dass es
 * sie gibt und warum sie hier nicht greift.
 *
 * Unter der Eingabe steht immer, was dabei herauskommt ("Ergibt: heute
 * 07:15 Uhr"). Wer eine Erinnerung stellt, will vorher wissen, wann sie
 * klingelt - nicht hinterher.
 */

type Art = 'in' | 'vorher' | 'um' | 'keine';

const zweistellig = (n: number) => String(n).padStart(2, '0');

/** "2027-09-19" aus einem Datum - ohne den Umweg über UTC. */
const alsTag = (d: Date) => `${d.getFullYear()}-${zweistellig(d.getMonth() + 1)}-${zweistellig(d.getDate())}`;
const alsUhrzeit = (d: Date) => `${zweistellig(d.getHours())}:${zweistellig(d.getMinutes())}`;

/** Tag der Aufgabe: Beginn der Durchführung plus Tagnummer. */
const tagDerAufgabe = (task: TaskAssignment): Date => {
  const start = toLocalDate(task.instance_start_date) ?? new Date();
  start.setDate(start.getDate() + (task.day_number - 1));
  start.setHours(0, 0, 0, 0);
  return start;
};

const nahAmText = (ziel: Date): string => {
  const heute = new Date(); heute.setHours(0, 0, 0, 0);
  const tag = new Date(ziel); tag.setHours(0, 0, 0, 0);
  const tage = Math.round((tag.getTime() - heute.getTime()) / 86400000);
  if (tage === 0) return 'heute';
  if (tage === 1) return 'morgen';
  if (tage === -1) return 'gestern';
  return ziel.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
};

/** Wie die eingestellte Erinnerung in einem Satz heißt. */
export const erinnerungText = (task: TaskAssignment): string => {
  if (task.reminder_at) {
    const d = new Date(task.reminder_at);
    return `Erinnerung ${nahAmText(d)} ${alsUhrzeit(d)} Uhr`;
  }
  const minuten = task.reminder_minutes;
  if (minuten === 0) return 'Keine Erinnerung';
  if (!minuten) return '';
  return `Erinnerung ${minuten} Min vorher`;
};

interface Props {
  task: TaskAssignment;
  /** Nach dem Speichern: Liste neu laden. */
  fertig: () => void;
  abbrechen: () => void;
}

export const ErinnerungWahl: React.FC<Props> = ({ task, fertig, abbrechen }) => {
  const hatZeit = !!(task.scheduled_time || task.start_time);

  const [art, setArt] = useState<Art>(() => {
    if (task.reminder_at) return 'um';
    if (task.reminder_minutes === 0) return 'keine';
    return hatZeit ? 'vorher' : 'in';
  });
  const [minutenVorher, setMinutenVorher] = useState<number>(task.reminder_minutes || 15);
  const [minutenAbJetzt, setMinutenAbJetzt] = useState<number>(30);
  const [tag, setTag] = useState<string>(() => alsTag(task.reminder_at ? new Date(task.reminder_at) : tagDerAufgabe(task)));
  const [uhrzeit, setUhrzeit] = useState<string>(() =>
    task.reminder_at ? alsUhrzeit(new Date(task.reminder_at)) : '09:00');
  const [laeuft, setLaeuft] = useState(false);
  const [fehler, setFehler] = useState('');

  /** Der Zeitpunkt, der aus der aktuellen Eingabe folgt. */
  const ergebnis = useMemo<Date | null>(() => {
    if (art === 'keine') return null;
    if (art === 'in') return new Date(Date.now() + (minutenAbJetzt || 0) * 60000);
    if (art === 'um') {
      const d = new Date(`${tag}T${uhrzeit || '00:00'}`);
      return isNaN(d.getTime()) ? null : d;
    }
    // vorher: von der Uhrzeit der Aufgabe zurückgerechnet
    const zeit = task.start_time || task.scheduled_time;
    if (!zeit) return null;
    const [h, m] = zeit.split(':');
    const d = tagDerAufgabe(task);
    d.setHours(Number(h), Number(m), 0, 0);
    return new Date(d.getTime() - (minutenVorher || 0) * 60000);
  }, [art, minutenAbJetzt, minutenVorher, tag, uhrzeit, task]);

  const speichern = async () => {
    setFehler('');
    setLaeuft(true);
    try {
      if (art === 'keine') await tasksApi.setzeErinnerung(task.assignment_id, { art: 'keine' });
      else if (art === 'vorher') await tasksApi.setzeErinnerung(task.assignment_id, { art: 'vorher', minuten: minutenVorher });
      else if (art === 'in') await tasksApi.setzeErinnerung(task.assignment_id, { art: 'in', minuten: minutenAbJetzt });
      else await tasksApi.setzeErinnerung(task.assignment_id, { art: 'um', zeitpunkt: ergebnis ? ergebnis.toISOString() : '' });
      fertig();
    } catch (e: any) {
      setFehler(e?.response?.data?.error || 'Speichern nicht möglich');
    } finally {
      setLaeuft(false);
    }
  };

  const arten: { wert: Art; name: string; aus?: boolean }[] = [
    { wert: 'in', name: 'In … Min' },
    { wert: 'vorher', name: '… Min vorher', aus: !hatZeit },
    { wert: 'um', name: 'Um … Uhr' },
    { wert: 'keine', name: 'Keine' },
  ];

  return (
    <div className="erinnerung-wahl">
      <div className="erinnerung-arten" role="group" aria-label="Art der Erinnerung">
        {arten.map((a) => (
          <button
            key={a.wert}
            type="button"
            disabled={a.aus}
            title={a.aus ? 'Diese Aufgabe hat keine Uhrzeit' : undefined}
            onClick={() => { setArt(a.wert); setFehler(''); }}
            className={art === a.wert ? 'tv-chip-active' : 'tv-chip'}
            style={a.aus ? { textDecoration: 'line-through', opacity: 0.45 } : undefined}
          >
            {a.name}
          </button>
        ))}
      </div>

      {art !== 'keine' && (
        <div className="erinnerung-eingabe">
          {art === 'in' && (
            <>
              <input
                type="number" min={1} max={1440} value={minutenAbJetzt}
                onChange={(e) => setMinutenAbJetzt(Number(e.target.value))}
                aria-label="Minuten ab jetzt"
              />
              <span>Minuten ab jetzt</span>
            </>
          )}
          {art === 'vorher' && (
            <>
              <input
                type="number" min={1} max={1440} value={minutenVorher}
                onChange={(e) => setMinutenVorher(Number(e.target.value))}
                aria-label="Minuten vorher"
              />
              <span>Minuten vor {(task.start_time || task.scheduled_time || '').slice(0, 5)} Uhr</span>
            </>
          )}
          {art === 'um' && (
            <>
              <input type="date" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tag" />
              <input type="time" value={uhrzeit} onChange={(e) => setUhrzeit(e.target.value)} aria-label="Uhrzeit" />
            </>
          )}
        </div>
      )}

      <div className="erinnerung-folge">
        {art === 'keine'
          ? 'Für diese Aufgabe wird nicht erinnert.'
          : ergebnis
            ? <>Ergibt: <b>{nahAmText(ergebnis)} {alsUhrzeit(ergebnis)} Uhr</b></>
            : 'Bitte Zeit eingeben'}
      </div>

      {fehler && <div className="erinnerung-fehler">{fehler}</div>}

      <div className="erinnerung-knoepfe">
        <button type="button" onClick={abbrechen} className="erinnerung-ab">Abbrechen</button>
        <button type="button" onClick={speichern} disabled={laeuft} className="erinnerung-speichern">
          {laeuft ? 'Speichert…' : 'Speichern'}
        </button>
      </div>
    </div>
  );
};
