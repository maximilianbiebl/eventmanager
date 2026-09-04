import React, { useState, useEffect } from 'react';
import { tasksApi } from '../../api/tasks';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
import { programApi, TaskGroup } from '../../api/program';
import client from '../../api/client';

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
    const zahl = (v: string | number) => (v === '' || v === null ? null : Number(v));
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
      return 'Wird zur Endzeit automatisch abgehakt, ohne Erinnerung und ohne Meldung.';
    }
    const zeit = formData.end_time || formData.start_time || formData.scheduled_time;
    const woher = formData.end_time ? 'Endzeit' : formData.start_time ? 'Startzeit' : 'geplanten Zeit';
    return zeit
      ? `Wird um ${String(zeit).slice(0, 5)} Uhr (${woher}) von selbst abgehakt. Keine Erinnerung, keine Meldung, nie überfällig.`
      : 'Ohne Zeitangabe passiert nichts – bitte eine Start-, End- oder geplante Zeit eintragen.';
  })();

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

      setSelectedUserIds(Array.from(userIds));
      if (userIds.size > 0) {
        setShowStaffSelection(true);
      }
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
      await client.patch(`/tasks/${task.id}/active`, {
        is_active: !isCurrentlyActive
      });
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

          <div style={styles.row}>
            <div style={styles.formGroup}>
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
          </div>

          {/*
            Aufgabengruppe - die Zwischenueberschrift, unter der die Aufgabe
            steht. Nur Gruppen des gewaehlten Tages, denn eine Gruppe gehoert
            zu genau einem Tag.
          */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Aufgabengruppe (optional)</label>
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
                    value={neueGruppeZeit}
                    onChange={(e) => setNeueGruppeZeit(e.target.value)}
                    style={styles.bedarfInput}
                  />
                </label>
              </div>
            )}

            <div style={{fontSize: '0.875rem', color: 'var(--c-text-muted)', marginTop: '0.25rem'}}>
              Gruppen fassen Aufgaben zusammen, die zusammengehören – etwa „Frühstück“
              mit Essensausgabe und Tische wischen.
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Serie (optional)</label>
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
            <div style={{fontSize: '0.875rem', color: 'var(--c-text-muted)', marginTop: '0.25rem'}}>
              Aufgaben einer Serie können gemeinsam einem Team zugewiesen werden
            </div>
          </div>

          <div style={styles.row}>
            <div style={styles.formGroup}>
              <label style={styles.label}>Startzeit (optional)</label>
              <input
                type="time"
                value={formData.start_time}
                onChange={(e) => setFormData({ ...formData, start_time: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Endzeit (optional)</label>
              <input
                type="time"
                value={formData.end_time}
                onChange={(e) => setFormData({ ...formData, end_time: e.target.value })}
                style={styles.input}
              />
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Geplante Zeit (falls keine Start-/Endzeit)
            </label>
            <input
              type="time"
              value={formData.scheduled_time}
              onChange={(e) => setFormData({ ...formData, scheduled_time: e.target.value })}
              style={styles.input}
            />
            <small style={styles.hint}>
              Wird für Benachrichtigungen verwendet, wenn keine Startzeit angegeben
            </small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Erinnerung (Minuten vorher)</label>
            <input
              type="number"
              min="0"
              value={formData.reminder_minutes}
              onChange={(e) => setFormData({ ...formData, reminder_minutes: parseInt(e.target.value) })}
              style={styles.input}
            />
          </div>

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
            "Bus faehrt". Da drueckt niemand einen Knopf, und eine
            Erinnerung dazu waere nur Laerm.
          */}
          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={formData.auto_complete}
                onChange={(e) => setFormData({ ...formData, auto_complete: e.target.checked })}
                style={styles.checkbox}
              />
              <span>Erledigt sich von selbst (keine Benachrichtigungen)</span>
            </label>
            <p style={styles.bedarfHinweis}>
              {selbstHinweis}
            </p>
          </div>

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

          {/* Mitarbeiter-Auswahl */}
          {staffUsers.length > 0 && (
            <div style={styles.formGroup}>
              <div style={styles.staffHeader}>
                <label style={styles.label}>
                  {isEdit ? 'Mitarbeiter-Zuweisungen bearbeiten' : 'Direkt Mitarbeiter zuweisen (optional)'}
                </label>
                <button
                  type="button"
                  onClick={() => setShowStaffSelection(!showStaffSelection)}
                  style={styles.toggleButton}
                >
                  {showStaffSelection ? 'Ausblenden' : 'Mitarbeiter auswählen'}
                </button>
              </div>

              {showStaffSelection && (
                <div style={styles.staffList}>
                  <small style={styles.hint}>
                    {isEdit
                      ? 'Änderungen gelten für alle Durchführungen dieser Aufgabe'
                      : 'Ausgewählte Mitarbeiter werden automatisch für alle Durchführungen zugewiesen'}
                  </small>
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
                  {selectedUserIds.length > 0 && (
                    <div style={styles.selectedCount}>
                      {selectedUserIds.length} Mitarbeiter ausgewählt
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {isEdit && (
            <div style={styles.dangerZone}>
              <h3 style={styles.dangerZoneTitle}>Gefahrenbereich</h3>
              <button
                type="button"
                onClick={handleToggleActive}
                style={{
                  ...styles.deleteButton,
                  backgroundColor: task.is_active === false ? 'var(--c-success)' : 'var(--c-warning)',
                  marginBottom: '0.75rem'
                }}
              >
                {task.is_active === false ? 'Aufgabe aktivieren' : 'Aufgabe deaktivieren'}
              </button>
              <button
                type="button"
                onClick={handleDelete}
                style={styles.deleteButton}
                disabled={deleting}
              >
                {deleting ? 'Löschen...' : 'Aufgabe löschen'}
              </button>
              <p style={styles.dangerZoneWarning}>
                Diese Aktionen können nicht rückgängig gemacht werden.
              </p>
            </div>
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
  dangerZone: {
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: 'var(--c-danger-soft)',
    border: '1px solid var(--c-danger-soft)',
    borderRadius: '8px',
  },
  dangerZoneTitle: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: 'var(--c-danger-strong)',
    marginBottom: '0.5rem',
    marginTop: 0,
  },
  dangerZoneWarning: {
    fontSize: '0.75rem',
    color: 'var(--c-danger-strong)',
    marginTop: '0.5rem',
    marginBottom: 0,
  },
  deleteButton: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  },
  staffHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem',
  },
  toggleButton: {
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  staffList: {
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    padding: '1rem',
    backgroundColor: 'var(--c-surface-muted)',
    maxHeight: '200px',
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
  selectedCount: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    borderRadius: '4px',
    fontSize: '0.875rem',
    fontWeight: '500',
    textAlign: 'center',
  },
};
