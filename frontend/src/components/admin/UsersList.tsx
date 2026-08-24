import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import { authApi } from '../../api/auth';
import { CreateUserModal } from './CreateUserModal';
import { CSVExportModal } from './CSVExportModal';
import { CSVImportModal } from './CSVImportModal';
import responsiveStyles from './UsersList.module.css';

interface Props {
  previousEventId: number | null;
  onBackToEvent: (eventId: number) => void;
}

export const UsersList: React.FC<Props> = ({ previousEventId, onBackToEvent }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [sortColumn, setSortColumn] = useState<'name' | 'role' | null>(null);
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const [showExportModal, setShowExportModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);

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

  const handleToggleSelect = (userId: number) => {
    setSelectedIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAll = () => {
    if (selectedIds.length === sortedUsers.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(sortedUsers.map(u => u.id));
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) {
      alert('Bitte mindestens einen Mitarbeiter auswählen');
      return;
    }

    if (!confirm(`${selectedIds.length} Mitarbeiter wirklich löschen?`)) return;

    try {
      await usersApi.bulkDelete(selectedIds);
      setSelectedIds([]);
      await loadUsers(false);
    } catch (error) {
      console.error('Bulk delete error:', error);
      alert('Fehler beim Löschen');
    }
  };

  const handleSort = (column: 'name' | 'role') => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const getSortIcon = (column: 'name' | 'role') => {
    if (sortColumn !== column) return ' ↕';
    return sortDirection === 'asc' ? ' ▲' : ' ▼';
  };

  const handleExportSuccess = () => {
    setShowExportModal(false);
  };

  const handleImportSuccess = async () => {
    setShowImportModal(false);
    await loadUsers(false);
  };

  // Sort users
  const sortedUsers = [...users].sort((a, b) => {
    if (!sortColumn) return 0;

    let compareResult = 0;
    if (sortColumn === 'name') {
      compareResult = a.name.localeCompare(b.name);
    } else if (sortColumn === 'role') {
      compareResult = a.role.localeCompare(b.role);
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

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
        <div style={styles.titleRow}>
          <h2 style={styles.title} className={responsiveStyles.title}>Mitarbeiter</h2>
          <div style={styles.csvGroup} className={responsiveStyles.csvGroup}>
            <button onClick={() => setShowImportModal(true)} style={styles.csvButton}>
              Importieren
            </button>
            <span style={styles.csvDivider} aria-hidden="true" />
            <button onClick={() => setShowExportModal(true)} style={styles.csvButton}>
              Exportieren
            </button>
          </div>
        </div>
        <div style={styles.headerButtons} className={responsiveStyles.headerButtons}>
          {/* CSV als dezente Nebenfunktion in einer Zeile - wie in der
              Veranstaltungsübersicht, damit beide Seiten gleich funktionieren. */}
          <button onClick={() => setShowCreateModal(true)} style={styles.createButton} className={responsiveStyles.primaryButton}>
            Neuer Mitarbeiter
          </button>
        </div>
      </div>

      {selectedIds.length > 0 && (
        <div style={styles.bulkActions}>
          <span style={styles.bulkActionsText}>{selectedIds.length} ausgewählt</span>
          <button onClick={handleBulkDelete} style={styles.bulkDeleteButton}>
            Ausgewählte löschen
          </button>
          <button onClick={() => setSelectedIds([])} style={styles.bulkCancelButton}>
            Auswahl aufheben
          </button>
        </div>
      )}

      {showCreateModal && (
        <CreateUserModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleCreateSuccess}
        />
      )}

      {showExportModal && (
        <CSVExportModal
          type="users"
          items={users}
          selectedIds={selectedIds}
          onClose={() => setShowExportModal(false)}
          onSuccess={handleExportSuccess}
        />
      )}

      {showImportModal && (
        <CSVImportModal
          type="users"
          onClose={() => setShowImportModal(false)}
          onSuccess={handleImportSuccess}
        />
      )}

      {/* Eigener Scroll-Container: die Aktionen-Spalte ist breiter als ein
          Handy-Display. Ohne ihn schiebt die Tabelle das ganze Dokument
          seitlich raus - was wiederum jedes position:fixed-Modal zu breit macht. */}
      <div className={responsiveStyles.tableScroll}>
      <table style={styles.table} className={responsiveStyles.table}>
        <thead>
          <tr>
            <th style={styles.th}>
              <input
                type="checkbox"
                checked={selectedIds.length === sortedUsers.length && sortedUsers.length > 0}
                onChange={handleSelectAll}
                style={styles.checkbox}
              />
            </th>
            <th style={styles.th}>ID</th>
            <th style={{...styles.th, cursor: 'pointer', userSelect: 'none'}} onClick={() => handleSort('name')}>
              Name{getSortIcon('name')}
            </th>
            <th style={{...styles.th, cursor: 'pointer', userSelect: 'none'}} onClick={() => handleSort('role')}>
              Rolle{getSortIcon('role')}
            </th>
            <th style={styles.th}>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {sortedUsers.map((user) => (
            <tr key={user.id} style={selectedIds.includes(user.id) ? styles.selectedRow : undefined}>
              <td style={styles.td}>
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  onChange={() => handleToggleSelect(user.id)}
                  style={styles.checkbox}
                />
              </td>
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
                    Passwort ändern
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
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  topBar: {
    marginBottom: '1rem',
  },
  backButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.875rem',
    flexWrap: 'wrap',
  },
  headerButtons: {
    display: 'flex',
    gap: '0.75rem',
    // Ohne wrap schiebt sich die Primäraktion aus dem Viewport - und ein
    // horizontal überlaufendes Dokument macht jedes position:fixed-Modal zu breit.
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  csvGroup: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  csvButton: {
    padding: '0.25rem 0.125rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: 'none',
    borderRadius: '2px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '0.75rem',
    textDecoration: 'underline',
    textUnderlineOffset: '3px',
    textDecorationColor: 'var(--c-border-strong)',
    transition: 'color 0.15s ease',
  },
  csvDivider: {
    width: '1px',
    height: '0.875rem',
    backgroundColor: 'var(--c-border)',
  },
  createButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  exportButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  importButton: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  bulkActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '0.75rem 1rem',
    backgroundColor: 'var(--c-surface-muted)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  bulkActionsText: {
    fontSize: '0.875rem',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  bulkDeleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  bulkCancelButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-text-muted)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'background-color 0.2s',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  selectedRow: {
    backgroundColor: 'var(--c-accent-soft)',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
  },
  th: {
    textAlign: 'left',
    padding: '0.75rem',
    backgroundColor: 'var(--c-surface-muted)',
    borderBottom: '2px solid var(--c-border-strong)',
    fontWeight: '600',
    color: 'var(--c-text)',
  },
  td: {
    padding: '0.75rem',
    borderBottom: '1px solid var(--c-border)',
    color: 'var(--c-text)',
  },
  badgeAdmin: {
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-warning-soft)',
    color: 'var(--c-warning-strong)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeTeamleiter: {
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-success-soft)',
    color: 'var(--c-success-strong)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeStaff: {
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  resetButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-warning)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  deleteButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
};
