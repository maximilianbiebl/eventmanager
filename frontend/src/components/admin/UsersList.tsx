import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import { authApi } from '../../api/auth';
import responsiveStyles from './UsersList.module.css';

interface Props {
  onBackToEvents: () => void;
}

export const UsersList: React.FC<Props> = ({ onBackToEvents }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

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

  const handleCreate = async () => {
    const name = prompt('Name:');
    if (!name) return;

    const password = prompt('Passwort:');
    if (!password) return;

    const role = confirm('Als Admin anlegen?') ? 'admin' : 'staff';

    try {
      await authApi.register({ name, password, role });
      await loadUsers(false); // Reload without showing loading indicator
    } catch (error: any) {
      console.error('Create user error:', error);
      alert(error.response?.data?.error || 'Fehler beim Anlegen');
    }
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
      <div style={styles.topBar}>
        <button onClick={onBackToEvents} style={styles.backButton}>
          ← Zurück zu Veranstaltungen
        </button>
      </div>

      <div style={styles.header} className={responsiveStyles.header}>
        <h2 style={styles.title}>Mitarbeiter</h2>
        <button onClick={handleCreate} style={styles.createButton} className={responsiveStyles.createButton}>
          + Neuer Mitarbeiter
        </button>
      </div>

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
                <span style={user.role === 'admin' ? styles.badgeAdmin : styles.badgeStaff}>
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
