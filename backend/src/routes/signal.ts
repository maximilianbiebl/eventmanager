import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { signalService } from '../services/signal';
import * as QRCode from 'qrcode';

const router = Router();

/**
 * Alle User: Prüfe ob Signal-CLI Service verfügbar ist
 */
router.get('/health', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const isHealthy = await signalService.checkHealth();
    res.json({
      available: isHealthy,
      message: isHealthy ? 'Signal-CLI is available' : 'Signal-CLI is not reachable'
    });
  } catch (error: any) {
    console.error('Signal health check error:', error);
    res.json({
      available: false,
      message: 'Signal-CLI health check failed'
    });
  }
});

/**
 * Teamleiter/Admin: Signal-Account einrichten - Generiert QR-Code für Linking
 */
router.post('/setup', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Generiere temporäre Account-Nummer (wird später durch echte ersetzt)
    const accountNumber = `+temp${userId}${Date.now()}`;

    // Registriere Account und hole QR-Code-Bild direkt von Signal-CLI
    const qrCodeDataUrl = await signalService.registerAccount(accountNumber);

    // Speichere temporär in Datenbank
    await query(
      'UPDATE users SET signal_account_number = $1, signal_linked = false WHERE id = $2',
      [accountNumber, userId]
    );

    res.json({
      qrCode: qrCodeDataUrl,
      linkUri: qrCodeDataUrl,  // Gleiche Data URL für Kompatibilität
      accountNumber: accountNumber,
      message: 'Scannen Sie den QR-Code mit Signal auf Ihrem Handy'
    });
  } catch (error: any) {
    console.error('Signal setup error:', error);
    res.status(500).json({
      error: 'Fehler beim Einrichten von Signal',
      details: error.message
    });
  }
});

/**
 * Teamleiter/Admin: Prüfe ob Account erfolgreich gelinkt wurde
 */
router.get('/check-link', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT signal_account_number, signal_linked FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].signal_account_number) {
      return res.json({ linked: false });
    }

    const user = userResult.rows[0];

    // Wenn bereits als gelinkt markiert, gib true zurück
    if (user.signal_linked) {
      return res.json({ linked: true, accountNumber: user.signal_account_number });
    }

    // Prüfe bei Signal-CLI ob ein Account gelinkt ist und hole echte Telefonnummer
    const realAccountNumber = await signalService.getLinkedAccountNumber();

    if (realAccountNumber) {
      // Aktualisiere Datenbank mit echter Telefonnummer
      await query(
        'UPDATE users SET signal_account_number = $1, signal_linked = true, signal_linked_at = NOW() WHERE id = $2',
        [realAccountNumber, userId]
      );

      return res.json({ linked: true, accountNumber: realAccountNumber });
    }

    res.json({ linked: false });
  } catch (error: any) {
    console.error('Signal check-link error:', error);
    res.status(500).json({ error: 'Fehler beim Prüfen der Verbindung' });
  }
});

/**
 * Teamleiter/Admin: Trenne Signal-Verbindung
 */
router.post('/unlink', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT signal_account_number FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length > 0 && userResult.rows[0].signal_account_number) {
      // Trenne bei Signal-CLI
      await signalService.unlinkAccount(userResult.rows[0].signal_account_number);
    }

    // Lösche aus Datenbank
    await query(
      'UPDATE users SET signal_account_number = NULL, signal_device_id = NULL, signal_linked = false, signal_linked_at = NULL WHERE id = $1',
      [userId]
    );

    res.json({ message: 'Signal-Verbindung wurde getrennt' });
  } catch (error: any) {
    console.error('Signal unlink error:', error);
    res.status(500).json({ error: 'Fehler beim Trennen der Verbindung' });
  }
});

/**
 * Teamleiter/Admin: Hole aktuellen Signal-Status
 */
router.get('/status', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT signal_account_number, signal_linked, signal_linked_at FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.json({ linked: false });
    }

    const user = userResult.rows[0];

    res.json({
      linked: user.signal_linked || false,
      accountNumber: user.signal_account_number,
      linkedAt: user.signal_linked_at
    });
  } catch (error: any) {
    console.error('Signal status error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen des Status' });
  }
});

/**
 * Alle User: Aktualisiere Signal-Benachrichtigungs-Einstellungen
 */
router.put('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { signal_enabled, signal_phone_number, web_push_enabled, teamleiter_status_notifications } = req.body;

    // Validiere Telefonnummer wenn Signal aktiviert
    if (signal_enabled && !signal_phone_number) {
      return res.status(400).json({ error: 'Telefonnummer ist erforderlich für Signal-Benachrichtigungen' });
    }

    await query(
      `UPDATE users
       SET signal_enabled = $1,
           signal_phone_number = $2,
           web_push_enabled = $3,
           teamleiter_status_notifications = $4
       WHERE id = $5`,
      [signal_enabled || false, signal_phone_number || null, web_push_enabled !== false, teamleiter_status_notifications !== false, userId]
    );

    res.json({ message: 'Benachrichtigungs-Einstellungen aktualisiert' });
  } catch (error: any) {
    console.error('Signal settings update error:', error);
    res.status(500).json({ error: 'Fehler beim Aktualisieren der Einstellungen' });
  }
});

/**
 * Alle User: Hole aktuelle Benachrichtigungs-Einstellungen
 */
router.get('/settings', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT signal_enabled, signal_phone_number, web_push_enabled, teamleiter_status_notifications FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User nicht gefunden' });
    }

    res.json({
      signal_enabled: userResult.rows[0].signal_enabled || false,
      signal_phone_number: userResult.rows[0].signal_phone_number || '',
      web_push_enabled: userResult.rows[0].web_push_enabled !== false,
      teamleiter_status_notifications: userResult.rows[0].teamleiter_status_notifications !== false
    });
  } catch (error: any) {
    console.error('Signal settings get error:', error);
    res.status(500).json({ error: 'Fehler beim Abrufen der Einstellungen' });
  }
});

/**
 * Teamleiter/Admin: Sende Test-Nachricht
 */
router.post('/test', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const { toNumber } = req.body;

    if (!toNumber) {
      return res.status(400).json({ error: 'Telefonnummer ist erforderlich' });
    }

    const userResult = await query(
      'SELECT signal_account_number, signal_linked FROM users WHERE id = $1',
      [userId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].signal_linked) {
      return res.status(400).json({ error: 'Signal-Account ist nicht verbunden' });
    }

    const success = await signalService.sendTestMessage(
      userResult.rows[0].signal_account_number,
      toNumber
    );

    if (success) {
      res.json({ message: 'Test-Nachricht wurde gesendet' });
    } else {
      res.status(500).json({ error: 'Fehler beim Senden der Test-Nachricht' });
    }
  } catch (error: any) {
    console.error('Signal test error:', error);
    res.status(500).json({ error: 'Fehler beim Senden der Test-Nachricht' });
  }
});

export default router;
