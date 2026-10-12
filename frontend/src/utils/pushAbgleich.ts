import { notificationsApi } from '../api/notifications';

/*
 * Push-Anmeldung dieses Geraets mit dem Server abgleichen.
 *
 * Vorher meldete sich ein Geraet genau einmal an - beim Klick auf
 * "Benachrichtigungen aktivieren". Hatte der Server es danach ausgetragen
 * (abgelaufene Anmeldung beim Push-Dienst, anderes Konto auf demselben
 * Handy), zeigte die App weiter "aktiviert", und es kam nichts mehr an.
 *
 * Jetzt bei jedem Start mit Anmeldung: Ist die Erlaubnis erteilt, wird die
 * Anmeldung des Browsers an den Server geschickt (er legt sie an oder
 * frischt sie auf) - und fehlt sie im Browser, wird sie neu angelegt. Ohne
 * Erlaubnis passiert nichts; fragen darf nur ein Klick.
 */

const unterstuetzt = () =>
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

const mitFrist = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
  Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), ms))]);

const base64ZuBytes = (b64: string) => {
  const rein = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const roh = window.atob(rein);
  return Uint8Array.from(roh, (c) => c.charCodeAt(0));
};

export const pushAbgleichen = async (): Promise<void> => {
  try {
    if (!unterstuetzt() || Notification.permission !== 'granted') return;
    const reg = await mitFrist(navigator.serviceWorker.ready, 10_000);
    if (!reg) return;
    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      const schluessel = await notificationsApi.getVapidPublicKey();
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ZuBytes(schluessel) });
    }
    await notificationsApi.subscribe(sub);
  } catch (e) {
    console.warn('Push-Abgleich fehlgeschlagen:', e);
  }
};

/**
 * Beim Abmelden: dieses Geraet beim Server austragen - sonst bekaeme es
 * weiter die Meldungen des abgemeldeten Kontos. Die Erlaubnis im Browser
 * bleibt; wer sich wieder anmeldet, wird beim Abgleich neu eingetragen.
 */
export const pushAustragen = async (token: string | null): Promise<void> => {
  try {
    if (!unterstuetzt() || !token) return;
    const reg = await mitFrist(navigator.serviceWorker.ready, 2_000);
    const sub = reg ? await reg.pushManager.getSubscription() : null;
    if (!sub) return;
    /*
     * Mit dem Ausweis von eben, nicht ueber den gemeinsamen Client: der
     * liest die Anmeldung aus dem Speicher, und die ist beim Abmelden
     * schon geloescht.
     */
    await mitFrist(fetch(`${import.meta.env.VITE_API_URL || '/api'}/notifications/unsubscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    }), 3_000);
  } catch {
    /* Abmelden darf daran nicht scheitern */
  }
};
