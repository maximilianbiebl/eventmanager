import React, { useState } from 'react';
import { eventsApi, Event } from '../../api/events';
import { useAuth } from '../../context/AuthContext';

interface Props {
  event: Event;
  onClose: () => void;
  onSuccess: () => void;
  onDelete?: () => void; // Neuer optionaler Callback für Löschen
}

export const EventEditModal: React.FC<Props> = ({ event, onClose, onSuccess, onDelete }) => {
  const { isAdmin, isTeamleiter } = useAuth();
  const [formData, setFormData] = useState({
    name: event.name,
    description: event.description || '',
    days: event.days,
    start_date: event.start_date || '',
  });
  const [loading, setLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await eventsApi.update(event.id, formData);
      onSuccess();
    } catch (error) {
      console.error('Update event error:', error);
      alert('Fehler beim Aktualisieren der Veranstaltung');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    setLoading(true);

    try {
      await eventsApi.delete(event.id);
      // Verwende onDelete falls vorhanden, sonst onSuccess
      if (onDelete) {
        onDelete();
      } else {
        onSuccess();
      }
    } catch (error) {
      console.error('Delete event error:', error);
      alert('Fehler beim Löschen der Veranstaltung');
      setLoading(false);
    }
  };

  const handleCopyToTemplate = async () => {
    if (!confirm('Veranstaltung als Vorlage kopieren? (ohne Zuweisungen und Datum)')) return;

    setLoading(true);
    try {
      const response = await eventsApi.copyToTemplate(event.id);
      const debugInfo = response.debug ? `\n\nKopiert: ${response.debug.copiedTasks} Aufgaben, ${response.debug.copiedProgram} Programmpunkte` : '';
      alert('Vorlage erfolgreich erstellt' + debugInfo);
      onSuccess();
    } catch (error: any) {
      console.error('Copy to template error:', error);
      const errorMsg = error.response?.data?.details || error.response?.data?.error || 'Fehler beim Erstellen der Vorlage';
      alert(errorMsg);
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Veranstaltung bearbeiten</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
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
          <div style={styles.formGroup}>
            <label style={styles.label}>Anzahl Tage *</label>
            <input
              type="number"
              min="1"
              value={formData.days}
              onChange={(e) => setFormData({ ...formData, days: parseInt(e.target.value) })}
              style={styles.input}
              required
            />
          </div>
          {!event.is_template && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Startdatum</label>
              <input
                type="date"
                value={formData.start_date}
                onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
                style={styles.input}
              />
            </div>
          )}

          {showDeleteConfirm ? (
            <div style={styles.deleteConfirmBox}>
              <p style={styles.deleteWarning}>
                Möchten Sie diese Veranstaltung wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.
              </p>
              <div style={styles.deleteActions}>
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(false)}
                  style={styles.cancelDeleteButton}
                >
                  Abbrechen
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  style={styles.confirmDeleteButton}
                  disabled={loading}
                >
                  {loading ? 'Lösche...' : 'Endgültig löschen'}
                </button>
              </div>
            </div>
          ) : (
            <div style={styles.actions}>
              {/* Teamleiter dürfen vorgeschlagene Events nicht löschen */}
              {!(isTeamleiter && event.is_template_suggestion) && (
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  style={styles.deleteButton}
                >
                  Löschen
                </button>
              )}
              {isAdmin && !event.is_template && (
                <button
                  type="button"
                  onClick={handleCopyToTemplate}
                  style={styles.copyTemplateButton}
                  disabled={loading}
                >
                  📄 Als Vorlage kopieren
                </button>
              )}
              <button type="button" onClick={onClose} style={styles.cancelButton}>
                Abbrechen
              </button>
              <button type="submit" style={styles.submitButton} disabled={loading}>
                {loading ? 'Speichere...' : 'Speichern'}
              </button>
            </div>
          )}
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
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    padding: '2rem',
    borderRadius: '8px',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
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
  deleteConfirmBox: {
    backgroundColor: '#fef2f2',
    border: '1px solid #fecaca',
    borderRadius: '4px',
    padding: '1rem',
    marginTop: '1rem',
    marginBottom: '1rem',
  },
  deleteWarning: {
    color: '#991b1b',
    marginBottom: '1rem',
  },
  deleteActions: {
    display: 'flex',
    gap: '1rem',
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem',
  },
  deleteButton: {
    padding: '0.75rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  copyTemplateButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#3b82f6',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelDeleteButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  confirmDeleteButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#dc2626',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
  },
};
