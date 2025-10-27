import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { EventsList } from './EventsList';
import { UsersList } from './UsersList';
import { ChangePasswordDialog } from './ChangePasswordDialog';

type Tab = 'events' | 'users';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>('events');
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Zum Zurücksetzen der Listen
  const { user, logout } = useAuth();

  const handleTabClick = (tab: Tab) => {
    if (tab === activeTab) {
      // Wenn bereits aktiver Tab geklickt wird, Liste zurücksetzen
      setRefreshKey(prev => prev + 1);
    }
    setActiveTab(tab);
  };

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Event Manager - Admin</h1>
          <p style={styles.subtitle}>Willkommen, {user?.name}!</p>
        </div>
        <div style={styles.headerActions}>
          <div style={styles.menuContainer}>
            <button onClick={() => setShowMenu(!showMenu)} style={styles.menuButton}>
              ⚙️ Menü
            </button>
            {showMenu && (
              <div style={styles.dropdown}>
                <button
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowMenu(false);
                  }}
                  style={styles.dropdownItem}
                >
                  🔒 Passwort ändern
                </button>
                <button onClick={logout} style={styles.dropdownItemDanger}>
                  🚪 Abmelden
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.tabs}>
        <button
          onClick={() => handleTabClick('events')}
          style={activeTab === 'events' ? styles.activeTab : styles.tab}
        >
          Veranstaltungen
        </button>
        <button
          onClick={() => handleTabClick('users')}
          style={activeTab === 'users' ? styles.activeTab : styles.tab}
        >
          Mitarbeiter
        </button>
      </div>

      <div style={styles.content}>
        {activeTab === 'events' && <EventsList key={`events-${refreshKey}`} />}
        {activeTab === 'users' && <UsersList key={`users-${refreshKey}`} />}
      </div>

      {showChangePassword && <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: '#f3f4f6',
    padding: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    backgroundColor: 'white',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: 'bold',
    color: '#111827',
    margin: 0,
  },
  subtitle: {
    color: '#6b7280',
    margin: '0.5rem 0 0 0',
  },
  headerActions: {
    position: 'relative',
  },
  menuContainer: {
    position: 'relative',
  },
  menuButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#6366f1',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: '0.5rem',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
    minWidth: '200px',
    zIndex: 1000,
  },
  dropdownItem: {
    width: '100%',
    padding: '0.75rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '1rem',
  },
  dropdownItemDanger: {
    width: '100%',
    padding: '0.75rem 1rem',
    backgroundColor: 'transparent',
    border: 'none',
    borderTop: '1px solid #e5e7eb',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '1rem',
    color: '#ef4444',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'white',
    border: '1px solid #d1d5db',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    color: '#374151',
  },
  activeTab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: '#4f46e5',
    color: 'white',
    border: '1px solid #4f46e5',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  content: {
    backgroundColor: 'white',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
  },
};
