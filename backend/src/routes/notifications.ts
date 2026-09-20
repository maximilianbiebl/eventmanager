import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import webpush from 'web-push';
import jwt from 'jsonwebtoken';
import config from '../config';

const router = Router();

// VAPID Keys konfigurieren
if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

/*
 * "Spaeter nochmal" direkt aus der Benachrichtigung.
 *
 * Der Service Worker hat keine angemeldete Sitzung - er kommt an das
 * Anmeldetoken im Browser nicht heran. Deshalb traegt jede
 * Benachrichtigung eine eigene kurzlebige Marke bei sich, die genau zwei
 * Dinge erlaubt: diese eine Zuweisung, dieses eine Verschieben. Sie laeuft
 * nach zwoelf Stunden ab.
 *
 * Kein authMiddleware - die Marke IST der Ausweis.
 */
const SCHLUMMER_MINUTEN = [15, 30, 60, 120];

router.post('/schlummer', async (req, res) => {
  try {
    const { marke, minuten } = req.body ?? {};
    const zahl = Number(minuten);

    if (!SCHLUMMER_MINUTEN.includes(zahl)) {
      return res.status(400).json({ error: 'Nur 15, 30, 60 oder 120 Minuten' });
    }

    let inhalt: any;
    try {
      inhalt = jwt.verify(String(marke ?? ''), config.jwt.secret);
    } catch {
      return res.status(401).json({ error: 'Marke ungültig oder abgelaufen' });
    }
    if (inhalt?.typ !== 'schlummer' || !inhalt.assignmentId) {
      return res.status(401).json({ error: 'Marke gilt nicht dafür' });
    }

    const ziel = new Date(Date.now() + zahl * 60000);
    const ergebnis = await query(
      `UPDATE task_assignments SET reminder_at = $1
       WHERE id = $2 AND user_id = $3 AND completed = false
       RETURNING id, reminder_at`,
      [ziel, inhalt.assignmentId, inhalt.userId]
    );

    if (ergebnis.rows.length === 0) {
      // Erledigt oder inzwischen weg - kein Fehler, nur nichts zu tun.
      return res.status(404).json({ error: 'Zuweisung nicht gefunden oder schon erledigt' });
    }

    console.log(`[Schlummer] Zuweisung ${inhalt.assignmentId} erinnert erneut um ${ziel.toISOString()}`);
    res.json({ reminder_at: ergebnis.rows[0].reminder_at });
  } catch (error) {
    console.error('Schlummer error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Push Subscription speichern
router.post('/subscribe', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { endpoint, keys } = req.body;
    const userId = req.user!.id;

    // Prüfen ob bereits existiert
    const existing = await query('SELECT * FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [
      userId,
      endpoint,
    ]);

    if (existing.rows.length === 0) {
      await query(
        'INSERT INTO push_subscriptions (user_id, endpoint, keys_p256dh, keys_auth) VALUES ($1, $2, $3, $4)',
        [userId, endpoint, keys.p256dh, keys.auth]
      );
    }

    res.json({ message: 'Subscription gespeichert' });
  } catch (error) {
    console.error('Subscribe error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// Push Subscription entfernen
router.post('/unsubscribe', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { endpoint } = req.body;
    const userId = req.user!.id;

    await query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2', [userId, endpoint]);

    res.json({ message: 'Subscription entfernt' });
  } catch (error) {
    console.error('Unsubscribe error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

// VAPID Public Key abrufen
router.get('/vapid-public-key', (req, res) => {
  res.json({ publicKey: config.vapid.publicKey });
});

// Test-Benachrichtigung senden
router.post('/test', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const subscriptions = await query('SELECT * FROM push_subscriptions WHERE user_id = $1', [userId]);

    const payload = JSON.stringify({
      title: 'Test Benachrichtigung',
      body: 'Dies ist eine Test-Benachrichtigung vom Event Manager',
      icon: '/icon.png',
    });

    const results = [];

    for (const sub of subscriptions.rows) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys_p256dh,
              auth: sub.keys_auth,
            },
          },
          payload
        );
        results.push({ success: true, endpoint: sub.endpoint });
      } catch (error: any) {
        console.error('Push notification error:', error);
        results.push({ success: false, endpoint: sub.endpoint, error: error.message });

        // Subscription entfernen wenn ungültig
        if (error.statusCode === 410) {
          await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
        }
      }
    }

    res.json({ results });
  } catch (error) {
    console.error('Test notification error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
