import React, { useState, useEffect } from 'react';
import { signalApi, SignalStatus, SignalSetupResponse } from '../../api/signal';
import styles from './SignalSetup.module.css';

export const SignalSetup: React.FC = () => {
  const [status, setStatus] = useState<SignalStatus | null>(null);
  const [setup, setSetup] = useState<SignalSetupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [message, setMessage] = useState('');
  const [testNumber, setTestNumber] = useState('');

  useEffect(() => {
    loadStatus();
  }, []);

  useEffect(() => {
    // Auto-check für Linking-Status wenn QR-Code angezeigt
    if (setup && !status?.linked) {
      const interval = setInterval(() => {
        checkLinkStatus();
      }, 3000); // Alle 3 Sekunden prüfen

      return () => clearInterval(interval);
    }
  }, [setup, status]);

  const loadStatus = async () => {
    try {
      const data = await signalApi.getStatus();
      setStatus(data);
    } catch (error) {
      console.error('Load status error:', error);
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    setMessage('');
    setSetup(null);

    try {
      const data = await signalApi.setup();
      setSetup(data);
      setMessage('');
    } catch (error: any) {
      console.error('Setup error:', error);
      setMessage('❌ Fehler beim Einrichten: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  const checkLinkStatus = async () => {
    if (checking) return;

    setChecking(true);
    try {
      const data = await signalApi.checkLink();
      if (data.linked) {
        setStatus({ linked: true, accountNumber: data.accountNumber });
        setSetup(null);
        setMessage('✅ Signal erfolgreich verbunden!');
        setTimeout(() => setMessage(''), 5000);
      }
    } catch (error) {
      console.error('Check link error:', error);
    } finally {
      setChecking(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Signal-Verbindung wirklich trennen?')) return;

    setLoading(true);
    setMessage('');

    try {
      await signalApi.unlink();
      setStatus({ linked: false });
      setMessage('✅ Signal-Verbindung getrennt');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Unlink error:', error);
      setMessage('❌ Fehler beim Trennen: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNumber) {
      setMessage('❌ Bitte Telefonnummer eingeben');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await signalApi.sendTest(testNumber);
      setMessage('✅ Test-Nachricht gesendet!');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Send test error:', error);
      setMessage('❌ Fehler beim Senden: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Signal Einrichtung</h2>
      <p className={styles.description}>
        Verbinden Sie Ihren Signal-Account, um Benachrichtigungen an Ihre Mitarbeiter zu senden.
      </p>

      {!status?.linked && !setup && (
        <div className={styles.section}>
          <p>Sie haben noch keinen Signal-Account verbunden.</p>
          <button
            onClick={handleSetup}
            disabled={loading}
            className={styles.setupButton}
          >
            {loading ? 'Lädt...' : 'Signal einrichten'}
          </button>
        </div>
      )}

      {setup && !status?.linked && (
        <div className={styles.section}>
          <h3>Scannen Sie den QR-Code mit Signal</h3>
          <div className={styles.qrCodeContainer}>
            <img src={setup.qrCode} alt="Signal QR Code" className={styles.qrCode} />
          </div>
          <div className={styles.instructions}>
            <p><strong>So verbinden Sie Ihr Gerät:</strong></p>
            <ol>
              <li>Öffnen Sie Signal auf Ihrem Handy</li>
              <li>Gehen Sie zu Einstellungen → Verknüpfte Geräte</li>
              <li>Tippen Sie auf "Gerät hinzufügen"</li>
              <li>Scannen Sie diesen QR-Code</li>
            </ol>
          </div>
          <div className={styles.checkingStatus}>
            <div className={styles.spinner}></div>
            <span>Warte auf Verbindung...</span>
          </div>
        </div>
      )}

      {status?.linked && (
        <div className={styles.section}>
          <div className={styles.connectedStatus}>
            <div className={styles.statusIcon}>✅</div>
            <div>
              <h3>Signal verbunden</h3>
              <p className={styles.accountInfo}>
                Account: {status.accountNumber}
              </p>
              {status.linkedAt && (
                <p className={styles.linkedDate}>
                  Verbunden seit: {new Date(status.linkedAt).toLocaleString('de-DE')}
                </p>
              )}
            </div>
          </div>

          <div className={styles.testSection}>
            <h4>Test-Nachricht senden</h4>
            <div className={styles.testForm}>
              <input
                type="tel"
                placeholder="+491234567890"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                className={styles.input}
              />
              <button
                onClick={handleSendTest}
                disabled={loading}
                className={styles.testButton}
              >
                {loading ? 'Sende...' : 'Test senden'}
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button
              onClick={handleUnlink}
              disabled={loading}
              className={styles.unlinkButton}
            >
              {loading ? 'Trenne...' : 'Verbindung trennen'}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={message.startsWith('✅') ? styles.success : styles.error}>
          {message}
        </div>
      )}
    </div>
  );
};
