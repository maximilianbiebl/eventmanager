import React, { useEffect, useState } from 'react';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { programApi, TaskGroup } from '../../api/program';
import { User } from '../../api/users';
import client from '../../api/client';
import { farbeVon } from '../../utils/gruppenFarben';

/*
 * Serie bearbeiten.
 *
 * Aufgebaut wie der Dialog für Aufgabengruppen: oben die Stammdaten, dann
 * das Team, dann der Inhalt. Vorher lag beides in der Serienliste selbst -
 * ein aufgeklappter Eintrag schob den Rest nach unten, und beim Bearbeiten
 * war nicht zu sehen, was zur Serie gehört.
 *
 * Der Inhalt sind Gruppen UND einzelne Aufgaben. Wer der Serie ein Team
 * gibt, deckt damit auch die Aufgaben der Gruppen ab - auch die, die später
 * dazukommen. Eine Aufgabe, die schon über ihre Gruppe dabei ist, steht
 * nachrangig da: sie lässt sich zusätzlich einzeln zuordnen, dann gewinnt
 * ihre eigene Zuordnung.
 */

interface Aufgabe {
  id: number;
  title: string;
  day_number: number;
  start_time?: string | null;
  scheduled_time?: string | null;
  series_id?: number | null;
  program_item_id?: number | null;
}

interface Props {
  serie: TaskSeries;
  eventId: number;
  onClose: () => void;
  onGespeichert: () => void;
}

const hhmm = (wert?: string | null) => (wert ? String(wert).slice(0, 5) : '');

