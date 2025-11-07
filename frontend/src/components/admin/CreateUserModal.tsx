import React, { useState } from 'react';
import { authApi } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';

interface Props {
  onClose: () => void;
  onSuccess: () => void;
}

export const CreateUserModal: React.FC<Props> = ({ onClose, onSuccess }) => {
  const { isAdmin } = useAuth();
  const [formData, setFormData] = useState({
    name: '',
    password: '',
    role: 'staff',
  });
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password.length < 4) {
      alert('Passwort muss mindestens 4 Zeichen lang sein');
      return;
    }

    setLoading(true);

    try {
      await authApi.register(formData);
      onSuccess();
    } catch (error: any) {
      console.error('Create user error:', error);
      alert(error.response?.data?.error || 'Fehler beim Anlegen des Benutzers');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.overlay} onClick={onClose}>
      <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 style={styles.title}>Neuer Mitarbeiter</h2>
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Name *</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              style={styles.input}
              required
              autoFocus
            />
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Passwort *</label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              style={styles.input}
              required
              minLength={4}
            />
            <p style={styles.hint}>Mindestens 4 Zeichen</p>
          </div>
          <div style={styles.formGroup}>
            <label style={styles.label}>Rolle *</label>
            <select
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              style={styles.select}
              required
            >
              {isAdmin ? (
                <>
                  <option value="staff">Staff</option>
                  <option value="teamleiter">Teamleiter</option>
                  <option value="admin">Admin</option>
                </>
              ) : (
                <>
                  <option value="staff">Staff</option>
                  <option value="teamleiter">Teamleiter</option>
                </>
              )}
            </select>
          </div>
          <div style={styles.actions}>
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
  hint: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  select: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
    backgroundColor: 'white',
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
