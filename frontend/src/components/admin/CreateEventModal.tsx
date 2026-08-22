import React, { useState, useEffect } from 'react';
import { eventsApi } from '../../api/events';
import { usersApi, User } from '../../api/users';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateEventModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { isAdmin, user } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    days: 4,
    instance_count: 1,
    is_template: false,
    co_teamleiter_ids: [] as number[],
  });
  const [loading, setLoading] = useState(false);
  const [teamleiter, setTeamleiter] = useState<User[]>([]);

  useEffect(() => {
    const loadTeamleiter = async () => {
      try {
        const users = await usersApi.getAll();
        // Filter nur Teamleiter und Admin, aber nicht den aktuellen Benutzer (der wird automatisch primärer Teamleiter)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await eventsApi.create(formData);
      onSuccess();
    } catch (error) {
      console.error('Create event error:', error);
      alert('Fehler beim Erstellen der Veranstaltung');
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
        <h2 style={styles.title}>Neue Veranstaltung</h2>
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
          {isAdmin && (
            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.is_template}
                  onChange={(e) => setFormData({ ...formData, is_template: e.target.checked })}
                  style={styles.checkbox}
                />
                Als Vorlage markieren
              </label>
            </div>
          )}
          <div className="app-modal-actions" style={styles.actions}>
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Abbrechen
            </button>
            <button type="submit" style={styles.submitButton} disabled={loading}>
              {loading ? 'Erstelle...' : 'Erstellen'}
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
    padding: '2rem',
    borderRadius: '8px',
    border: '1px solid #CBD5E1',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1E293B',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    fontWeight: '500',
    color: '#1E293B',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    color: '#1E293B',
  },
  checkboxGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.75rem',
    border: '1px solid #CBD5E1',
    borderRadius: '4px',
    backgroundColor: '#F8FAFC',
    maxHeight: '150px',
    overflowY: 'auto',
  },
  checkbox: {
    cursor: 'pointer',
    width: '1.25rem',
    height: '1.25rem',
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
};