export const SerieBearbeitenModal: React.FC<Props> = ({ serie, eventId, onClose, onGespeichert }) => {
  const [name, setName] = useState(serie.name);
  const [beschreibung, setBeschreibung] = useState(serie.description || '');

  const [alleAufgaben, setAlleAufgaben] = useState<Aufgabe[]>([]);
  const [gruppen, setGruppen] = useState<TaskGroup[]>([]);
  const [team, setTeam] = useState<User[]>([]);

  const [gewaehlteAufgaben, setGewaehlteAufgaben] = useState<number[]>([]);
  const [gewaehlteGruppen, setGewaehlteGruppen] = useState<number[]>([]);
  const [mitglieder, setMitglieder] = useState<number[]>([]);
  const [vorherigeMitglieder, setVorherigeMitglieder] = useState<number[]>([]);

  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState('');

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const [aufgaben, gr, personal, details] = await Promise.all([
          client.get(`/tasks/event/${eventId}`),
          programApi.getByEvent(eventId),
          client.get(`/users/event/${eventId}/staff`),
          taskSeriesApi.getById(serie.id),
        ]);
        if (abgebrochen) return;
        setAlleAufgaben(aufgaben.data as Aufgabe[]);
        setGruppen(gr);
        setTeam(personal.data as User[]);
        setGewaehlteGruppen((details.groups || []).map((g) => g.id));
        // Nur die unmittelbar zugeordneten - die anderen haengen an ihrer Gruppe.
        setGewaehlteAufgaben((aufgaben.data as Aufgabe[])
          .filter((a) => a.series_id === serie.id).map((a) => a.id));
        const ids = (details.members || []).map((m) => m.id);
        setMitglieder(ids);
        setVorherigeMitglieder(ids);
      } catch {
        if (!abgebrochen) setFehler('Serie konnte nicht geladen werden');
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [eventId, serie.id]);

  const um = (liste: number[], setzen: (v: number[]) => void, id: number) =>
    setzen(liste.includes(id) ? liste.filter((x) => x !== id) : [...liste, id]);

  const speichern = async () => {
    if (!name.trim()) { setFehler('Name fehlt'); return; }
    setSpeichert(true);
    setFehler('');
    try {
      await taskSeriesApi.update(serie.id, { name: name.trim(), description: beschreibung.trim() });
      await taskSeriesApi.setzeInhalt(serie.id, gewaehlteAufgaben, gewaehlteGruppen);

      const dazu = mitglieder.filter((id) => !vorherigeMitglieder.includes(id));
      const weg = vorherigeMitglieder.filter((id) => !mitglieder.includes(id));
      if (dazu.length > 0) await taskSeriesApi.addMembers(serie.id, dazu);
      for (const id of weg) await taskSeriesApi.removeMember(serie.id, id);

      onGespeichert();
      onClose();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Speichern fehlgeschlagen');
      setSpeichert(false);
    }
  };

  /** Aufgaben, die über eine angehakte Gruppe schon dabei sind. */
  const ueberGruppe = new Set(
    alleAufgaben.filter((a) => a.program_item_id && gewaehlteGruppen.includes(a.program_item_id))
      .map((a) => a.id)
  );

  const nachTag = [...alleAufgaben].sort((a, b) =>
    a.day_number - b.day_number
    || hhmm(a.start_time || a.scheduled_time).localeCompare(hhmm(b.start_time || b.scheduled_time)));

  return (
    <div className="app-modal-overlay" style={stil.overlay} onClick={onClose}>
      <div className="app-modal" style={stil.modal} onClick={(e) => e.stopPropagation()}>
        <div style={stil.kopf}>
          <h2 style={stil.titel}>Serie bearbeiten</h2>
          <button type="button" onClick={onClose} style={stil.schliessen}>✕</button>
        </div>

        {fehler && <div style={stil.fehler}>{fehler}</div>}

        <div style={stil.zeile}>
          <div style={{ ...stil.feld, flex: 1 }}>
            <label style={stil.label}>Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)}
              style={stil.eingabe} autoFocus />
          </div>
          <div style={{ ...stil.feld, flex: 2 }}>
            <label style={stil.label}>Beschreibung (optional)</label>
            <input type="text" value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)}
              style={stil.eingabe} placeholder="z. B. jeden Tag Frühstück" />
          </div>
        </div>

        <div style={stil.feld}>
          <label style={stil.label}>Team</label>
          <div style={stil.liste}>
            {laedt ? <div style={stil.leer}>Lade …</div>
              : team.length === 0 ? <div style={stil.leer}>Noch niemand im Mitarbeiter-Pool.</div>
              : team.map((u) => (
                <label key={u.id} style={stil.listeZeile}>
                  <input type="checkbox" checked={mitglieder.includes(u.id)}
                    onChange={() => um(mitglieder, setMitglieder, u.id)} style={stil.haken} />
                  <span>{u.name}</span>
                </label>
              ))}
          </div>
          <p style={stil.hinweis}>
            Das Team wird allen Aufgaben der Serie zugewiesen, für jede Durchführung.
          </p>
        </div>

        <div style={stil.feld}>
          <label style={stil.label}>Inhalt</label>
          <div style={stil.liste}>
            <div style={stil.listeKopf}>Aufgabengruppen</div>
            {gruppen.length === 0 ? (
              <div style={stil.leer}>Es gibt noch keine Gruppen.</div>
            ) : gruppen.map((g) => {
              const f = farbeVon(g.color);
              const n = Number(g.task_count || 0);
              return (
                <label key={`g${g.id}`} style={stil.listeZeile}>
                  <input type="checkbox" checked={gewaehlteGruppen.includes(g.id)}
                    onChange={() => um(gewaehlteGruppen, setGewaehlteGruppen, g.id)} style={stil.haken} />
                  <span style={{ ...stil.punkt, backgroundColor: f ? f.kraeftig : 'var(--c-border-strong)' }} />
                  <span style={{ fontWeight: 600 }}>{g.title}</span>
                  <span style={stil.leise}>
                    {n === 0 ? 'nur Überschrift' : `${n} ${n === 1 ? 'Aufgabe' : 'Aufgaben'}`}
                  </span>
                  <span style={stil.tag}>Tag {g.day_number}</span>
                </label>
              );
            })}

            <div style={stil.listeKopf}>Einzelne Aufgaben</div>
            {nachTag.map((a) => (
              <label key={`a${a.id}`} style={stil.listeZeile}>
                <input type="checkbox" checked={gewaehlteAufgaben.includes(a.id)}
                  onChange={() => um(gewaehlteAufgaben, setGewaehlteAufgaben, a.id)} style={stil.haken} />
                <span>{a.title}</span>
                {ueberGruppe.has(a.id) && !gewaehlteAufgaben.includes(a.id) && (
                  <span style={stil.ueberGruppe}>über Gruppe dabei</span>
                )}
                <span style={stil.tag}>Tag {a.day_number}</span>
              </label>
            ))}
          </div>
          <p style={stil.hinweis}>
            Eine Aufgabe, die über ihre Gruppe schon dabei ist, braucht keinen eigenen Haken.
            Setzt man ihn doch, gilt ihre eigene Zuordnung.
          </p>
        </div>

        <div style={stil.fuss}>
          <div style={{ flex: 1 }} />
          <button type="button" onClick={onClose} style={stil.zurueck}>Abbrechen</button>
          <button type="button" onClick={speichern} disabled={speichert} style={stil.speichern}>
            {speichert ? 'Speichert…' : 'Speichern'}
          </button>
        </div>
      </div>
    </div>
  );
};

