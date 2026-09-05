import React, { useEffect, useState } from 'react';
import { programApi, TaskGroup } from '../../api/program';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import client from '../../api/client';
import { GRUPPEN_FARBEN } from '../../utils/gruppenFarben';
import { zeitFeldProps } from '../../utils/zeitFeld';

/*
 * Aufgabengruppe bearbeiten.
 *
 * Alles an einer Stelle: Name, Uhrzeit, Tag, Farbe, Serie - und welche
 * Aufgaben dazugehören. Angeboten werden nur die Aufgaben des Tages, an dem
 * die Gruppe steht; eine Aufgabe von Tag 3 unter einer Überschrift von
 * Tag 1 wäre in keiner Ansicht zu finden.
 *
 * Eine Gruppe ohne Aufgaben ist ausdrücklich erlaubt - so entsteht eine
 * reine Zwischenüberschrift, die den Tagesablauf gliedert.
 */

interface Aufgabe {
  id: number;
  title: string;
  day_number: number;
  start_time?: string | null;
  scheduled_time?: string | null;
  end_time?: string | null;
  program_item_id?: number | null;
}

interface Props {
  gruppe: TaskGroup;
  eventId: number;
  eventDays: number;
  onClose: () => void;
  onGespeichert: () => void;
}

const hhmm = (wert?: string | null) => (wert ? String(wert).slice(0, 5) : '');

