import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import { authApi } from '../../api/auth';
import { useAuth } from '../../context/AuthContext';
import { CreateUserModal } from './CreateUserModal';
import responsiveStyles from './UsersList.module.css';

interface Props {
  previousEventId: number | null;
  onBackToEvent: (eventId: number) => void;
}

export const UsersList: React.FC<Props> = ({ previousEventId, onBackToEvent }) => {
  const { isAdmin } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async (showLoading = true) => {
    try {
      if (showLoading) {
        setLoading(true);
      }
      const data = await usersApi.getAll();
      setUsers(data);
    } catch (error) {
      console.error('Load users error:', error);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const handleCreateSuccess = async () => {
    setShowCreateModal(false);
    await loadUsers(false); // Reload without showing loading indicator
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Benutzer wirklich löschen?')) return;

    try {
      await usersApi.delete(id);
      await loadUsers(false); // Reload without showing loading indicator
    } catch (error) {
      console.error('Delete user error:', error);
      alert('Fehler beim Löschen');
    }
  };

  const handleResetPassword = async (userId: number, userName: string) => {
    const newPassword = prompt(`Neues Passwort für ${userName}:`);
    if (!newPassword) return;

    if (newPassword.length < 4) {
      alert('Passwort muss mindestens 4 Zeichen lang sein');
      return;
    }

    try {
      await authApi.resetPassword(userId, newPassword);
      alert('Passwort wurde erfolgreich zurückgesetzt');
    } catch (error: any) {
      console.error('Reset password error:', error);
      alert(error.response?.data?.error || 'Fehler beim Zurücksetzen des Passworts');
    }
  };

  if (loading) {
    return <div>Lade Mitarbeiter...</div>;
  }

  return (
    <div>
      {previousEventId && (
        <div style={styles.topBar}>
          <button onClick={() => onBackToEvent(previousEventId)} style={styles.backButton}>
            ← Zurück zur Veranstaltung
          </button>
        </div>
      )}

      <div style={styles.header} className={responsiveStyles.header}>
        <h2 style={styles.title}>Mitarbeiter</h2>
        <button onClick={() => setShowCreateModal(true)} style={styles.createButton} className={responsiveStyles.createButton}>
          + Neuer Mitarbeiter
        </button>
      </div>

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      <table style={styles.table} className={responsiveStyles.table}>
        <thead>
          <tr>
            <th style={styles.th}>ID</th>
            <th style={styles.th}>Name</th>
            <th style={styles.th}>Rolle</th>
            <th style={styles.th}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <td style={styles.td}>{user.id}</td>
              <td style={styles.td}>{user.name}</td>
              <td style={styles.td}>
                <span style={
                  user.role === 'admin'
                    ? styles.badgeAdmin
                    : user.role === 'teamleiter'
                    ? styles.badgeTeamleiter
                    : styles.badgeStaff
                }>
                  {user.role}
                </span>
              </td>
              <td style={styles.td}>
                <div className={responsiveStyles.userActions}>
                  <button onClick={() => handleResetPassword(user.id, user.name)} style={styles.resetButton}>
                    🔒 Passwort ändern
                  </button>
                  <button onClick={() => handleDelete(user.id)} style={styles.deleteButton}>
                    Löschen
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  topBar: {
    marginBottom: '1rem',
  },
  backButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6b7280',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: 0,
  },
  createButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    backgroundColor: '#f9fafb',
    borderBottom: '2px solid #e5e7eb',
    fontWeight: '600',
  },
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid #e5e7eb',
  },
  badgeAdmin: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#fef3c7',
    color: '#92400e',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeTeamleiter: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#d1fae5',
    color: '#065f46',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeStaff: {
    padding: '0.25rem 0.75rem',
    backgroundColor: '#dbeafe',
    color: '#1e40af',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  resetButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#f59e0b',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#ef4444',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
};
