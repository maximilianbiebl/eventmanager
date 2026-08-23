import React, { useState, useEffect } from 'react';
import { signalApi, SignalSettings } from '../../api/signal';
import styles from './NotificationSettings.module.css';

export const NotificationSettings: React.FC = () => {
  const [settings, setSettings] = useState<SignalSettings>({
    signal_enabled: false,
    signal_phone_number: '',
    web_push_enabled: true,
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const data = await signalApi.getSettings();
      setSettings(data);
    } catch (error) {
      console.error('Load settings error:', error);
    }
  };

  const handleSave = async () => {
    // Validierung
    if (settings.signal_enabled && !settings.signal_phone_number) {
      setMessage('❌ Telefonnummer ist erforderlich für Signal-Benachrichtigungen');
      return;
    }

    if (settings.signal_enabled && !settings.signal_phone_number.startsWith('+')) {
      setMessage('❌ Telefonnummer muss im internationalen Format sein (z.B. +4917...)');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await signalApi.updateSettings(settings);
      setMessage('✅ Einstellungen gespeichert');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Save settings error:', error);
      setMessage('❌ Fehler beim Speichern: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Benachrichtigungseinstellungen</h2>
      <p className={styles.description}>
        Wählen Sie, wie Sie Benachrichtigungen erhalten möchten:
      </p>

      <div className={styles.settingsGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.web_push_enabled}
            onChange={(e) => setSettings({ ...settings, web_push_enabled: e.target.checked })}
          />
          <span>Web Push Benachrichtigungen</span>
        </label>
        <p className={styles.hint}>Browser-Benachrichtigungen auf diesem Gerät</p>
      </div>

      <div className={styles.settingsGroup}>
        <label className={styles.checkboxLabel}>
          <input
            type="checkbox"
            checked={settings.signal_enabled}
            onChange={(e) => setSettings({ ...settings, signal_enabled: e.target.checked })}
          />
          <span>Signal Benachrichtigungen</span>
        </label>
        <p className={styles.hint}>Benachrichtigungen via Signal Messenger</p>

        {settings.signal_enabled && (
          <div className={styles.phoneInput}>
            <label>
              Telefonnummer (international):
              <input
                type="tel"
                placeholder="+491234567890"
                value={settings.signal_phone_number}
                onChange={(e) => setSettings({ ...settings, signal_phone_number: e.target.value })}
                className={styles.input}
              />
            </label>
            <p className={styles.hint}>
              Format: +49 für Deutschland, +43 für Österreich, +41 für Schweiz
            </p>
          </div>
        )}
      </div>

      <div className={styles.actions}>
        <button
          onClick={handleSave}
          disabled={loading}
          className={styles.saveButton}
        >
          {loading ? 'Speichern...' : 'Speichern'}
        </button>
      </div>

      {message && (
        <div className={message.startsWith('✅') ? styles.success : styles.error}>
          {message}
        </div>
      )}
    </div>
  );
};
