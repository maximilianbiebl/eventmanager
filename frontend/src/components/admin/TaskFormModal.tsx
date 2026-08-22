import React, { useState, useEffect } from 'react';
import { tasksApi } from '../../api/tasks';
import { taskSeriesApi, TaskSeries } from '../../api/taskSeries';
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
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [staffUsers, setStaffUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [showStaffSelection, setShowStaffSelection] = useState(false);
  const [taskSeries, setTaskSeries] = useState<TaskSeries[]>([]);

  useEffect(() => {
    // Lade Event Staff Pool und Task Series
    loadStaff();
    loadTaskSeries();

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
      if (isEdit) {
        await tasksApi.update(task.id, formData);

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
          ...formData,
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
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
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
            <div style={{fontSize: '0.875rem', color: '#6b7280', marginTop: '0.25rem'}}>
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
                  backgroundColor: task.is_active === false ? '#059669' : '#D97706',
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

          <div style={styles.actions}>
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem',
  },
  modal: {
    backgroundColor: '#FFFFFF',
    padding: '2rem',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
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
    color: '#1E293B',
  },
  formGroup: {
    marginBottom: '1rem',
    flex: 1,
  },
  row: {
    display: 'flex',
    gap: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    fontSize: '0.875rem',
    color: '#1E293B',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    fontSize: '1rem',
    color: '#1E293B',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'inherit',
    color: '#1E293B',
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#64748B',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    color: '#1E293B',
  },
  checkbox: {
    width: '1.25rem',
    height: '1.25rem',
    cursor: 'pointer',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
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
    color: '#1E293B',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#1E40AF',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  dangerZone: {
    marginTop: '2rem',
    padding: '1rem',
    backgroundColor: '#FEF2F2',
    border: '1px solid #FECACA',
    borderRadius: '8px',
  },
  dangerZoneTitle: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: '#991B1B',
    marginBottom: '0.5rem',
    marginTop: 0,
  },
  dangerZoneWarning: {
    fontSize: '0.75rem',
    color: '#7F1D1D',
    marginTop: '0.5rem',
    marginBottom: 0,
  },
  deleteButton: {
    width: '100%',
    padding: '0.75rem',
    backgroundColor: '#DC2626',
    color: 'white',
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
    backgroundColor: '#64748B',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  staffList: {
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    padding: '1rem',
    backgroundColor: '#F8FAFC',
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
    color: '#1E293B',
  },
  selectedCount: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    backgroundColor: '#DBEAFE',
    color: '#1E40AF',
    borderRadius: '4px',
    fontSize: '0.875rem',
    fontWeight: '500',
    textAlign: 'center',
  },
};
