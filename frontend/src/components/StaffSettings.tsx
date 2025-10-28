import React, { useState, useEffect } from 'react';
import client from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useNotifications } from '../hooks/useNotifications';

interface Settings {
  default_reminder_minutes: number;
  push_enabled: boolean;
  default_view: 'cards' | 'table';
  start_notification_enabled: boolean;
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
  const { user } = useAuth();
  const notifications = useNotifications();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const response = await client.get('/users/me/settings');
      setSettings(response.data);
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
    setSaving(true);

    try {
      await client.put('/users/me/settings', settings);
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
      <div style={styles.overlay} onClick={handleOverlayClick}>
        <div style={styles.modal}>
          <p>Lade Einstellungen...</p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.overlay} onClick={handleOverlayClick}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Einstellungen</h2>
        <p style={styles.subtitle}>
          Hallo {user?.name}, hier kannst du deine Benachrichtigungs-Einstellungen anpassen.
        </p>

        {error && <div style={styles.error}>{error}</div>}
        {success && <div style={styles.success}>Einstellungen gespeichert!</div>}

        <form onSubmit={handleSave}>
          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Benachrichtigungen</h3>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.push_enabled}
                  onChange={(e) => setSettings({ ...settings, push_enabled: e.target.checked })}
                  style={styles.checkbox}
                />
                <span>Push-Benachrichtigungen aktivieren</span>
              </label>
              <p style={styles.hint}>
                Du erhältst Benachrichtigungen vor deinen Aufgaben
              </p>
              {notifications.isSubscribed && settings.push_enabled && (
                <div style={{ marginTop: '0.75rem' }}>
                  <button
                    type="button"
                    onClick={handleTestNotification}
                    style={styles.testButton}
                  >
                    📬 Test-Nachricht senden
                  </button>
                  {testSuccess && (
                    <p style={{ ...styles.hint, color: '#059669', marginTop: '0.5rem' }}>
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
                disabled={!settings.push_enabled}
              />
              <p style={styles.hint}>
                Wie viele Minuten vorher möchtest du erinnert werden? (0 = keine Erinnerung)
              </p>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={settings.start_notification_enabled}
                  onChange={(e) => setSettings({ ...settings, start_notification_enabled: e.target.checked })}
                  style={styles.checkbox}
                  disabled={!settings.push_enabled}
                />
                <span>"Aufgabe startet jetzt"-Benachrichtigung aktivieren</span>
              </label>
              <p style={styles.hint}>
                Du erhältst eine zusätzliche Benachrichtigung zur genauen Startzeit, wenn die Aufgabe noch nicht begonnen wurde
              </p>
            </div>
          </div>

          <div style={styles.section}>
            <h3 style={styles.sectionTitle}>Ansicht</h3>

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
            <strong>💡 Hinweis:</strong>
            <p style={styles.infoText}>
              Diese Einstellung gilt als Standard für neue Aufgaben. Bei einzelnen Aufgaben kann
              die Erinnerungszeit individuell angepasst werden.
            </p>
          </div>

          <div style={styles.buttons}>
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
    padding: '1rem',
  },
  modal: {
    backgroundColor: 'white',
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
    color: '#1f2937',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#6b7280',
    marginBottom: '1.5rem',
  },
  error: {
    padding: '0.75rem',
    backgroundColor: '#fee2e2',
    color: '#991b1b',
    borderRadius: '4px',
    marginBottom: '1rem',
  },
  success: {
    padding: '0.75rem',
    backgroundColor: '#d1fae5',
    color: '#065f46',
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
    color: '#374151',
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
  checkbox: {
    width: '20px',
    height: '20px',
    cursor: 'pointer',
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
  infoBox: {
    backgroundColor: '#eff6ff',
    border: '1px solid #bfdbfe',
    borderRadius: '4px',
    padding: '1rem',
    marginBottom: '1.5rem',
  },
  infoText: {
    fontSize: '0.875rem',
    color: '#1e40af',
    margin: '0.5rem 0 0 0',
  },
  buttons: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'flex-end',
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
  testButton: {
    padding: '0.5rem 1rem',
    backgroundColor: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    fontSize: '0.875rem',
    cursor: 'pointer',
    fontWeight: '500',
  },
};
