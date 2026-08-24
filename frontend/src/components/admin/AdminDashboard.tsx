import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { EventsList } from './EventsList';
import { UsersList } from './UsersList';
import { ChangePasswordDialog } from './ChangePasswordDialog';
import { StaffSettings } from '../StaffSettings';
import { ThemeSwitch } from '../ThemeSwitch';
import responsiveStyles from './AdminDashboard.module.css';

type Tab = 'events' | 'users';

export const AdminDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    // Load last active tab from localStorage
    const saved = localStorage.getItem('adminActiveTab');
    return (saved === 'events' || saved === 'users') ? saved : 'events';
  });
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // Zum Zurücksetzen der Listen
  const [previousEventId, setPreviousEventId] = useState<number | null>(null);
  const { user, logout } = useAuth();

  const handleTabClick = (tab: Tab) => {
    // Wenn zu Mitarbeiter gewechselt wird, Event-ID merken (falls vorhanden)
    if (tab === 'users') {
      const savedEventId = localStorage.getItem('adminSelectedEventId');
      setPreviousEventId(savedEventId ? parseInt(savedEventId, 10) : null);
    }

    // Wenn Events Tab angeklickt wird, IMMER EventDetail zurücksetzen
    if (tab === 'events') {
      localStorage.removeItem('adminSelectedEventId');
      setPreviousEventId(null);
    }

    if (tab === activeTab) {
      // Wenn bereits aktiver Tab geklickt wird, Liste zurücksetzen
      setRefreshKey(prev => prev + 1);
    }
    setActiveTab(tab);
    // Save to localStorage
    localStorage.setItem('adminActiveTab', tab);
  };

  const handleBackToEvent = (eventId: number) => {
    localStorage.setItem('adminSelectedEventId', eventId.toString());
    setActiveTab('events');
    localStorage.setItem('adminActiveTab', 'events');
    setPreviousEventId(null);
  };

  return (
    <div style={styles.container} className={responsiveStyles.container}>
      <div style={styles.header} className={responsiveStyles.header}>
        <div>
          <h1 style={styles.title} className={responsiveStyles.title}>Event Manager</h1>
          <p style={styles.subtitle}>Willkommen, {user?.name}!</p>
        </div>

        {/* Desktop Menu */}
        <div style={styles.headerActions} className={responsiveStyles.headerButtons}>
          <div style={styles.menuContainer}>
            <button onClick={() => setShowMenu(!showMenu)} style={styles.menuButton}>
              Menü
            </button>
            {showMenu && (
              <>
                <div style={styles.menuOverlay} onClick={() => setShowMenu(false)} />
                <div style={styles.dropdown}>
                  <ThemeSwitch />
                  <button
                    onClick={() => {
                      setShowSettings(true);
                      setShowMenu(false);
                    }}
                    style={styles.dropdownItem}
                  >
                    Einstellungen
                  </button>
                  <button
                    onClick={() => {
                      setShowChangePassword(true);
                      setShowMenu(false);
                    }}
                    style={styles.dropdownItem}
                  >
                    Passwort ändern
                  </button>
                  <button onClick={logout} style={styles.dropdownItemDanger}>
                    Abmelden
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Mobile hamburger menu */}
        <div className={responsiveStyles.mobileMenuContainer}>
          <button
            onClick={() => setShowMenu(!showMenu)}
            className={responsiveStyles.hamburgerButton}
            aria-label="Menu"
          >
            <div className={responsiveStyles.hamburgerIcon}>
              <span></span>
              <span></span>
              <span></span>
            </div>
          </button>

          {showMenu && (
            <>
              <div
                className={responsiveStyles.mobileMenuOverlay}
                onClick={() => setShowMenu(false)}
              />
              <div className={responsiveStyles.mobileMenu}>
                <ThemeSwitch />
                <button
                  onClick={() => {
                    setShowSettings(true);
                    setShowMenu(false);
                  }}
                  className={responsiveStyles.mobileMenuItem}
                >
                  Einstellungen
                </button>
                <button
                  onClick={() => {
                    setShowChangePassword(true);
                    setShowMenu(false);
                  }}
                  className={responsiveStyles.mobileMenuItem}
                >
                  Passwort ändern
                </button>
                <button
                  onClick={logout}
                  className={responsiveStyles.mobileMenuItemLogout}
                >
                  Abmelden
                </button>
              </div>
            </>
          )}
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
        {activeTab === 'users' && (
          <UsersList
            key={`users-${refreshKey}`}
            previousEventId={previousEventId}
            onBackToEvent={handleBackToEvent}
          />
        )}
      </div>

      {showChangePassword && <ChangePasswordDialog onClose={() => setShowChangePassword(false)} />}
      {showSettings && <StaffSettings onClose={() => setShowSettings(false)} />}
    </div>
  );
};

const styles: { [key: string]: React.CSSProperties } = {
  container: {
    minHeight: '100vh',
    backgroundColor: 'var(--c-surface-muted)',
    padding: '1rem',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    backgroundColor: 'var(--c-surface)',
    padding: '1.5rem',
    borderRadius: '8px',
    boxShadow: 'var(--shadow-md)',
  },
  title: {
    fontSize: '1.875rem',
    fontWeight: 'bold',
    color: 'var(--c-text)',
    margin: 0,
  },
  subtitle: {
    color: 'var(--c-text-muted)',
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
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  menuOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  dropdown: {
    position: 'absolute',
    right: 0,
    top: '100%',
    marginTop: '0.5rem',
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    boxShadow: 'var(--shadow-md)',
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
    borderTop: '1px solid var(--c-border)',
    textAlign: 'left',
    cursor: 'pointer',
    fontSize: '1rem',
    color: 'var(--c-danger-text)',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  activeTab: {
    padding: '0.75rem 1.5rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: '1px solid var(--c-accent)',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500',
  },
  content: {
    backgroundColor: 'var(--c-surface)',
    borderRadius: '8px',
    padding: '1.5rem',
    boxShadow: 'var(--shadow-md)',
  },
};
