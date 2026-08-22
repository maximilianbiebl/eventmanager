import React, { useState } from 'react';
import { eventsApi, Event } from '../../api/events';

interface Props {
  event: Event;
  onClose: () => void;
  onSuccess: () => void;
}

export const DuplicateEventModal: React.FC<Props> = ({ event, onClose, onSuccess }) => {
  const [name, setName] = useState(`${event.name} (Kopie)`);
  const [startDate, setStartDate] = useState(event.start_date);
  const [instanceCount, setInstanceCount] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Bitte einen Namen eingeben');
      return;
    }

    if (instanceCount < 1 || instanceCount > 10) {
      setError('Anzahl Durchführungen muss zwischen 1 und 10 liegen');
      return;
    }

    setLoading(true);
    try {
      await eventsApi.duplicate(event.id, { name, start_date: startDate, instance_count: instanceCount });
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
              Startdatum der ersten Durchführung
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Anzahl Durchführungen</label>
            <input
              type="number"
              min="1"
              max="10"
              value={instanceCount}
              onChange={(e) => setInstanceCount(parseInt(e.target.value))}
              style={styles.input}
            />
            <div style={styles.hint}>
              Wie oft soll das Event stattfinden? (1-10)
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
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: '#FFFFFF',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
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
    color: '#1E293B',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#64748B',
    marginBottom: '1.5rem',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#FEE2E2',
    color: '#991B1B',
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
  hint: {
    fontSize: '0.875rem',
    color: '#64748B',
    marginTop: '0.25rem',
  },
  info: {
    backgroundColor: '#F8FAFC',
    padding: '1rem',
    borderRadius: '4px',
    border: '1px solid #CBD5E1',
    marginBottom: '1.5rem',
    fontSize: '0.875rem',
    color: '#1E293B',
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
    color: '#1E293B',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#1E40AF',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
};
