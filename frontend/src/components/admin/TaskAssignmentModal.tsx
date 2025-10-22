import React, { useState, useEffect } from 'react';
import { tasksApi } from '../../api/tasks';
import { User } from '../../api/users';
import client from '../../api/client';

interface Props {
  taskId: number;
  eventId: number;
  eventInstanceId: number;
  onClose: () => void;
  onSuccess: () => void;
}

export const TaskAssignmentModal: React.FC<Props> = ({ taskId, eventId, eventInstanceId, onClose, onSuccess }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<number[]>([]);
  const [reminderMinutes, setReminderMinutes] = useState<number>(15);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
  }, [eventId]);

  const loadUsers = async () => {
    try {
      // Nur Mitarbeiter aus dem Event Staff Pool laden
      const response = await client.get(`/users/event/${eventId}/staff`);
      setUsers(response.data);
    } catch (error) {
      console.error('Load users error:', error);
      setError('Fehler beim Laden der Mitarbeiter');
    }
  };

  const handleToggleUser = (userId: number) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (selectedUserIds.length === 0) {
      setError('Bitte mindestens einen Mitarbeiter auswählen');
      return;
    }

    setLoading(true);
    try {
      await tasksApi.assign({
        task_id: taskId,
        event_instance_id: eventInstanceId,
        user_ids: selectedUserIds,
        reminder_minutes: reminderMinutes,
      });
      onSuccess();
    } catch (error: any) {
      console.error('Assign task error:', error);
      setError(error.response?.data?.error || 'Fehler beim Zuweisen');
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
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Aufgabe zuweisen</h2>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Mitarbeiter auswählen</label>
            <div style={styles.usersList}>
              {users.length === 0 ? (
                <div style={styles.noUsersContainer}>
                  <p style={styles.noUsers}>Keine Mitarbeiter im Event-Pool verfügbar</p>
                  <p style={styles.noUsersHint}>
                    Bitte füge zuerst Mitarbeiter zum Event-Pool hinzu, bevor du Aufgaben zuweisen kannst.
                  </p>
                </div>
              ) : (
                users.map(user => (
                  <label key={user.id} style={styles.userItem}>
                    <input
                      type="checkbox"
                      checked={selectedUserIds.includes(user.id)}
                      onChange={() => handleToggleUser(user.id)}
                      style={styles.checkbox}
                    />
                    <span style={styles.userName}>{user.name}</span>
                  </label>
                ))
              )}
            </div>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>
              Erinnerung (Minuten vor Aufgabe)
            </label>
            <input
              type="number"
              min="0"
              max="1440"
              value={reminderMinutes}
              onChange={(e) => setReminderMinutes(parseInt(e.target.value))}
              style={styles.input}
            />
            <div style={styles.hint}>
              0 = keine Erinnerung, Standard: 15 Minuten
            </div>
          </div>

          <div style={styles.buttons}>
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
              {loading ? 'Wird zugewiesen...' : 'Zuweisen'}
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
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%',
    maxHeight: '80vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: '#1f2937',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
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
    color: '#374151',
  },
  usersList: {
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    padding: '0.75rem',
    maxHeight: '300px',
    overflow: 'auto',
  },
  noUsersContainer: {
    textAlign: 'center',
    padding: '2rem 1rem',
  },
  noUsers: {
    color: '#374151',
    fontWeight: '500',
    marginBottom: '0.5rem',
  },
  noUsersHint: {
    color: '#6b7280',
    fontSize: '0.875rem',
    margin: 0,
  },
  userItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    marginRight: '0.75rem',
    cursor: 'pointer',
  },
  userName: {
    fontSize: '1rem',
    color: '#1f2937',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    fontSize: '1rem',
  },
  hint: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginTop: '0.25rem',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
    marginTop: '2rem',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#f3f4f6',
    color: '#374151',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  submitButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
