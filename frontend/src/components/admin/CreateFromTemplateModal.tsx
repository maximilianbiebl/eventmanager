import React, { useState } from 'react';
import { eventsApi, Event } from '../../api/events';

interface Props {
  templates: Event[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateFromTemplateModal: React.FC<Props> = ({ templates, onClose, onSuccess }) => {
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    start_date: '',
    instance_count: 1,
  });
  const [loading, setLoading] = useState(false);

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedTemplateId) {
      alert('Bitte wähle eine Vorlage aus');
      return;
    }

    setLoading(true);

    try {
      await eventsApi.createFromTemplate(selectedTemplateId, formData);
      onSuccess();
    } catch (error) {
      console.error('Create from template error:', error);
      alert('Fehler beim Erstellen der Veranstaltung aus Vorlage');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Veranstaltung aus Vorlage erstellen</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Vorlage auswählen *</label>
            <select
              value={selectedTemplateId || ''}
              onChange={(e) => {
                const id = parseInt(e.target.value);
                setSelectedTemplateId(id);
                const template = templates.find(t => t.id === id);
                if (template && !formData.name) {
                  setFormData({ ...formData, name: template.name });
                }
              }}
              style={styles.select}
              required
            >
              <option value="">-- Vorlage wählen --</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          </div>

          {selectedTemplate && (
            <div style={styles.templateInfo}>
              <h4 style={styles.templateInfoTitle}>Vorlage: {selectedTemplate.name}</h4>
              {selectedTemplate.description && (
                <p style={styles.templateDescription}>{selectedTemplate.description}</p>
              )}
              <div style={styles.templateMeta}>
                <span>Dauer: {selectedTemplate.days} Tage</span>
              </div>
            </div>
          )}

          <div style={styles.formGroup}>
            <label style={styles.label}>Name der neuen Veranstaltung *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              placeholder="Name der Veranstaltung"
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Startdatum *</label>
            <input
              type="date"
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Anzahl Durchführungen *</label>
            <input
              type="number"
              min="1"
              value={formData.instance_count}
              onChange={(e) =>
                setFormData({ ...formData, instance_count: parseInt(e.target.value) })
              }
              style={styles.input}
              required
            />
          </div>

          <div style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Abbrechen
            </button>
            <button type="submit" style={styles.submitButton} disabled={loading}>
              {loading ? 'Erstelle...' : 'Veranstaltung erstellen'}
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
  select: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
    backgroundColor: 'white',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  templateInfo: {
    backgroundColor: '#f3f4f6',
    padding: '1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
  },
  templateInfoTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
  },
  templateDescription: {
    fontSize: '0.875rem',
    color: '#6b7280',
    margin: '0 0 0.5rem 0',
  },
  templateMeta: {
    fontSize: '0.875rem',
    color: '#6b7280',
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
