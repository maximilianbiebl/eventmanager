import React, { useState } from 'react';
import { tasksApi } from '../../api/tasks';

interface Props {
  eventId: number;
  onClose: () => void;
  onSuccess: () => void;
  task?: any; // Für Edit-Modus
}

export const TaskFormModal: React.FC<Props> = ({ eventId, onClose, onSuccess, task }) => {
  const isEdit = !!task;

  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    day_number: task?.day_number || 1,
    scheduled_time: task?.scheduled_time || '',
    start_time: task?.start_time || '',
    end_time: task?.end_time || '',
    reminder_minutes: task?.reminder_minutes || 15,
    is_public: task?.is_public || false,
    status: task?.status || 'not_started',
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isEdit) {
        await tasksApi.update(task.id, formData);
      } else {
        await tasksApi.create({
          event_id: eventId,
          ...formData,
        });
      }
      onSuccess();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Fehler beim Speichern');
    } finally {
      setLoading(false);
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    padding: '1rem',
  },
  modal: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
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
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  textarea: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
    fontFamily: 'inherit',
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#6b7280',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
  },
  checkbox: {
    width: '1.25rem',
    height: '1.25rem',
    cursor: 'pointer',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
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
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
