import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';
import { signalApi } from '../api/signal';
import { SignalSetup } from './settings/SignalSetup';
import { ThemeSwitch } from './ThemeSwitch';

interface Settings {
  default_reminder_minutes: number;
  push_enabled: boolean;
  default_view: 'cards' | 'table';
  start_notification_enabled: boolean;
  signal_enabled?: boolean;
  signal_phone_number?: string;
  web_push_enabled?: boolean;
  teamleiter_status_notifications?: boolean;
}

interface Props {
  onClose: () => void;
}

export const StaffSettings: React.FC<Props> = ({ onClose }) => {
  const [settings, setSettings] = useState<Settings>({
    default_reminder_minutes: 15,
    push_enabled: true,
    default_view: 'cards',
    start_notification_enabled: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [testSuccess, setTestSuccess] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'signal'>('general');
  const { user } = useAuth();
  const notifications = useNotifications();

  const isTeamleiterOrAdmin = user?.role === 'teamleiter' || user?.role === 'admin';

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const [userSettings, signalSettings] = await Promise.all([
        client.get('/users/me/settings'),
        signalApi.getSettings(),
      ]);
      setSettings({
        ...userSettings.data,
        signal_enabled: signalSettings.signal_enabled,
        signal_phone_number: signalSettings.signal_phone_number,
        web_push_enabled: signalSettings.web_push_enabled,
        teamleiter_status_notifications: signalSettings.teamleiter_status_notifications !== false,
      });
    } catch (error) {
      console.error('Load settings error:', error);
      setError('Fehler beim Laden der Einstellungen');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validierung
    if (settings.signal_enabled && !settings.signal_phone_number) {
      setError('Telefonnummer ist erforderlich für Signal-Benachrichtigungen');
      return;
    }

    if (settings.signal_enabled && !settings.signal_phone_number?.startsWith('+')) {
      setError('Telefonnummer muss im internationalen Format sein (z.B. +4917...)');
      return;
    }

    setSaving(true);

    try {
      await Promise.all([
        client.put('/users/me/settings', settings),
        signalApi.updateSettings({
          signal_enabled: settings.signal_enabled || false,
          signal_phone_number: settings.signal_phone_number || '',
          web_push_enabled: settings.web_push_enabled !== false,
          teamleiter_status_notifications: settings.teamleiter_status_notifications !== false,
        }),
      ]);
      setSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error: any) {
      console.error('Save settings error:', error);
      setError(error.response?.data?.error || 'Fehler beim Speichern');
    } finally {
      setSaving(false);
    }
  };

  const handleTestNotification = async () => {
    try {
      await notifications.sendTestNotification();
      setTestSuccess(true);
      setTimeout(() => setTestSuccess(false), 3000);
    } catch (error) {
      console.error('Test notification error:', error);
      setError('Fehler beim Senden der Test-Benachrichtigung');
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  if (loading) {
    return (
      <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
        <div className="app-modal" style={styles.modal}>
          <p>Lade Einstellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-modal-overlay" style={styles.overlay} onClick={handleOverlayClick}>
      <div className="app-modal" style={styles.modal}>
        <h2 style={styles.title}>Einstellungen</h2>
        <p style={styles.subtitle}>
          Hallo {user?.name}, hier kannst du deine Einstellungen anpassen.
        </p>

        {isTeamleiterOrAdmin && (
          <div style={styles.tabs}>
            <button
              type="button"
              onClick={() => setActiveTab('general')}
              style={activeTab === 'general' ? styles.tabActive : styles.tab}
            >
              Allgemein
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('signal')}
              style={activeTab === 'signal' ? styles.tabActive : styles.tab}
            >
              Signal Setup
            </button>
          </div>
        )}

        {activeTab === 'signal' && isTeamleiterOrAdmin ? (
          <SignalSetup />
        ) : (
          <>
            {error && <div style={styles.error}>{error}</div>}
            {success && <div style={styles.success}>Einstellungen gespeichert!</div>}

            <form onSubmit={handleSave}>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Benachrichtigungen</h3>
            <p style={{...styles.hint, marginBottom: '1rem', fontSize: '0.875rem'}}>
              Diese Einstellungen gelten für <strong>Web-Push</strong> und <strong>Signal</strong> Benachrichtigungen.
            </p>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.push_enabled}
                  onChange={(e) => setSettings({ ...settings, push_enabled: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>Browser-Benachrichtigungen aktivieren</span>
              </label>
              <p style={styles.hint}>
                Du erhältst Benachrichtigungen im Browser vor deinen Aufgaben
              </p>

              {!notifications.isSubscribed && settings.push_enabled && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={async () => {
                      const success = await notifications.subscribe();
                      if (success) {
                        alert('Benachrichtigungen aktiviert!');
                      } else {
                        alert('Benachrichtigungen konnten nicht aktiviert werden. Bitte prüfen Sie die Browser-Einstellungen.');
                      }
                    }}
                    style={styles.subscribeButton}
                  >
                    Browser-Berechtigung erteilen
                  </button>
                  <p style={{ ...styles.hint, marginTop: '0.5rem' }}>
                    Klicken Sie hier, um dem Browser die Berechtigung zum Senden von Benachrichtigungen zu erteilen.
                  </p>
                </div>
              )}

              {notifications.isSubscribed && settings.push_enabled && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    style={styles.testButton}
                  >
                    Test-Nachricht senden
                  </button>
                  {testSuccess && (
                    <p style={{ ...styles.hint, color: 'var(--c-success-text)', marginTop: '0.5rem' }}>
                      ✓ Test-Benachrichtigung gesendet!
                    </p>
                  )}
                </div>
              )}
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Standard-Erinnerungszeit (Minuten vor Aufgabe)
              </label>
              <input
                type="number"
                min="0"
                max="1440"
                value={settings.default_reminder_minutes}
                onChange={(e) =>
                  setSettings({ ...settings, default_reminder_minutes: parseInt(e.target.value) })
                }
                style={styles.input}
              />
              <p style={styles.hint}>
                Wie viele Minuten vorher möchtest du erinnert werden? (0 = keine Erinnerung)
                Gilt für Browser- und Signal-Benachrichtigungen.
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.start_notification_enabled}
                  onChange={(e) => setSettings({ ...settings, start_notification_enabled: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>"Aufgabe startet jetzt"-Benachrichtigung</span>
              </label>
              <p style={styles.hint}>
                Du erhältst eine zusätzliche Benachrichtigung zur genauen Startzeit, wenn die Aufgabe noch nicht begonnen wurde
                (Browser und Signal)
              </p>
            </div>

            {isTeamleiterOrAdmin && (
              <div style={styles.formGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={settings.teamleiter_status_notifications !== false}
                    onChange={(e) => setSettings({ ...settings, teamleiter_status_notifications: e.target.checked })}
                    style={styles.checkbox}
                  />
                  <span>Status-Änderungen von Mitarbeitern</span>
                </label>
                <p style={styles.hint}>
                  Du erhältst Benachrichtigungen wenn Mitarbeiter Aufgaben-Status ändern (In Arbeit, Erledigt, Überfällig)
                  (Browser und Signal)
                </p>
              </div>
            )}

            <div style={{ ...styles.formGroup, borderTop: '1px solid var(--c-border)', paddingTop: '1rem', marginTop: '1.5rem' }}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.signal_enabled || false}
                  onChange={(e) => setSettings({ ...settings, signal_enabled: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>Signal Benachrichtigungen aktivieren</span>
              </label>
              <p style={styles.hint}>
                Erhalte Benachrichtigungen via Signal Messenger.
                {isTeamleiterOrAdmin && ' Der Teamleiter muss Signal gekoppelt haben (siehe "Signal Setup" Tab).'}
              </p>
              {settings.signal_enabled && (
                <div style={{ marginTop: '0.75rem' }}>
                  <label style={styles.label}>Deine Telefonnummer (international):</label>
                  <input
                    type="tel"
                    placeholder="+491234567890"
                    value={settings.signal_phone_number || ''}
                    onChange={(e) => setSettings({ ...settings, signal_phone_number: e.target.value })}
                    style={styles.input}
                  />
                  <p style={styles.hint}>
                    Format: +49 für Deutschland, +43 für Österreich, +41 für Schweiz<br/>
                    <strong>Wichtig:</strong> An diese Nummer werden deine Aufgaben-Benachrichtigungen gesendet.
                  </p>
                </div>
              )}
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Ansicht</h3>

            {/* Auch hier erreichbar, weil der User-Bereich auf dem Desktop
                kein Menü hat - dort gibt es nur diesen Dialog. */}
            <div style={styles.formGroup}>
              <ThemeSwitch />
              <p style={styles.hint}>
                "System" folgt der Einstellung deines Geräts.
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>
                Standard-Ansicht für Aufgabenliste
              </label>
              <select
                value={settings.default_view}
                onChange={(e) => setSettings({ ...settings, default_view: e.target.value as 'cards' | 'table' })}
                style={styles.input}
              >
                <option value="cards">Karten</option>
                <option value="table">Tabelle</option>
              </select>
              <p style={styles.hint}>
                Wähle deine bevorzugte Ansicht für die Aufgabenliste
              </p>
            </div>
          </div>

          <div style={styles.infoBox}>
            <strong>Hinweis:</strong>
            <p style={styles.infoText}>
              Diese Einstellung gilt als Standard für neue Aufgaben. Bei einzelnen Aufgaben kann
              die Erinnerungszeit individuell angepasst werden.
            </p>
          </div>

          <div className="app-modal-actions" style={styles.buttons}>
            <button
              type="button"
              onClick={onClose}
              style={styles.cancelButton}
              disabled={saving}
            >
              Abbrechen
            </button>
            <button type="submit" style={styles.submitButton} disabled={saving}>
              {saving ? 'Wird gespeichert...' : 'Speichern'}
            </button>
          </div>
        </form>
          </>
        )}
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
    padding: '1rem',
  },
  modal: {
    backgroundColor: 'var(--c-surface)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '8px',
    padding: '2rem',
    maxWidth: '500px',
    width: '100%',
    maxHeight: '90vh',
    overflow: 'auto',
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: 'var(--c-text)',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    marginBottom: '1.5rem',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-danger-soft)',
    color: 'var(--c-danger-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  success: {
    padding: '0.75rem',
    backgroundColor: 'var(--c-success-soft)',
    color: 'var(--c-success-strong)',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  section: {
    marginBottom: '1.5rem',
  },
  sectionTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: 'var(--c-text)',
  },
  formGroup: {
    marginBottom: '1.5rem',
  },
  label: {
    display: 'block',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: 'var(--c-text)',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
    color: 'var(--c-text)',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '0.5rem',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    color: 'var(--c-text)',
  },
  hint: {
    fontSize: '0.875rem',
    color: 'var(--c-text-muted)',
    marginTop: '0.25rem',
  },
  infoBox: {
    backgroundColor: 'var(--c-accent-soft)',
    border: '1px solid var(--c-accent-soft)',
    borderRadius: '4px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  infoText: {
    fontSize: '0.875rem',
    color: 'var(--c-accent-text)',
    margin: '0.5rem 0 0 0',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
  },
  cancelButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'transparent',
    color: 'var(--c-text)',
    border: '1px solid var(--c-border-strong)',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'all 0.2s',
  },
  submitButton: {
    padding: '0.625rem 1.25rem',
    backgroundColor: 'var(--c-accent)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '1rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  testButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-success)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  subscribeButton: {
    padding: '0.5rem 1rem',
    backgroundColor: 'var(--c-warning)',
    color: 'var(--c-text-inverse)',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: '500',
    transition: 'background-color 0.2s',
  },
  tabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    borderBottom: '2px solid var(--c-border-strong)',
  },
  tab: {
    padding: '0.75rem 1.5rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    cursor: 'pointer',
    fontSize: '1rem',
    color: 'var(--c-text-muted)',
    fontWeight: '500',
    transition: 'color 0.2s',
  },
  tabActive: {
    padding: '0.75rem 1.5rem',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid var(--c-accent)',
    cursor: 'pointer',
    fontSize: '1rem',
    color: 'var(--c-accent-text)',
    fontWeight: '600',
  },
};
