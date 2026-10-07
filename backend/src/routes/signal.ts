import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { signalService } from '../services/signal';
import { pruefeKopplungenGedrosselt } from '../services/signalKopplung';

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

/*
 * Wer gerade koppelt, mit den Konten, die signal-cli VORHER schon kannte.
 * Neu gekoppelt ist das Konto, das danach dazukommt. Nur im Speicher: nach
 * einem Neustart des Servers wird einfach neu gekoppelt.
 */
const laufendeKopplungen = new Map<number, { vorher: Set<string>; seit: number }>();
const KOPPLUNG_GUELTIG_MS = 10 * 60 * 1000;

/**
 * Teamleiter/Admin: Signal koppeln - erzeugt den QR-Code.
 */
router.post('/setup', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    // Reste einer verlorenen Kopplung derselben Person zuerst aufraeumen -
    // nur wenn signal-cli sie selbst nicht mehr fuer gueltig haelt.
    const alt = await query('SELECT signal_account_number FROM users WHERE id = $1', [userId]);
    const alteNummer = alt.rows[0]?.signal_account_number;
    if (alteNummer && !String(alteNummer).startsWith('+temp')) {
      await signalService.loescheLokaleDaten(alteNummer, false);
    }

    const { qrCode, vorher } = await signalService.startLink();
    laufendeKopplungen.set(userId, { vorher: new Set(vorher), seit: Date.now() });

    await query('UPDATE users SET signal_linked = false WHERE id = $1', [userId]);

    res.json({
      qrCode,
      linkUri: qrCode,
      accountNumber: '',
      message: 'Scanne den QR-Code mit Signal auf deinem Handy',
    });
  } catch (error: any) {
    console.error('Signal setup error:', error);
    res.status(500).json({
      error: 'Signal konnte nicht eingerichtet werden',
      details: error.message,
    });
  }
});

/**
 * Teamleiter/Admin: Ist die Kopplung inzwischen zustande gekommen?
 */
router.get('/check-link', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query(
      'SELECT signal_account_number, signal_linked FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.json({ linked: false });
    if (user.signal_linked) {
      return res.json({ linked: true, accountNumber: user.signal_account_number });
    }

    const laufend = laufendeKopplungen.get(userId);
    if (!laufend || Date.now() - laufend.seit > KOPPLUNG_GUELTIG_MS) {
      laufendeKopplungen.delete(userId);
      return res.json({ linked: false, abgelaufen: true });
    }

    const jetzt = await signalService.getAccounts();
    if (jetzt === null) return res.json({ linked: false });

    // Neu ist, was vor dem QR-Code noch nicht da war.
    const neu = jetzt.filter((n) => !laufend.vorher.has(n));
    if (neu.length === 0) return res.json({ linked: false });

    const nummer = neu[0];
    await query(
      `UPDATE users SET signal_account_number = $1, signal_linked = true,
                        signal_linked_at = NOW(), signal_getrennt_am = NULL
       WHERE id = $2`,
      [nummer, userId]
    );
    laufendeKopplungen.delete(userId);
    console.log(`[Signal] ${nummer} gekoppelt`);
    res.json({ linked: true, accountNumber: nummer });
  } catch (error: any) {
    console.error('Signal check-link error:', error);
    res.status(500).json({ error: 'Fehler beim Prüfen der Verbindung' });
  }
});

/**
 * Teamleiter/Admin: Signal-Verbindung trennen.
 *
 * Ein gekoppeltes Geraet kann sich nicht selbst aus dem Handy austragen.
 * Hier verschwinden die Daten in signal-cli; in Signal selbst entfernt man
 * "Event Manager" unter "Verknuepfte Geraete".
 */
router.post('/unlink', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;

    const userResult = await query('SELECT signal_account_number FROM users WHERE id = $1', [userId]);
    const nummer = userResult.rows[0]?.signal_account_number;

    // Nur loeschen, wenn niemand sonst dieselbe Nummer gekoppelt hat.
    if (nummer) {
      const andere = await query(
        'SELECT 1 FROM users WHERE signal_account_number = $1 AND id <> $2 AND signal_linked = true LIMIT 1',
        [nummer, userId]
      );
      if (andere.rows.length === 0) await signalService.loescheLokaleDaten(nummer, true);
    }

    await query(
      `UPDATE users SET signal_account_number = NULL, signal_device_id = NULL, signal_linked = false,
                        signal_linked_at = NULL, signal_getrennt_am = NULL
       WHERE id = $1`,
      [userId]
    );
    laufendeKopplungen.delete(userId);

    res.json({ message: 'Signal-Verbindung wurde getrennt' });
  } catch (error: any) {
    console.error('Signal unlink error:', error);
    res.status(500).json({ error: 'Fehler beim Trennen der Verbindung' });
  }
});

/**
 * Teamleiter/Admin: Aktueller Signal-Status.
 *
 * Prueft vorher (hoechstens einmal pro Minute), ob die Kopplungen noch
 * bestehen - sonst stuende hier weiter "verbunden", obwohl das Geraet in
 * Signal laengst entfernt ist.
 */
router.get('/status', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    await pruefeKopplungenGedrosselt();

    const userResult = await query(
      'SELECT signal_account_number, signal_linked, signal_linked_at, signal_getrennt_am FROM users WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];
    if (!user) return res.json({ linked: false });

    res.json({
      linked: user.signal_linked || false,
      accountNumber: user.signal_linked ? user.signal_account_number : undefined,
      linkedAt: user.signal_linked ? user.signal_linked_at : undefined,
      // Kopplung ging verloren und wurde noch nicht erneuert
      getrenntAm: !user.signal_linked && user.signal_getrennt_am ? user.signal_getrennt_am : undefined,
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