const stil: { [k: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed', inset: 0, backgroundColor: 'var(--c-overlay)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, padding: '1rem',
  },
  modal: {
    backgroundColor: 'var(--c-surface)', padding: '1.5rem', borderRadius: '8px',
    border: '1px solid var(--c-border-strong)', width: '100%', maxWidth: '560px',
    maxHeight: '90vh', overflow: 'auto',
  },
  kopf: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' },
  titel: { fontSize: '1.25rem', fontWeight: 'bold', margin: 0, color: 'var(--c-text)' },
  schliessen: {
    background: 'none', border: 'none', fontSize: '1.25rem', cursor: 'pointer', color: 'var(--c-text-muted)',
  },
  fehler: {
    padding: '0.5rem 0.75rem', marginBottom: '0.75rem', borderRadius: '4px',
    backgroundColor: 'var(--c-danger-soft)', color: 'var(--c-danger-strong)', fontSize: '0.875rem',
  },
  zeile: { display: 'flex', gap: '0.75rem' },
  feld: { marginBottom: '0.875rem' },
  label: {
    display: 'block', marginBottom: '0.375rem', fontWeight: 500,
    fontSize: '0.8125rem', color: 'var(--c-text)',
  },
  eingabe: {
    width: '100%', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
    borderRadius: '4px', fontSize: '0.9375rem', color: 'var(--c-text)',
    backgroundColor: 'var(--c-surface)',
  },
  liste: {
    border: '1px solid var(--c-border-strong)', borderRadius: '6px',
    maxHeight: '220px', overflowY: 'auto',
  },
  listeKopf: {
    padding: '0.4375rem 0.625rem', backgroundColor: 'var(--c-surface-muted)',
    borderBottom: '1px solid var(--c-border)', fontSize: '0.8125rem', fontWeight: 600,
    color: 'var(--c-text)', position: 'sticky', top: 0,
  },
  listeZeile: {
    display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.4375rem 0.625rem',
    fontSize: '0.875rem', color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)',
    cursor: 'pointer',
  },
  haken: { width: '1.0625rem', height: '1.0625rem', cursor: 'pointer', flex: '0 0 auto' },
  punkt: { width: '0.5rem', height: '0.5rem', borderRadius: '50%', flex: '0 0 auto' },
  leise: { color: 'var(--c-text-muted)', fontSize: '0.75rem' },
  ueberGruppe: {
    fontSize: '0.6875rem', color: 'var(--c-text-muted)', backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border)', padding: '0 0.375rem', borderRadius: '9999px',
    whiteSpace: 'nowrap',
  },
  tag: {
    marginLeft: 'auto', color: 'var(--c-text-muted)', fontSize: '0.75rem',
    whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums',
  },
  leer: { padding: '0.75rem', fontSize: '0.8125rem', color: 'var(--c-text-muted)' },
  hinweis: { margin: '0.375rem 0 0 0', fontSize: '0.75rem', color: 'var(--c-text-muted)' },
  fuss: { display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' },
  zurueck: {
    padding: '0.5rem 0.875rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 500,
    fontSize: '0.875rem', backgroundColor: 'transparent', color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
  },
  speichern: {
    padding: '0.5rem 1.25rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 500,
    fontSize: '0.875rem', backgroundColor: 'var(--c-accent)', color: 'var(--c-text-inverse)',
    border: 'none',
  },
};