export const GruppeBearbeitenModal: React.FC<Props> = ({
  gruppe, eventId, eventDays, onClose, onGespeichert,
}) => {
  const [titel, setTitel] = useState(gruppe.title);
  const [zeit, setZeit] = useState(hhmm(gruppe.time));
  const [tag, setTag] = useState(gruppe.day_number);
  const [farbe, setFarbe] = useState<string | null>(gruppe.color ?? null);
  const [serie, setSerie] = useState<number | null>(gruppe.series_id ?? null);

  const [aufgaben, setAufgaben] = useState<Aufgabe[]>([]);
  const [gewaehlt, setGewaehlt] = useState<number[]>([]);
  const [serien, setSerien] = useState<TaskSeries[]>([]);

  const [laedt, setLaedt] = useState(true);
  const [speichert, setSpeichert] = useState(false);
  const [fehler, setFehler] = useState('');
  const [dupOffen, setDupOffen] = useState(false);
  const [dupTag, setDupTag] = useState(gruppe.day_number);
  const [dupAufgaben, setDupAufgaben] = useState(true);
  const [dupZuweisungen, setDupZuweisungen] = useState(false);

  useEffect(() => {
    let abgebrochen = false;
    (async () => {
      try {
        const [alle, s] = await Promise.all([
          client.get(`/tasks/event/${eventId}`),
          taskSeriesApi.getByEvent(eventId).catch(() => [] as TaskSeries[]),
        ]);
        if (abgebrochen) return;
        setAufgaben(alle.data as Aufgabe[]);
        setGewaehlt((alle.data as Aufgabe[])
          .filter((a) => a.program_item_id === gruppe.id).map((a) => a.id));
        setSerien(s);
      } catch {
        if (!abgebrochen) setFehler('Aufgaben konnten nicht geladen werden');
      } finally {
        if (!abgebrochen) setLaedt(false);
      }
    })();
    return () => { abgebrochen = true; };
  }, [eventId, gruppe.id]);

  /*
   * Beim Tageswechsel wird die Auswahl leer: die bisherigen Aufgaben
   * gehören zum alten Tag. Sie ziehen beim Speichern mit um (das macht der
   * Server), tauchen aber in der Liste des neuen Tages erst danach auf.
   */
  const desTages = aufgaben.filter((a) => a.day_number === tag);

  const umschalten = (id: number) =>
    setGewaehlt((v) => (v.includes(id) ? v.filter((x) => x !== id) : [...v, id]));

  const speichern = async () => {
    if (!titel.trim()) { setFehler('Name fehlt'); return; }
    setSpeichert(true);
    setFehler('');
    try {
      await programApi.update(gruppe.id, {
        title: titel.trim(),
        time: zeit || null,
        day_number: tag,
        color: farbe,
        series_id: serie,
      });
      // Nur Aufgaben des Tages, an dem die Gruppe jetzt steht.
      const erlaubt = desTages.filter((a) => gewaehlt.includes(a.id)).map((a) => a.id);
      await programApi.setzeAufgaben(gruppe.id, erlaubt);
      onGespeichert();
      onClose();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Speichern fehlgeschlagen');
      setSpeichert(false);
    }
  };

  const entfernen = async () => {
    const anzahl = gewaehlt.length;
    const frage = anzahl > 0
      ? `Gruppe „${gruppe.title}" entfernen? Die ${anzahl} ${anzahl === 1 ? 'Aufgabe bleibt' : 'Aufgaben bleiben'} erhalten und stehen danach frei im Tag.`
      : `Gruppe „${gruppe.title}" entfernen?`;
    if (!window.confirm(frage)) return;
    try {
      await programApi.delete(gruppe.id);
      onGespeichert();
      onClose();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Entfernen fehlgeschlagen');
    }
  };

  const duplizieren = async () => {
    setSpeichert(true);
    try {
      await programApi.duplizieren(gruppe.id, {
        day_number: dupTag,
        mit_aufgaben: dupAufgaben,
        mit_zuweisungen: dupZuweisungen,
      });
      onGespeichert();
      onClose();
    } catch (e: any) {
      setFehler(e.response?.data?.error || 'Duplizieren fehlgeschlagen');
      setSpeichert(false);
    }
  };

  const tage = Array.from({ length: Math.max(1, eventDays) }, (_, i) => i + 1);

  return (
    <div className="app-modal-overlay" style={stil.overlay} onClick={onClose}>
      <div className="app-modal" style={stil.modal} onClick={(e) => e.stopPropagation()}>
        <div style={stil.kopf}>
          <h2 style={stil.titel}>{dupOffen ? `„${gruppe.title}" duplizieren` : 'Gruppe bearbeiten'}</h2>
          <button type="button" onClick={onClose} style={stil.schliessen}>✕</button>
        </div>

        {fehler && <div style={stil.fehler}>{fehler}</div>}

        {dupOffen ? (
          <>
            <div style={stil.feld}>
              <label style={stil.label}>Auf welchen Tag?</label>
              <select value={dupTag} onChange={(e) => setDupTag(Number(e.target.value))} style={stil.eingabe}>
                {tage.map((t) => <option key={t} value={t}>Tag {t}</option>)}
              </select>
            </div>

            <label style={stil.hakenZeile}>
              <input type="checkbox" checked={dupAufgaben}
                onChange={(e) => setDupAufgaben(e.target.checked)} style={stil.haken} />
              <span>Aufgaben mitkopieren <span style={stil.leise}>({gewaehlt.length})</span></span>
            </label>
            <label style={stil.hakenZeile}>
              <input type="checkbox" checked={dupZuweisungen}
                onChange={(e) => setDupZuweisungen(e.target.checked)} style={stil.haken} />
              <span>Zuweisungen mitkopieren</span>
            </label>

            <p style={stil.hinweis}>
              Die Kopie ist eigenständig: spätere Änderungen an der einen wirken sich nicht auf die
              andere aus. Kopierte Aufgaben starten auf „nicht gestartet“.
            </p>

            <div style={stil.fuss}>
              <button type="button" onClick={() => setDupOffen(false)} style={stil.zurueck}>Zurück</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={duplizieren} disabled={speichert} style={stil.speichern}>
                {speichert ? 'Kopiere…' : 'Duplizieren'}
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={stil.zeile}>
              <div style={{ ...stil.feld, flex: 2 }}>
                <label style={stil.label}>Name</label>
                <input type="text" value={titel} onChange={(e) => setTitel(e.target.value)}
                  style={stil.eingabe} autoFocus />
              </div>
              <div style={stil.feld}>
                <label style={stil.label}>Uhrzeit (optional)</label>
                <input type="time" {...zeitFeldProps} value={zeit}
                  onChange={(e) => setZeit(e.target.value)} style={stil.eingabe} />
              </div>
              <div style={{ ...stil.feld, flex: '0 0 5.5rem' }}>
                <label style={stil.label}>Tag</label>
                <select value={tag} onChange={(e) => setTag(Number(e.target.value))} style={stil.eingabe}>
                  {tage.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div style={stil.feld}>
              <label style={stil.label}>Farbe</label>
              <div style={stil.farbReihe}>
                <button type="button" onClick={() => setFarbe(null)} title="Keine Farbe"
                  style={{ ...stil.farbKnopf, ...stil.farbLeer, ...(farbe === null ? stil.farbAktiv : {}) }}>∅</button>
                {GRUPPEN_FARBEN.map((f) => (
                  <button key={f.name} type="button" onClick={() => setFarbe(f.name)} title={f.anzeige}
                    style={{
                      ...stil.farbKnopf,
                      backgroundColor: f.kraeftig,
                      ...(farbe === f.name ? stil.farbAktiv : {}),
                    }} />
                ))}
              </div>
            </div>

            <div style={stil.feld}>
              <label style={stil.label}>Serie (optional)</label>
              <select value={serie ?? ''} onChange={(e) => setSerie(e.target.value ? Number(e.target.value) : null)}
                style={stil.eingabe}>
                <option value="">Keine Serie</option>
                {serien.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.member_count || 0} Mitglieder)</option>
                ))}
              </select>
              <p style={stil.hinweis}>
                Alle Aufgaben der Gruppe gehören damit zur Serie – neu hinzugefügte auch.
                Trägt eine Aufgabe eine eigene Serie, gilt ihre.
              </p>
            </div>

            <div style={stil.liste}>
              <div style={stil.listeKopf}>Aufgaben an Tag {tag}</div>
              {laedt ? (
                <div style={stil.leer}>Lade…</div>
              ) : desTages.length === 0 ? (
                <div style={stil.leer}>An diesem Tag gibt es noch keine Aufgaben.</div>
              ) : desTages.map((a) => {
                const fremd = a.program_item_id && a.program_item_id !== gruppe.id;
                return (
                  <label key={a.id} style={stil.listeZeile}>
                    <input type="checkbox" checked={gewaehlt.includes(a.id)}
                      onChange={() => umschalten(a.id)} style={stil.haken} />
                    <span>{a.title}</span>
                    {fremd && <span style={stil.fremd}>andere Gruppe</span>}
                    <span style={stil.zeit}>
                      {hhmm(a.start_time || a.scheduled_time || a.end_time)}
                    </span>
                  </label>
                );
              })}
            </div>
            <p style={stil.hinweis}>
              Ein Haken bei einer Aufgabe, die schon in einer anderen Gruppe steht, holt sie dort heraus.
            </p>

            <div style={stil.fuss}>
              <button type="button" onClick={entfernen} style={stil.entfernen}>Entfernen</button>
              <button type="button" onClick={() => setDupOffen(true)} style={stil.zurueck}>Duplizieren</button>
              <div style={{ flex: 1 }} />
              <button type="button" onClick={onClose} style={stil.zurueck}>Abbrechen</button>
              <button type="button" onClick={speichern} disabled={speichert} style={stil.speichern}>
                {speichert ? 'Speichert…' : 'Speichern'}
              </button>
            </div>
          </>
        )}
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
  feld: { flex: 1, marginBottom: '0.875rem' },
  label: {
    display: 'block', marginBottom: '0.375rem', fontWeight: 500,
    fontSize: '0.8125rem', color: 'var(--c-text)',
  },
  eingabe: {
    width: '100%', padding: '0.5rem', border: '1px solid var(--c-border-strong)',
    borderRadius: '4px', fontSize: '0.9375rem', color: 'var(--c-text)',
    backgroundColor: 'var(--c-surface)',
  },
  farbReihe: { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' },
  farbKnopf: {
    width: '1.75rem', height: '1.75rem', minHeight: '1.75rem', padding: 0,
    borderRadius: '50%', border: '2px solid transparent', cursor: 'pointer',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  farbLeer: {
    backgroundColor: 'var(--c-surface)', border: '1px dashed var(--c-border-strong)',
    color: 'var(--c-text-subtle)', fontSize: '0.875rem',
  },
  farbAktiv: { border: '2px solid var(--c-text)', boxShadow: '0 0 0 2px var(--c-surface) inset' },
  liste: {
    border: '1px solid var(--c-border-strong)', borderRadius: '6px',
    maxHeight: '230px', overflowY: 'auto',
  },
  listeKopf: {
    padding: '0.4375rem 0.625rem', backgroundColor: 'var(--c-surface-muted)',
    borderBottom: '1px solid var(--c-border)', fontSize: '0.8125rem', fontWeight: 600,
    color: 'var(--c-text)', position: 'sticky', top: 0,
  },
  listeZeile: {
    display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.4375rem 0.625rem',
    fontSize: '0.875rem', color: 'var(--c-text)', borderBottom: '1px solid var(--c-border)',
    cursor: 'pointer',
  },
  haken: { width: '1.0625rem', height: '1.0625rem', cursor: 'pointer', flex: '0 0 auto' },
  hakenZeile: {
    display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.25rem 0',
    fontSize: '0.875rem', color: 'var(--c-text)', cursor: 'pointer',
  },
  fremd: {
    fontSize: '0.6875rem', color: 'var(--c-warning-strong)', backgroundColor: 'var(--c-warning-soft)',
    padding: '0 0.375rem', borderRadius: '9999px', whiteSpace: 'nowrap',
  },
  zeit: {
    marginLeft: 'auto', color: 'var(--c-text-muted)', fontSize: '0.75rem',
    fontVariantNumeric: 'tabular-nums',
  },
  leer: { padding: '0.75rem', fontSize: '0.8125rem', color: 'var(--c-text-muted)' },
  hinweis: { margin: '0.375rem 0 0 0', fontSize: '0.75rem', color: 'var(--c-text-muted)' },
  leise: { color: 'var(--c-text-muted)' },
  fuss: { display: 'flex', gap: '0.5rem', marginTop: '1.25rem', flexWrap: 'wrap' },
  entfernen: {
    padding: '0.5rem 0.875rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 500,
    fontSize: '0.875rem', backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)', border: '1px solid var(--c-danger-soft)',
  },
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
