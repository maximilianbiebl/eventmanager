import { Router } from 'express';
import { query } from '../database/connection';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { darfEventVerwalten } from '../middleware/eventAccess';

/*
 * Aenderungsprotokoll lesen - geschrieben wird es in utils/protokoll.
 *
 *   GET  /event/:eventId   Verlauf einer Veranstaltung (Leitung, Admins)
 *   GET  /neu              Was andere in MEINEN Veranstaltungen geaendert
 *                          haben, seit ich zuletzt da war
 *   POST /aktiv            "Ich bin da" - die App meldet sich, solange sie
 *                          offen ist; daran misst sich "seit zuletzt"
 */

const router = Router();

router.get('/event/:eventId', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const eventId = Number(req.params.eventId);
    if (!(await darfEventVerwalten(req.user!, eventId))) {
      return res.status(403).json({ error: 'Keine Berechtigung für diese Veranstaltung' });
    }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 100));
    // Zum Nachladen: nur Eintraege, die aelter sind als dieser.
    const vor = Number(req.query.vor) || null;

    const r = await query(
      `SELECT id, user_id, user_name, zeit, art, text, task_id
       FROM aenderungen
       WHERE event_id = $1 AND ($2::int IS NULL OR id < $2)
       ORDER BY id DESC
       LIMIT $3`,
      [eventId, vor, limit + 1]
    );
    res.json({ eintraege: r.rows.slice(0, limit), mehr: r.rows.length > limit });
  } catch (error) {
    console.error('Aenderungen event error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

/*
 * "Waehrend du weg warst": Aenderungen anderer an Veranstaltungen, die ich
 * leite (Ersteller oder Co-Leitung) - auch fuer Admins nur diese, sonst
 * saehen sie jede Kleinigkeit aus jeder Veranstaltung.
 *
 * Wer zum ersten Mal kommt (noch kein zuletzt_aktiv_am), bekommt nichts -
 * sonst kaeme beim ersten Anmelden das ganze bisherige Protokoll.
 */
router.get('/neu', authMiddleware, teamleiterOrAdminMiddleware, async (req: AuthRequest, res) => {
  try {
    const userId = req.user!.id;
    const u = await query('SELECT zuletzt_aktiv_am FROM users WHERE id = $1', [userId]);
    const seit = u.rows[0]?.zuletzt_aktiv_am;
    if (!seit) return res.json({ seit: null, veranstaltungen: [], gesamt: 0 });

    const r = await query(
      `SELECT a.id, a.event_id, e.name AS event_name, a.user_name, a.zeit, a.art, a.text
       FROM aenderungen a
       JOIN events e ON e.id = a.event_id
       WHERE a.zeit > $2
         AND (a.user_id IS NULL OR a.user_id <> $1)
         AND (e.created_by = $1 OR EXISTS (
               SELECT 1 FROM event_teamleiter et WHERE et.event_id = e.id AND et.user_id = $1))
       ORDER BY a.zeit DESC
       LIMIT 301`,
      [userId, seit]
    );

    const gesamt = r.rows.length > 300 ? 300 : r.rows.length;
    const nachEvent = new Map<number, { event_id: number; event_name: string; eintraege: any[] }>();
    for (const z of r.rows.slice(0, 300)) {
      if (!nachEvent.has(z.event_id)) nachEvent.set(z.event_id, { event_id: z.event_id, event_name: z.event_name, eintraege: [] });
      nachEvent.get(z.event_id)!.eintraege.push({ id: z.id, user_name: z.user_name, zeit: z.zeit, art: z.art, text: z.text });
    }
    res.json({ seit, veranstaltungen: [...nachEvent.values()], gesamt, mehr: r.rows.length > 300 });
  } catch (error) {
    console.error('Aenderungen neu error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

router.post('/aktiv', authMiddleware, async (req: AuthRequest, res) => {
  try {
    await query('UPDATE users SET zuletzt_aktiv_am = NOW() WHERE id = $1', [req.user!.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Aenderungen aktiv error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
