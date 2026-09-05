import React, { useState, useEffect } from 'react';
import { eventsApi, Event } from '../../api/events';
import { usersApi, User } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { zeitFeldProps } from '../../utils/zeitFeld';

interface Props {
  templates: Event[];
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateFromTemplateModal: React.FC<Props> = ({ templates, onClose, onSuccess }) => {
  const { user } = useAuth();
  // Wenn nur eine Vorlage, automatisch auswählen
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(
    templates.length === 1 ? templates[0].id : null
  );
  const [formData, setFormData] = useState({
    name: templates.length === 1 ? templates[0].name : '',
    start_date: '',
    instance_count: 1,
    days: templates.length === 1 ? templates[0].days : 4,
    co_teamleiter_ids: [] as number[],
  });
  const [loading, setLoading] = useState(false);
  const [teamleiter, setTeamleiter] = useState<User[]>([]);

  useEffect(() => {
    const loadTeamleiter = async () => {
      try {
        const users = await usersApi.getAll();
        // Filter nur Teamleiter und Admin, aber nicht den aktuellen Benutzer
        const availableTeamleiter = users.filter(u =>
          (u.role === 'teamleiter' || u.role === 'admin') && u.id !== user?.id
        );
        setTeamleiter(availableTeamleiter);
      } catch (error) {
        console.error('Error loading teamleiter:', error);
      }
    };

    loadTeamleiter();
  }, [user?.id]);

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

  const handleCoTeamleiterToggle = (teamleiterId: number) => {
    setFormData(prev => ({
      ...prev,
      co_teamleiter_ids: prev.co_teamleiter_ids.includes(teamleiterId)
        ? prev.co_teamleiter_ids.filter(id => id !== teamleiterId)
        : [...prev.co_teamleiter_ids, teamleiterId]
    }));
  };

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={onClose}>
      <div className="app-modal" style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Veranstaltung aus Vorlage erstellen</h2>
        <form onSubmit={handleSubmit}>
          {/* Nur Dropdown zeigen wenn mehr als eine Vorlage */}
          {templates.length > 1 && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Vorlage auswählen *</label>
              <select
                value={selectedTemplateId || ''}
                onChange={(e) => {
                  const id = parseInt(e.target.value);
                  setSelectedTemplateId(id);
                  const template = templates.find(t => t.id === id);
                  if (template) {
                    setFormData({
                      ...formData,
                      name: template.name,
                      days: template.days
                    });
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
          )}

          {selectedTemplate && templates.length === 1 && (
            <div style={styles.templateInfo}>
              <h4 style={styles.templateInfoTitle}>Vorlage: {selectedTemplate.name}</h4>
              {selectedTemplate.description && (
                <p style={styles.templateDescription}>{selectedTemplate.description}</p>
              )}
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

          <div style={styles.formGroup}>
            <label style={styles.label}>Startdatum *</label>
            <input
              type="date"
              {...zeitFeldProps}
              value={formData.start_date}
              onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
              style={styles.input}
              required
            />
          </div>

          {/* "Anzahl Durchführungen" entfernt - Altlast. instance_count bleibt
              fest auf 1, damit der Backend-Vertrag unverändert bleibt. */}

          {teamleiter.length > 0 && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Co-Teamleiter (optional)</label>
              <div style={styles.checkboxGroup}>
                {teamleiter.map(tl => (
                  <label key={tl.id} style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={formData.co_teamleiter_ids.includes(tl.id)}
                      onChange={() => handleCoTeamleiterToggle(tl.id)}
                      style={styles.checkbox}
                    />
                    <span>{tl.name} ({tl.role === 'admin' ? 'Admin' : 'Teamleiter'})</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="app-modal-actions" style={styles.actions}>
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
    backgroundColor: 'var(--c-overlay)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    padding: '2rem',
    borderRadius: '8px',
    border: '1px solid var(--c-border-strong)',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'var(--c-text)',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    color: 'var(--c-text)',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    backgroundColor: 'var(--c-surface-muted)',
    maxHeight: '150px',
    overflowY: 'auto',
  },
  checkbox: {
    cursor: 'pointer',
    width: '1.25rem',
    height: '1.25rem',
  },
  select: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    backgroundColor: 'var(--c-surface)',
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
  templateInfo: {
    backgroundColor: 'var(--c-surface-muted)',
    padding: '1rem',
    borderRadius: '6px',
    marginBottom: '1rem',
    border: '1px solid var(--c-border-strong)',
  },
  templateInfoTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.5rem 0',
    color: 'var(--c-text)',
  },
  templateDescription: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    margin: '0 0 0.5rem 0',
  },
  templateMeta: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
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
};
