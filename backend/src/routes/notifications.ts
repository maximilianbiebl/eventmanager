import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, AuthRequest } from '../middleware/auth';
import webpush from 'web-push';
import config from '../config';

const router = Router();

// VAPID Keys konfigurieren
if (config.vapid.publicKey && config.vapid.privateKey) {
  webpush.setVapidDetails(config.vapid.subject, config.vapid.publicKey, config.vapid.privateKey);
}

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
