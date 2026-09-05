import React, { useState, useEffect } from 'react';
import { tasksApi } from '../../api/tasks';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { programApi, TaskGroup } from '../../api/program';
import client from '../../api/client';
import { BedarfBadge, hatBedarf } from './BedarfBadge';
import { zeitFeldProps } from '../../utils/zeitFeld';

interface Props {
  eventId: number;
  onClose: () => void;
  onSuccess: () => void;
  task?: any; // Für Edit-Modus
  eventInstances?: any[]; // Für Mitarbeiter-Zuweisung
  defaultDay?: number; // Vorausgewählter Tag beim Erstellen
}

interface User {
  id: number;
  name: string;
}

/** Leeres Feld heisst "keine Angabe", nicht "null". */
const zahl = (v: string | number | null | undefined): number | null =>
  v === '' || v === null || v === undefined ? null : Number(v);

export const TaskFormModal: React.FC<Props> = ({ eventId, onClose, onSuccess, task, eventInstances, defaultDay }) => {
  const isEdit = !!task;

  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    day_number: task?.day_number || defaultDay || 1,
    scheduled_time: task?.scheduled_time || '',
    start_time: task?.start_time || '',
    end_time: task?.end_time || '',
    reminder_minutes: task?.reminder_minutes || 15,
    is_public: task?.is_public || false,
    status: task?.status || 'not_started',
    series_id: task?.series_id || null,
    /*
     * Personalbedarf. Leerer String statt 0 - "keine Angabe" ist etwas
     * anderes als "null Personen noetig", und ein Feld, in dem schon eine 0
     * steht, laedt zum Uebersehen ein.
     */
    needed_staff: task?.needed_staff ?? '',
    needed_female: task?.needed_female ?? '',
    needed_male: task?.needed_male ?? '',
    auto_complete: task?.auto_complete || false,
    program_item_id: task?.program_item_id ?? null as number | null,
  });

  /*
   * Sanfter Hinweis, kein Riegel: wenn die Aufteilung nicht zur Gesamtzahl
   * passt, ist das oft Absicht ("4 Leute, davon mindestens 2 weiblich").
   * Gesagt wird es trotzdem, weil es genauso gut ein Tippfehler sein kann.
   */
  const bedarfWarnung = (() => {
    const gesamt = zahl(formData.needed_staff);
    const w = zahl(formData.needed_female) ?? 0;
    const m = zahl(formData.needed_male) ?? 0;
    if (gesamt === null || (w === 0 && m === 0)) return '';
    if (w + m > gesamt) return `Aufteilung ergibt ${w + m} - mehr als die angegebene Anzahl ${gesamt}.`;
    if (w + m < gesamt) return `Aufteilung ergibt ${w + m} von ${gesamt} - der Rest ist beliebig.`;
    return '';
  })();

  /*
   * Der Zeitpunkt, an dem sich die Aufgabe abhakt: Endzeit, sonst Startzeit,
   * sonst geplante Zeit. Ohne jede Zeitangabe gibt es keinen - dann muss das
   * im Formular stehen, sonst wartet man vergeblich.
   */
  const selbstHinweis = (() => {
    if (!formData.auto_complete) {
      return 'Wird zum Ende ihres Zeitfensters automatisch abgehakt.';
    }
    const zeit = formData.end_time || formData.start_time || formData.scheduled_time;
    const woher = formData.end_time ? 'Endzeit' : formData.start_time ? 'Startzeit' : 'geplanten Zeit';
    return zeit
      ? `Wird um ${String(zeit).slice(0, 5)} Uhr (${woher}) von selbst abgehakt.`
      : 'Ohne Zeitangabe passiert nichts – bitte eine Start-, End- oder geplante Zeit eintragen.';
  })();

  /** Bedarf als Zahlen - fuer dieselbe Plakette wie in der Aufgabenliste. */
  const bedarfWerte = {
    needed_staff: zahl(formData.needed_staff),
    needed_female: zahl(formData.needed_female),
    needed_male: zahl(formData.needed_male),
  };

  const [gefahrOffen, setGefahrOffen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showStaffSelection, setShowStaffSelection] = useState(false);
  const [taskSeries, setTaskSeries] = useState<TaskSeries[]>([]);

  /*
   * Aufgabengruppen der Veranstaltung. Angeboten werden nur die des
   * gewaehlten Tages - eine Gruppe gehoert zu genau einem Tag, und
   * "Fruehstueck" gibt es an jedem Tag einmal.
   */
  const [gruppen, setGruppen] = useState<TaskGroup[]>([]);
  const [neueGruppe, setNeueGruppe] = useState('');
  const [neueGruppeZeit, setNeueGruppeZeit] = useState('');
  const [gruppeNeuAnlegen, setGruppeNeuAnlegen] = useState(false);

  // Eine Gruppe gehoert zu genau einem Tag - beim Tageswechsel passt die
  // bisherige Auswahl womoeglich nicht mehr.
  const gruppenDesTages = gruppen.filter(g => g.day_number === Number(formData.day_number));


  useEffect(() => {
    // Lade Event Staff Pool und Task Series
    loadStaff();
    loadTaskSeries();
    loadGruppen();

    // Lade bestehende Zuweisungen im Edit-Modus
    if (isEdit && task?.id && eventInstances && eventInstances.length > 0) {
      loadExistingAssignments();
    }
  }, [eventId, isEdit]);

  const loadExistingAssignments = async () => {
    if (!task?.id || !eventInstances || eventInstances.length === 0) return;

    try {
      // Lade Zuweisungen für die erste Instanz (als Referenz)
      const response = await client.get(`/tasks/instance/${eventInstances[0].id}/assignments`);
      const assignments = response.data.filter((a: any) => a.id === task.id);

      // Extrahiere eindeutige User-IDs
      const userIds = new Set<number>();
      assignments.forEach((assignment: any) => {
        if (assignment.user_id) {
          userIds.add(assignment.user_id);
        }
      });

      /*
       * Zugeklappt lassen, auch wenn schon jemand eingeteilt ist - wie
       * viele es sind, steht als Plakette im Klappkopf. Frueher klappte der
       * Bereich auf und schob den Rest des Formulars nach unten.
       */
      setSelectedUserIds(Array.from(userIds));
    } catch (error) {
      console.error('Load existing assignments error:', error);
    }
  };

  const loadStaff = async () => {
    try {
      const response = await client.get(`/users/event/${eventId}/staff`);
      setStaffUsers(response.data);
    } catch (error) {
      console.error('Load staff error:', error);
    }
  };

  const loadGruppen = async () => {
    try {
      setGruppen(await programApi.getByEvent(eventId));
    } catch (error) {
      console.error('Load task groups error:', error);
    }
  };

  const loadTaskSeries = async () => {
    try {
      const series = await taskSeriesApi.getByEvent(eventId);
      setTaskSeries(series);
    } catch (error) {
      console.error('Load task series error:', error);
    }
  };

  const handleToggleUser = (userId: number) => {
    if (selectedUserIds.includes(userId)) {
      setSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      setSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      /*
       * Eine im Formular benannte Gruppe muss es geben, bevor die Aufgabe
       * darauf zeigen kann. Sie wird deshalb hier angelegt - und nur, wenn
       * wirklich ein Name dasteht.
       */
      let daten = formData;
      if (gruppeNeuAnlegen && neueGruppe.trim()) {
        const angelegt = await programApi.create({
          event_id: eventId,
          day_number: Number(formData.day_number),
          title: neueGruppe.trim(),
          time: neueGruppeZeit || null,
        });
        daten = { ...formData, program_item_id: angelegt.id };
      }

      if (isEdit) {
        await tasksApi.update(task.id, daten);

        // Aktualisiere Zuweisungen für alle Event-Instanzen (falls ausgewählt)
        if (eventInstances && eventInstances.length > 0) {
          for (const instance of eventInstances) {
            await tasksApi.assign({
              task_id: task.id,
              event_instance_id: instance.id,
              user_ids: selectedUserIds,
              reminder_minutes: formData.reminder_minutes,
            });
          }
        }
      } else {
        // Erstelle Task
        const newTask = await tasksApi.create({
          event_id: eventId,
          ...daten,
        });

        // Weise Mitarbeiter zu (falls ausgewählt und Instanzen vorhanden)
        if (selectedUserIds.length > 0 && eventInstances && eventInstances.length > 0) {
          // Weise für alle Event-Instanzen zu
          for (const instance of eventInstances) {
            await tasksApi.assign({
              task_id: newTask.id,
              event_instance_id: instance.id,
              user_ids: selectedUserIds,
              reminder_minutes: formData.reminder_minutes,
            });
          }
        }
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Möchten Sie die Aufgabe "${formData.title}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) {
      return;
    }

    setDeleting(true);
    setError('');

    try {
      await tasksApi.delete(task.id);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Löschen');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleActive = async () => {
    const isCurrentlyActive = task.is_active !== false;
    const action = isCurrentlyActive ? 'deaktivieren' : 'aktivieren';

    if (!window.confirm(`Möchten Sie die Aufgabe "${formData.title}" wirklich ${action}?`)) {
      return;
    }

    try {
      // Der Server kennt zwei eigene Routen, kein Feld "active".
      if (isCurrentlyActive) await tasksApi.deactivate(task.id);
      else await tasksApi.activate(task.id);
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || `Fehler beim ${action.charAt(0).toUpperCase() + action.slice(1)}`);
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="app-modal" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>{isEdit ? 'Aufgabe bearbeiten' : 'Neue Aufgabe'}</h2>

        <form onSubmit={handleSubmit}>
          {error && <div style={styles.error}>{error}</div>}

          <div style={styles.formGroup}>
            <label style={styles.label}>Titel *</label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Beschreibung</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              style={styles.textarea}
              rows={3}
            />
          </div>

          <div style={styles.trenner} />

          {/* Alles zum "wann" in einer Zeile. */}
          <div style={styles.row}>
            <div style={{ ...styles.formGroup, flex: '0 0 5rem' }}>
              <label style={styles.label}>Tag *</label>
              <input
                type="number"
                min="1"
                value={formData.day_number}
                onChange={(e) => setFormData({ ...formData, day_number: parseInt(e.target.value) })}
                style={styles.input}
                required
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Startzeit</label>
              <input
                type="time"
                {...zeitFeldProps}
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Endzeit</label>
              <input
                type="time"
                {...zeitFeldProps}
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          {/*
            Die geplante Zeit greift nur, wenn weder Start- noch Endzeit
            steht. Sonst stuende hier ein Feld, das nichts tut.
          */}
          {!formData.start_time && !formData.end_time && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Geplante Zeit</label>
              <input
                type="time"
                {...zeitFeldProps}
                value={formData.scheduled_time}
                onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
                style={styles.input}
              />
              <small style={styles.hint}>
                Wird für Benachrichtigungen verwendet, wenn keine Startzeit angegeben ist
              </small>
            </div>
          )}

          <div style={styles.trenner} />

          {/*
            Einsortierung: Aufgabengruppe (die Zwischenueberschrift, unter
            der die Aufgabe steht - nur Gruppen des gewaehlten Tages, denn
            eine Gruppe gehoert zu genau einem Tag) und Serie.
          */}
          <div style={styles.row}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Aufgabengruppe</label>
              <select
                value={formData.program_item_id === null ? '' : String(formData.program_item_id)}
                onChange={(e) => {
                  const v = e.target.value;
                  setFormData({ ...formData, program_item_id: v === '' || v === 'neu' ? null : parseInt(v) });
                  setGruppeNeuAnlegen(v === 'neu');
                }}
                style={styles.input}
              >
                <option value="">Keine Gruppe</option>
                {gruppenDesTages.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}{g.time ? ` · ${String(g.time).slice(0, 5)} Uhr` : ''}
                  </option>
                ))}
                <option value="neu">＋ Neue Gruppe anlegen…</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Serie</label>
              <select
                value={formData.series_id || ''}
                onChange={(e) => setFormData({ ...formData, series_id: e.target.value ? parseInt(e.target.value) : null })}
                style={styles.input}
              >
                <option value="">Keine Serie</option>
                {taskSeries.map((series) => (
                  <option key={series.id} value={series.id}>
                    {series.name} ({series.member_count || 0} Mitglieder)
                  </option>
                ))}
              </select>
            </div>
          </div>

          {gruppeNeuAnlegen && (
            <div style={styles.bedarfZeile}>
              <label style={{ ...styles.bedarfFeld, flex: '2 1 10rem' }}>
                <span style={styles.bedarfLabel}>Name der Gruppe</span>
                <input
                  type="text"
                  value={neueGruppe}
                  onChange={(e) => setNeueGruppe(e.target.value)}
                  placeholder="z. B. Frühstück"
                  style={styles.bedarfInput}
                />
              </label>
              <label style={styles.bedarfFeld}>
                <span style={styles.bedarfLabel}>Uhrzeit (optional)</span>
                <input
                  type="time"
                  {...zeitFeldProps}
                  value={neueGruppeZeit}
                  onChange={(e) => setNeueGruppeZeit(e.target.value)}
                  style={styles.bedarfInput}
                />
              </label>
            </div>
          )}

          <p style={styles.bedarfHinweis}>
            Zwischenüberschrift für zusammengehörende Aufgaben.
          </p>

          <div style={styles.trenner} />

          {/*
            Personalbedarf. Reine Planungshilfe: beim Einteilen sieht man,
            wie viele es braucht. Nichts davon wird erzwungen - mehr oder
            weniger Leute sind in Ordnung.

            Die Aufteilung steht an der AUFGABE. In den Profilen wird kein
            Geschlecht gefuehrt, die App kann also nicht nachrechnen, ob sie
            aufgeht - sie ist ein Hinweis fuer den, der einteilt.
          */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Benötigte Mitarbeiter (optional)</label>
            <div style={styles.bedarfZeile}>
              <label style={styles.bedarfFeld}>
                <span style={styles.bedarfLabel}>Anzahl</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="–"
                  value={formData.needed_staff}
                  onChange={(e) => setFormData({ ...formData, needed_staff: e.target.value })}
                  style={styles.bedarfInput}
                />
              </label>
              <label style={styles.bedarfFeld}>
                <span style={styles.bedarfLabel}>davon weiblich</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="–"
                  value={formData.needed_female}
                  onChange={(e) => setFormData({ ...formData, needed_female: e.target.value })}
                  style={styles.bedarfInput}
                />
              </label>
              <label style={styles.bedarfFeld}>
                <span style={styles.bedarfLabel}>davon männlich</span>
                <input
                  type="number"
                  min="0"
                  inputMode="numeric"
                  placeholder="–"
                  value={formData.needed_male}
                  onChange={(e) => setFormData({ ...formData, needed_male: e.target.value })}
                  style={styles.bedarfInput}
                />
              </label>
            </div>
            <p style={styles.bedarfHinweis}>
              Nur ein Anhaltspunkt beim Einteilen – mehr oder weniger sind in Ordnung.
              {bedarfWarnung && <><br /><span style={styles.bedarfWarnung}>{bedarfWarnung}</span></>}
            </p>
          </div>

          {/*
            Mitarbeiter-Auswahl. Zugeklappt eine Flaeche mit Rahmen und
            Pfeil - als Bedienelement lesbar und nicht als Ueberschrift -,
            mit derselben Plakette wie in der Aufgabenliste.
          */}
          {staffUsers.length > 0 && (
            <div style={styles.formGroup}>
              <button
                type="button"
                onClick={() => setShowStaffSelection(!showStaffSelection)}
                style={{
                  ...styles.klappKopf,
                  borderRadius: showStaffSelection ? '6px 6px 0 0' : '6px',
                }}
              >
                <span style={styles.klappPfeil}>{showStaffSelection ? '▾' : '▸'}</span>
                <span style={styles.klappTitel}>
                  {isEdit ? 'Mitarbeiter zuweisen' : 'Direkt Mitarbeiter zuweisen'}
                </span>
                {hatBedarf(bedarfWerte)
                  ? <BedarfBadge task={bedarfWerte} zugewiesen={selectedUserIds.length} />
                  : selectedUserIds.length > 0 && (
                      <span style={styles.zahlBadge}>{selectedUserIds.length} zugewiesen</span>
                    )}
                <span style={styles.klappRechts}>{showStaffSelection ? 'Fertig' : 'Ändern'}</span>
              </button>

              {showStaffSelection && (
                <div style={styles.staffList}>
                  {!isEdit && (
                    <small style={styles.hint}>
                      Ausgewählte Mitarbeiter werden automatisch für alle Durchführungen zugewiesen
                    </small>
                  )}
                  {staffUsers.map((user) => (
                    <label key={user.id} style={styles.staffItem}>
                      <input
                        type="checkbox"
                        checked={selectedUserIds.includes(user.id)}
                        onChange={() => handleToggleUser(user.id)}
                        style={styles.checkbox}
                      />
                      <span>{user.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          <div style={styles.trenner} />

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.is_public}
                onChange={(e) => setFormData({ ...formData, is_public: e.target.checked })}
                style={styles.checkbox}
              />
              <span>Öffentliche Aufgabe (für alle Mitarbeiter sichtbar)</span>
            </label>
          </div>

          {/*
            Aufgaben, die mit ihrem Zeitpunkt erledigt sind - "Nachtruhe",
            "Bus faehrt". Da drueckt niemand einen Knopf. Erinnert wird
            trotzdem ganz normal vorher; nur die Meldung ueber das Abhaken
            und die Ueberfaellig-Meldung entfallen.
          */}
          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.auto_complete}
                onChange={(e) => setFormData({ ...formData, auto_complete: e.target.checked })}
                style={styles.checkbox}
              />
              <span>Erledigt sich von selbst</span>
            </label>
            <p style={styles.bedarfHinweis}>
              {selbstHinweis}
            </p>
          </div>

          <div style={styles.row}>
            {isEdit && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  style={styles.input}
                >
                  <option value="not_started">Nicht gestartet</option>
                  <option value="in_progress">In Arbeit</option>
                  <option value="completed">Erledigt</option>
                  <option value="overdue">Überfällig</option>
                </select>
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.label}>Erinnerung (Minuten vorher)</label>
              <input
                type="number"
                min="0"
                value={formData.reminder_minutes}
                onChange={(e) => setFormData({ ...formData, reminder_minutes: parseInt(e.target.value) })}
                style={styles.input}
              />
              <small style={styles.hint}>0 = keine Erinnerung</small>
            </div>
          </div>

          {isEdit && (
            <>
              <div style={styles.trenner} />
              <div>
                <button
                  type="button"
                  onClick={() => setGefahrOffen(!gefahrOffen)}
                  style={{
                    ...styles.klappKopf,
                    ...styles.klappKopfGefahr,
                    borderRadius: gefahrOffen ? '6px 6px 0 0' : '6px',
                  }}
                >
                  <span style={styles.klappPfeil}>{gefahrOffen ? '▾' : '▸'}</span>
                  <span style={styles.klappTitel}>Gefahrenbereich</span>
                  <span style={styles.klappRechts}>Deaktivieren, Löschen</span>
                </button>

                {gefahrOffen && (
                  <div style={styles.dangerZone}>
                    <div style={styles.dangerZoneKnoepfe}>
                      <button
                        type="button"
                        onClick={handleToggleActive}
                        style={{
                          ...styles.deleteButton,
                          backgroundColor: task.is_active === false ? 'var(--c-success)' : 'var(--c-warning)',
                        }}
                      >
                        {task.is_active === false ? 'Aktivieren' : 'Deaktivieren'}
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        style={styles.deleteButton}
                        disabled={deleting}
                      >
                        {deleting ? 'Löschen...' : 'Löschen'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="app-modal-actions" style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Abbrechen
            </button>
            <button type="submit" style={styles.submitButton} disabled={loading}>
              {loading ? 'Speichern...' : isEdit ? 'Aktualisieren' : 'Erstellen'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'var(--c-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem',
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    padding: '2rem',
    borderRadius: '8px',
    border: '1px solid var(--c-border-strong)',
    width: '100%',
    maxWidth: '600px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    margin: '0 0 1.5rem 0',
    color: 'var(--c-text)',
  },
  formGroup: {
    marginBottom: '1rem',
    flex: 1,
  },
  row: {
    display: 'flex',
    gap: '1rem',
  },
  bedarfZeile: {
    display: 'flex',
    gap: '0.75rem',
    flexWrap: 'wrap',
    marginTop: '0.375rem',
  },
  bedarfFeld: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    flex: '1 1 6rem',
    minWidth: '5.5rem',
  },
  bedarfLabel: {
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  bedarfInput: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '0.9375rem',
    fontFamily: 'inherit',
  },
  bedarfHinweis: {
    margin: '0.5rem 0 0 0',
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  bedarfWarnung: {
    color: 'var(--c-warning-strong)',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    fontSize: '0.875rem',
    color: 'var(--c-text)',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    color: 'var(--c-text)',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'inherit',
    color: 'var(--c-text)',
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: 'var(--c-text-muted)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    color: 'var(--c-text)',
  },
  checkbox: {
    width: '1.25rem',
    height: '1.25rem',
    cursor: 'pointer',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    borderRadius: '4px',
    fontSize: '0.875rem',
    marginBottom: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  trenner: {
    height: '1px',
    backgroundColor: 'var(--c-border)',
    margin: '1.25rem 0',
  },
  /*
   * Aufklappbare Bereiche. Rahmen und Flaeche, damit die Zeile als
   * Bedienelement lesbar ist - eine blosse Ueberschrift mit Knopf daneben
   * sah aus wie eine Ueberschrift.
   *
   * justifyContent ausdruecklich: global steht auf button eine Zentrierung.
   */
  klappKopf: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: '0.625rem',
    width: '100%',
    padding: '0.625rem 0.75rem',
    textAlign: 'left' as const,
    fontSize: '0.875rem',
    color: 'var(--c-text)',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border-strong)',
    cursor: 'pointer',
  },
  klappKopfGefahr: {
    backgroundColor: 'var(--c-danger-soft)',
    borderColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
  },
  klappPfeil: {
    fontSize: '0.75rem',
    opacity: 0.7,
  },
  klappTitel: {
    fontWeight: 500,
  },
  klappRechts: {
    marginLeft: 'auto',
    fontSize: '0.8125rem',
    opacity: 0.8,
  },
  /** Ohne hinterlegten Bedarf gibt es nur die nackte Zahl. */
  zahlBadge: {
    padding: '0.125rem 0.5rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    fontWeight: 600,
    color: 'var(--c-text-muted)',
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    whiteSpace: 'nowrap' as const,
  },
  dangerZone: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger-soft)',
    border: '1px solid var(--c-danger-soft)',
    borderTop: 'none',
    borderRadius: '0 0 6px 6px',
  },
  // Knapp gehalten: Überschrift, darunter die beiden Knöpfe nebeneinander.
  // Ein Warnsatz stand hier auch mal - er stimmte nur fürs Löschen,
  // deaktivieren lässt sich jederzeit zurücknehmen.
  dangerZoneKnoepfe: {
    display: 'flex',
    gap: '0.5rem',
    flexWrap: 'wrap' as const,
  },
  deleteButton: {
    flex: '1 1 8rem',
    padding: '0.5rem 0.75rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  },
  // Haengt unter dem Klappkopf, deshalb oben ohne Rahmen und ohne Radius.
  staffList: {
    border: '1px solid var(--c-border-strong)',
    borderTop: 'none',
    borderRadius: '0 0 6px 6px',
    padding: '0.75rem',
    backgroundColor: 'var(--c-surface)',
    maxHeight: '220px',
    overflowY: 'auto',
  },
  staffItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem',
    cursor: 'pointer',
    borderRadius: '4px',
    color: 'var(--c-text)',
  },
};
