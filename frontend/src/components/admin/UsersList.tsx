import React, { useState, useEffect } from 'react';
import { usersApi, User } from '../../api/users';
import { useAuth } from '../../context/AuthContext';
import { ROLE_NAMES } from '../../utils/roleBadge';
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
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'teamleiter' | 'staff'>('all');
  const [search, setSearch] = useState('');
  const { user: me, isAdmin } = useAuth();

  /*
   * Teamleiter duerfen nur Mitarbeiter verwalten - keine Admins und keine
   * anderen Teamleiter. Der Server weist solche Anfragen ab; ohne diese
   * Pruefung stuenden die Knoepfe aber weiter da und liefen ins Leere.
   * Die eigene Zeile bleibt bedienbar.
   */
  const canEdit = (u: User) =>
    isAdmin || u.role === 'staff' || u.id === me?.id;

  // Loeschen ist enger als Bearbeiten: die eigene Zeile darf ein Teamleiter
  // bearbeiten, aber nicht loeschen - der Server lehnt das ohnehin ab.
  const canDelete = (u: User) => isAdmin || (u.role === 'staff' && u.id !== me?.id);

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

  /*
   * Rollenwechsel. Zwei Rueckfragen, weil beide Richtungen weh tun koennen:
   * eine Hochstufung gibt jemandem Zugriff auf alles, eine Herabstufung
   * nimmt ihn womoeglich mitten in der Freizeit weg.
   *
   * Die eigene Rolle ist gesperrt - wer sich selbst herabstuft, sperrt sich
   * aus der Verwaltung aus und kann es nicht rueckgaengig machen.
   */
  const handleRoleChange = async (u: User, neu: string) => {
    if (neu === u.role) return;

    if (u.id === me?.id) {
      alert('Die eigene Rolle lässt sich nicht ändern - sonst sperrst du dich womöglich selbst aus.');
      return;
    }

    const von = ROLE_NAMES[u.role] || u.role;
    const nach = ROLE_NAMES[neu] || neu;
    if (!confirm(`${u.name}: Rolle von "${von}" auf "${nach}" ändern?`)) return;

    try {
      await usersApi.update(u.id, { name: u.name, role: neu });
      await loadUsers(false);
    } catch (error: any) {
      console.error('Change role error:', error);
      alert(error.response?.data?.error || 'Fehler beim Ändern der Rolle');
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
    const selectable = visibleUsers.filter(canDelete);
    if (selectedIds.length === selectable.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(selectable.map(u => u.id));
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

  // Filter: Rolle und Namenssuche
  const filteredUsers = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    if (search.trim() && !u.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
    return true;
  });

  // Sort users
  const sortedUsers = [...filteredUsers].sort((a, b) => {
    if (!sortColumn) return 0;

    let compareResult = 0;
    if (sortColumn === 'name') {
      compareResult = a.name.localeCompare(b.name);
    } else if (sortColumn === 'role') {
      compareResult = a.role.localeCompare(b.role);
    }

    return sortDirection === 'asc' ? compareResult : -compareResult;
  });

  const visibleUsers = sortedUsers;
  const roleCounts = {
    all: users.length,
    admin: users.filter(u => u.role === 'admin').length,
    teamleiter: users.filter(u => u.role === 'teamleiter').length,
    staff: users.filter(u => u.role === 'staff').length,
  };

  if (loading) {
    return <div>Lade Mitarbeiter...</div>;
  }

  return (
    <div>
      {previousEventId && (
        <div style={styles.topBar}>
          <button onClick={() => onBackToEvent(previousEventId)} style={styles.backButton}>
            Zurück zur Veranstaltung
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

      {/* Filterleiste - dieselben Pillen wie im Mitarbeiterbereich */}
      <div className="tv-toolbar" style={styles.filterBar}>
        <span className="tv-label">Rolle</span>
        {([
          ['all', 'Alle'],
          ['admin', 'Admin'],
          ['teamleiter', 'Teamleiter'],
          ['staff', 'Mitarbeiter'],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setRoleFilter(key)}
            className={roleFilter === key ? 'tv-chip-active' : 'tv-chip'}
            aria-pressed={roleFilter === key}
          >
            {label} {roleCounts[key]}
          </button>
        ))}
        <span style={styles.filterSpacer} />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Name suchen"
          style={styles.searchInput}
          aria-label="Nach Name suchen"
        />
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
                checked={selectedIds.length === visibleUsers.filter(canDelete).length && selectedIds.length > 0}
                onChange={handleSelectAll}
                style={styles.checkbox}
              />
            </th>
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
                {/*
                  Nicht auswaehlbare Zeilen bekommen eine deaktivierte
                  Checkbox statt gar keiner. Sonst fehlt in einzelnen Zeilen
                  das Kaestchen und die Spalte wird loechrig - man sieht dann
                  nicht, ob da etwas fehlt oder nichts hingehoert.
                */}
                <input
                  type="checkbox"
                  checked={selectedIds.includes(user.id)}
                  onChange={() => handleToggleSelect(user.id)}
                  disabled={!canDelete(user)}
                  style={canDelete(user) ? styles.checkbox : styles.checkboxDisabled}
                  title={canDelete(user) ? undefined : 'Teamleiter können nur Mitarbeiter löschen'}
                  aria-label={`${user.name} auswählen`}
                />
              </td>
              <td style={styles.td}>{user.name}</td>
              <td style={styles.td}>
                {/*
                  Nur Admins duerfen Rollen vergeben - ein Teamleiter koennte
                  sich sonst selbst hochstufen. Der Server lehnt das ohnehin
                  ab, hier steht deshalb gar kein Auswahlfeld.
                */}
                {isAdmin ? (
                  /*
                    Das Auswahlfeld sieht aus wie der Badig daneben, damit die
                    Liste nicht je nach angemeldeter Rolle anders aussieht.
                    Mit der Darstellung des Betriebssystems war es hoeher und
                    breiter als der Badge fuer dieselbe Rolle - deshalb ohne,
                    und das Zeichen fuer "aufklappbar" kommt daneben.
                  */
                  <span style={styles.roleSelectWrap}>
                    <select
                      value={user.role}
                      onChange={(e) => handleRoleChange(user, e.target.value)}
                      style={{
                        ...(user.role === 'admin'
                          ? styles.badgeAdmin
                          : user.role === 'teamleiter'
                          ? styles.badgeTeamleiter
                          : styles.badgeStaff),
                        ...styles.roleSelect,
                      }}
                      aria-label={`Rolle von ${user.name}`}
                    >
                      <option value="staff">Mitarbeiter</option>
                      <option value="teamleiter">Teamleiter</option>
                      <option value="admin">Admin</option>
                    </select>
                    <span style={styles.roleCaret} aria-hidden="true">▾</span>
                  </span>
                ) : (
                <span style={
                  user.role === 'admin'
                    ? styles.badgeAdmin
                    : user.role === 'teamleiter'
                    ? styles.badgeTeamleiter
                    : styles.badgeStaff
                }>
                  {ROLE_NAMES[user.role] || user.role}
                </span>
                )}
              </td>
              <td style={styles.td}>
                {canEdit(user) || canDelete(user) ? (
                  <div className={responsiveStyles.userActions}>
                    {canEdit(user) && (
                      <button onClick={() => handleResetPassword(user.id, user.name)} style={styles.resetButton}>
                        Passwort ändern
                      </button>
                    )}
                    {canDelete(user) && (
                      <button onClick={() => handleDelete(user.id)} style={styles.deleteButton}>
                        Löschen
                      </button>
                    )}
                  </div>
                ) : (
                  <span style={styles.noPermission} title="Teamleiter können nur Mitarbeiter verwalten">
                    –
                  </span>
                )}
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
  filterBar: {
    marginBottom: '1rem',
  },
  filterSpacer: {
    flex: '1 1 auto',
  },
  searchInput: {
    padding: '0.3125rem 0.75rem',
    minWidth: '10rem',
    borderRadius: '9999px',
    border: '1px solid var(--c-border-strong)',
    backgroundColor: 'var(--c-surface)',
    color: 'var(--c-text)',
    fontSize: '0.8125rem',
    fontFamily: 'inherit',
  },
  roleSelectWrap: {
    position: 'relative',
    display: 'inline-flex',
    alignItems: 'center',
  },
  roleSelect: {
    // Farbe kommt vom Badge-Stil, der davor gesetzt wird. Alles, was die
    // Groesse bestimmt, steht hier - und zwar genau wie beim Badge.
    appearance: 'none',
    WebkitAppearance: 'none',
    MozAppearance: 'none',
    border: '1px solid transparent',
    borderRadius: '9999px',
    padding: '0.25rem 1.5rem 0.25rem 0.75rem',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: '500',
    lineHeight: '1.25rem',
    // Global gilt select { min-height: 44px } als Touch-Ziel. Hier waere der
    // Badge dadurch anderthalbmal so hoch wie derselbe Badge ohne
    // Auswahlfeld - in einer Tabelle voller kleiner Bedienelemente faellt
    // das aus dem Rahmen.
    minHeight: 0,
    cursor: 'pointer',
  },
  roleCaret: {
    position: 'absolute',
    right: '0.5625rem',
    fontSize: '0.625rem',
    pointerEvents: 'none',
    opacity: 0.75,
  },
  noPermission: {
    color: 'var(--c-text-subtle)',
  },
  checkboxDisabled: {
    width: '18px',
    height: '18px',
    cursor: 'not-allowed',
    opacity: 0.35,
  },
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
    display: 'inline-block',
    lineHeight: '1.25rem',
    // Unsichtbarer Rahmen wie beim Auswahlfeld - sonst sind die beiden
    // Darstellungen zwei Pixel verschieden hoch.
    border: '1px solid transparent',
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-warning-soft)',
    color: 'var(--c-warning-strong)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeTeamleiter: {
    display: 'inline-block',
    lineHeight: '1.25rem',
    // Unsichtbarer Rahmen wie beim Auswahlfeld - sonst sind die beiden
    // Darstellungen zwei Pixel verschieden hoch.
    border: '1px solid transparent',
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-success-soft)',
    color: 'var(--c-success-strong)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  badgeStaff: {
    display: 'inline-block',
    lineHeight: '1.25rem',
    // Unsichtbarer Rahmen wie beim Auswahlfeld - sonst sind die beiden
    // Darstellungen zwei Pixel verschieden hoch.
    border: '1px solid transparent',
    padding: '0.25rem 0.75rem',
    backgroundColor: 'var(--c-accent-soft)',
    color: 'var(--c-accent-text)',
    borderRadius: '9999px',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  /*
   * "Passwort ändern" ist eine normale Verwaltungsaktion, keine Warnung.
   * Gefuellt in Warnfarbe stand der Knopf in derselben Zeile wie der gelbe
   * Admin-Badge - zwei Spalten auseinander, dieselbe Farbe, zwei voellig
   * verschiedene Bedeutungen. Jetzt derselbe leise Umriss-Stil wie
   * "Bearbeiten" in der Aufgabenansicht. Rot fuer "Löschen" bleibt: das ist
   * eine eigene, etablierte Bedeutung (zerstoerende Aktion).
   */
  resetButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text-muted)',
    border: '1px solid var(--c-border)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    transition: 'border-color 0.15s ease, color 0.15s ease',
  },
  deleteButton: {
    padding: '0.375rem 0.75rem',
    backgroundColor: 'var(--c-danger)',
    color: 'var(--c-text-inverse)',
    border: '1px solid var(--c-danger)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.8125rem',
    fontWeight: '500',
    whiteSpace: 'nowrap',
    transition: 'background-color 0.2s',
  },
};
