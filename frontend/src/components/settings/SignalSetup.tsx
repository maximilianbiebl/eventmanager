import React, { useState, useEffect, useRef } from 'react';
import { signalApi, SignalStatus, SignalSetupResponse } from '../../api/signal';
import styles from './SignalSetup.module.css';

/*
 * Signal koppeln, pruefen, trennen.
 *
 * Die Kopplung wird nicht mehr nur einmal festgestellt: der Server gleicht
 * regelmaessig ab, ob das Geraet in Signal noch verknuepft ist (siehe
 * backend services/signalKopplung). Ging sie verloren, steht das hier - und
 * beim Anmelden gibt es einen Hinweis.
 */

/** Nach dieser Zeit ohne Erfolg gibt es Hilfe zum Weiterkommen. */
const HILFE_NACH_MS = 90 * 1000;

export const SignalSetup: React.FC = () => {
  const [status, setStatus] = useState<SignalStatus | null>(null);
  const [setup, setSetup] = useState<SignalSetupResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [testNumber, setTestNumber] = useState('');
  const [wartetLange, setWartetLange] = useState(false);
  const [abgelaufen, setAbgelaufen] = useState(false);
  // Signal uebertraegt gerade die Daten vom Handy - siehe Backend
  // signalService.kontenBeschaeftigt. Dann ist Warten richtig, nicht Hilfe.
  const [richtetEin, setRichtetEin] = useState(false);
  const pruefe = useRef(false);

  useEffect(() => {
    loadStatus();
  }, []);

  // Solange der QR-Code steht: alle 3 Sekunden fragen, ob gekoppelt.
  useEffect(() => {
    if (!setup || status?.linked) return;
    setWartetLange(false);
    setRichtetEin(false);
    const hilfe = setTimeout(() => setWartetLange(true), HILFE_NACH_MS);
    const interval = setInterval(checkLinkStatus, 3000);
    return () => { clearInterval(interval); clearTimeout(hilfe); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup, status?.linked]);

  const loadStatus = async () => {
    try {
      setStatus(await signalApi.getStatus());
    } catch (error) {
      console.error('Load status error:', error);
    }
  };

  const handleSetup = async () => {
    setLoading(true);
    setMessage('');
    setSetup(null);
    setAbgelaufen(false);
    try {
      setSetup(await signalApi.setup());
    } catch (error: any) {
      console.error('Setup error:', error);
      const d = error.response?.data;
      setMessage('❌ ' + (d?.error || 'Signal konnte nicht eingerichtet werden') + (d?.details ? ` (${d.details})` : ''));
    } finally {
      setLoading(false);
    }
  };

  const checkLinkStatus = async () => {
    if (pruefe.current) return;
    pruefe.current = true;
    try {
      const data = await signalApi.checkLink();
      if (data.linked) {
        setStatus({ linked: true, accountNumber: data.accountNumber, linkedAt: new Date().toISOString() });
        setSetup(null);
        setMessage('✅ Signal ist verbunden.');
        setTimeout(() => setMessage(''), 5000);
      } else if (data.abgelaufen) {
        setSetup(null);
        setAbgelaufen(true);
      } else if (data.beschaeftigt) {
        setRichtetEin(true);
      }
    } catch (error) {
      console.error('Check link error:', error);
    } finally {
      pruefe.current = false;
    }
  };

  const handleUnlink = async () => {
    if (!confirm('Signal-Verbindung wirklich trennen?')) return;
    setLoading(true);
    setMessage('');
    try {
      await signalApi.unlink();
      setStatus({ linked: false });
      setMessage('✅ Verbindung getrennt. Entferne „Event Manager“ jetzt noch in Signal unter Einstellungen → Verknüpfte Geräte.');
    } catch (error: any) {
      console.error('Unlink error:', error);
      setMessage('❌ Fehler beim Trennen: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
    } finally {
      setLoading(false);
    }
  };

  const handleSendTest = async () => {
    if (!testNumber) {
      setMessage('❌ Bitte gib eine Telefonnummer ein.');
      return;
    }
    setLoading(true);
    setMessage('');
    try {
      await signalApi.sendTest(testNumber);
      setMessage('✅ Test-Nachricht gesendet.');
      setTimeout(() => setMessage(''), 3000);
    } catch (error: any) {
      console.error('Send test error:', error);
      setMessage('❌ Fehler beim Senden: ' + (error.response?.data?.error || 'Unbekannter Fehler'));
      // Scheitert der Versand, weil die Kopplung weg ist, weiss der Server
      // es jetzt - den Stand neu holen.
      loadStatus();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.container}>
      <h2>Signal einrichten</h2>
      <p className={styles.description}>
        Verbinde dein Signal, damit die App deinen Mitarbeitern Erinnerungen per Signal schicken kann.
      </p>

      {!status?.linked && status?.getrenntAm && !setup && (
        <div className={styles.error}>
          Deine Signal-Kopplung besteht nicht mehr (festgestellt am{' '}
          {new Date(status.getrenntAm).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}).
          Das passiert, wenn „Event Manager“ in Signal unter „Verknüpfte Geräte“ entfernt wurde.
          Bis du neu koppelst, gehen keine Signal-Nachrichten raus.
        </div>
      )}

      {!status?.linked && !setup && (
        <div className={styles.section}>
          {!status?.getrenntAm && <p>Du hast noch kein Signal verbunden.</p>}
          {abgelaufen && <p>Der QR-Code ist abgelaufen. Erzeuge einen neuen.</p>}
          <button onClick={handleSetup} disabled={loading} className={styles.setupButton}>
            {loading ? 'Lädt…' : status?.getrenntAm || abgelaufen ? 'Neu koppeln' : 'Signal einrichten'}
          </button>
        </div>
      )}

      {setup && !status?.linked && (
        <div className={styles.section}>
          <h3>Scanne den QR-Code mit Signal</h3>
          <div className={styles.qrCodeContainer}>
            <img src={setup.qrCode} alt="QR-Code zum Koppeln mit Signal" className={styles.qrCode} />
          </div>
          <div className={styles.instructions}>
            <p><strong>So verbindest du dein Handy:</strong></p>
            <ol>
              <li>Öffne Signal auf deinem Handy.</li>
              <li>Geh zu Einstellungen → Verknüpfte Geräte.</li>
              <li>Tippe auf „Gerät hinzufügen“ (bzw. „+“).</li>
              <li>Scanne diesen QR-Code.</li>
            </ol>
          </div>
          <div className={styles.checkingStatus}>
            <div className={styles.spinner}></div>
            <span>{richtetEin ? 'Verbindung wird eingerichtet…' : 'Warte auf Verbindung…'}</span>
          </div>
          {richtetEin && (
            <p className={styles.einrichtenHinweis}>
              Dein Handy hat den Code gescannt. Signal überträgt jetzt die Daten – das kann ein, zwei Minuten
              dauern. Lass diese Seite so lange offen.
            </p>
          )}
          {wartetLange && !richtetEin && (
            <div className={styles.instructions}>
              <p><strong>Es dauert ungewöhnlich lange.</strong></p>
              <ul>
                <li>Zeigt Signal am Handy eine Fehlermeldung oder bleibt beim Verknüpfen hängen, ist der Signal-Dienst auf dem Server vermutlich veraltet. Sag der Person Bescheid, die den Server betreut.</li>
                <li>Steht „Event Manager“ am Handy schon unter „Verknüpfte Geräte“, warte noch einen Moment – das Übertragen kann eine Minute dauern.</li>
              </ul>
              <button onClick={handleSetup} disabled={loading} className={styles.setupButton}>
                Neuen QR-Code erzeugen
              </button>
            </div>
          )}
        </div>
      )}

      {status?.linked && (
        <div className={styles.section}>
          <div className={styles.connectedStatus}>
            <div className={styles.statusIcon}>✅</div>
            <div>
              <h3>Signal verbunden</h3>
              <p className={styles.accountInfo}>Nummer: {status.accountNumber}</p>
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
              <button onClick={handleSendTest} disabled={loading} className={styles.testButton}>
                {loading ? 'Sende…' : 'Test senden'}
              </button>
            </div>
          </div>

          <div className={styles.actions}>
            <button onClick={handleUnlink} disabled={loading} className={styles.unlinkButton}>
              {loading ? 'Trenne…' : 'Verbindung trennen'}
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
