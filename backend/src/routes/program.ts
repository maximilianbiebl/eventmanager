import { Router } from 'express';
import { query } from '../database/connection';
import { Response } from 'express';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { eventZugriff } from '../middleware/eventAccess';
import { broadcastUpdate } from './sse';
import { verschiebeZeile } from '../utils/reihenfolge';

/*
 * Aufgabengruppen.
 *
 * Eine Gruppe ist eine Zwischenueberschrift ueber zusammengehoerenden
 * Aufgaben: "Fruehstueck" mit "Essensausgabe" und "Tische wischen". Sie hat
 * einen Tag, einen Titel und wahlweise eine Uhrzeit.
 *
 * Die Tabelle heisst noch program_items - sie lag ungenutzt herum und passt
 * genau: tasks.program_item_id zeigt schon darauf. In der Oberflaeche heisst
 * sie "Aufgabengruppe".
 *
 * Zustaendig ist, wer auch die Veranstaltung verwaltet. Vorher stand hier
 * adminMiddleware, ohne Pruefung auf die Veranstaltung - eine Teamleitung
 * kam gar nicht dran, und der Admin haette jede fremde bearbeiten koennen.
 */
const router = Router();

/** Die Veranstaltung einer Gruppe - fuer die Zugriffspruefung. */
const eventIdVonGruppe = async (id: number | string): Promise<number | null> => {
  const r = await query('SELECT event_id FROM program_items WHERE id = $1', [id]);
  return r.rows.length > 0 ? r.rows[0].event_id : null;
};

/*
 * Uhrzeit ist optional. Aus dem Formular kommt fuer ein leeres Feld ein
 * leerer String - daraus darf kein ungueltiger Zeitwert werden.
 */
const zeitOderNull = (wert: unknown): string | null => {
  const s = String(wert ?? '').trim();
  return s === '' ? null : s;
};

/*
 * Gruppen einer Veranstaltung.
 *
 * Sortiert nach Tag, dann Uhrzeit, dann eigener Reihenfolge. Gruppen ohne
 * Uhrzeit stehen ans Ende ihres Tages - eine feste Zeit ist die staerkere
 * Aussage als "irgendwann an diesem Tag".
 */
router.get('/event/:eventId', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => req.params.eventId), async (req, res) => {
  try {
    const { eventId } = req.params;

    const result = await query(
      `SELECT pi.*,
              (SELECT COUNT(*) FROM tasks t WHERE t.program_item_id = pi.id) AS task_count
       FROM program_items pi
       WHERE pi.event_id = $1
       ORDER BY pi.day_number, pi.time NULLS LAST, pi.sort_order, pi.id`,
      [eventId]
    );

    res.json(result.rows);
  } catch (error) {
    console.error('Get task groups error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

router.post('/', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => req.body.event_id), async (req: AuthRequest, res) => {
  try {
    const { event_id, day_number, time, title, description } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Titel fehlt' });
    }

    // Ans Ende des Tages einsortieren.
    const max = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM program_items WHERE event_id = $1 AND day_number = $2',
      [event_id, day_number]
    );

    const result = await query(
      `INSERT INTO program_items (event_id, day_number, time, title, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [event_id, day_number, zeitOderNull(time), String(title).trim(), description || null, max.rows[0].m + 10]
    );

    broadcastUpdate('task', { action: 'group_created', eventId: Number(event_id) });
    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Create task group error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

router.put('/:id', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), async (req, res) => {
  try {
    const { id } = req.params;
    const vorher = await query('SELECT * FROM program_items WHERE id = $1', [id]);
    if (vorher.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabengruppe nicht gefunden' });
    }
    const alt = vorher.rows[0];

    // Nur mitgeschickte Felder aendern - so kann ein Aufruf auch nur die
    // Uhrzeit setzen, ohne den Rest zu ueberschreiben.
    const {
      day_number = alt.day_number,
      time = alt.time,
      title = alt.title,
      description = alt.description,
    } = req.body;

    const result = await query(
      `UPDATE program_items SET day_number = $1, time = $2, title = $3, description = $4
       WHERE id = $5 RETURNING *`,
      [day_number, zeitOderNull(time), String(title).trim(), description || null, id]
    );

    broadcastUpdate('task', { action: 'group_updated', eventId: alt.event_id });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Update task group error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

/*
 * Gruppen von Hand sortieren - innerhalb ihres Tages.
 *
 * Gruppen und gruppenlose Aufgaben teilen sich eine Zaehlung, eine Gruppe
 * laesst sich also auch ZWISCHEN zwei losen Aufgaben platzieren. Die Logik
 * dazu steht in utils/reihenfolge, weil die Aufgaben-Route dieselbe braucht.
 */
const verschiebe = (richtung: 'hoch' | 'runter') =>
  async (req: AuthRequest, res: Response) => {
    try {
      const { id } = req.params;
      const g = await query('SELECT * FROM program_items WHERE id = $1', [id]);
      if (g.rows.length === 0) {
        return res.status(404).json({ error: 'Aufgabengruppe nicht gefunden' });
      }
      const gruppe = g.rows[0];

      const ergebnis = await verschiebeZeile(
        gruppe.event_id, gruppe.day_number, 'gruppe', gruppe.id, richtung
      );

      if (ergebnis.bewegt) {
        broadcastUpdate('task', { action: 'group_moved', eventId: gruppe.event_id });
      }
      res.json({ message: ergebnis.meldung });
    } catch (error) {
      console.error('Move task group error:', error);
      res.status(500).json({ error: 'Server Fehler' });
    }
  };

router.put('/:id/move-up', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), verschiebe('hoch'));

router.put('/:id/move-down', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), verschiebe('runter'));

/*
 * Loeschen entfernt nur die Ueberschrift. Die Aufgaben bleiben und stehen
 * danach ungruppiert da - der Fremdschluessel setzt program_item_id auf NULL
 * (siehe Migration 021). Alles andere waere ein boeser Datenverlust: wer
 * eine Ueberschrift wegnimmt, will nicht die Arbeit darunter loeschen.
 */
router.delete('/:id', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), async (req, res) => {
  try {
    const { id } = req.params;

    const result = await query('DELETE FROM program_items WHERE id = $1 RETURNING *', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabengruppe nicht gefunden' });
    }

    broadcastUpdate('task', { action: 'group_deleted', eventId: result.rows[0].event_id });
    res.json({ message: 'Aufgabengruppe gelöscht, die Aufgaben bleiben erhalten' });
  } catch (error) {
    console.error('Delete task group error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

export default router;
