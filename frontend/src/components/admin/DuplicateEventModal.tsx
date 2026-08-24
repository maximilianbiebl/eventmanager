import React, { useState } from 'react';
import { eventsApi, Event } from '../../api/events';

interface Props {
  event: Event;
  onClose: () => void;
  onSuccess: () => void;
}

export const DuplicateEventModal: React.FC<Props> = ({ event, onClose, onSuccess }) => {
  const [name, setName] = useState(`${event.name} (Kopie)`);
  // Wie im Bearbeiten-Dialog: Postgres liefert einen ISO-Zeitstempel,
  // <input type="date"> braucht "YYYY-MM-DD".
  const [startDate, setStartDate] = useState(
    event.start_date ? String(event.start_date).slice(0, 10) : ''
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Bitte einen Namen eingeben');
      return;
    }

    setLoading(true);
    try {
      // instance_count fest auf 1: "Anzahl Durchführungen" war eine Altlast
      // und ist aus der Oberfläche entfernt. Der Backend-Vertrag bleibt gleich.
      await eventsApi.duplicate(event.id, { name, start_date: startDate, instance_count: 1 });
      onSuccess();
    } catch (error: any) {
      console.error('Duplicate event error:', error);
      setError(error.response?.data?.error || 'Fehler beim Duplizieren');
    } finally {
      setLoading(false);
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={styles.modal}>
        <h2 style={styles.title}>Event duplizieren</h2>
        <p style={styles.subtitle}>
          Kopiert alle Aufgaben und Programmpunkte des Events "{event.name}"
        </p>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Name des neuen Events *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={styles.input}
              placeholder="z.B. Konficamp 2025"
              required
              autoFocus
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Startdatum *</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              style={styles.input}
              required
            />
            <div style={styles.hint}>
              Startdatum der Kopie
            </div>
          </div>

          <div style={styles.info}>
            <strong>Was wird kopiert:</strong>
            <ul style={styles.infoList}>
              <li>Alle Aufgaben (Status wird auf "nicht gestartet" zurückgesetzt)</li>
              <li>Alle Programmpunkte</li>
              <li>Event-Beschreibung und Dauer</li>
            </ul>
            <strong>Was wird NICHT kopiert:</strong>
            <ul style={styles.infoList}>
              <li>Aufgaben-Zuweisungen</li>
              <li>Event-Staff-Pool</li>
            </ul>
          </div>

          <div className="app-modal-actions" style={styles.buttons}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelButton}
              disabled={loading}
            >
              Abbrechen
            </button>
            <button
              type="submit"
              style={styles.submitButton}
              disabled={loading}
            >
              {loading ? 'Wird dupliziert...' : 'Duplizieren'}
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
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: '8px',
    border: '1px solid var(--c-border-strong)',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: 'var(--c-text)',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    marginBottom: '1.5rem',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    fontWeight: '600',
    marginBottom: '0.5rem',
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
  hint: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    marginTop: '0.25rem',
  },
  info: {
    backgroundColor: 'var(--c-surface-muted)',
    padding: '1rem',
    borderRadius: '4px',
    border: '1px solid var(--c-border-strong)',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
    color: 'var(--c-text)',
  },
  infoList: {
    margin: '0.5rem 0',
    paddingLeft: '1.5rem',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
};
