import { Router } from 'express';
import { query } from '../database/connection';
import { Response } from 'express';
import { authMiddleware, teamleiterOrAdminMiddleware, AuthRequest } from '../middleware/auth';
import { eventZugriff } from '../middleware/eventAccess';
import { broadcastUpdate } from './sse';
import { verschiebeZeile } from '../utils/reihenfolge';
import { farbeOderNull } from '../utils/gruppenFarben';
import { syncSeriesAssignments } from '../utils/serien';

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


/** Serie: 0, '' und Unfug bedeuten "keine". */
const serieOderNull = (wert: unknown): number | null => {
  const n = Number(wert);
  return Number.isInteger(n) && n > 0 ? n : null;
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
              ts.name AS series_name,
              (SELECT COUNT(*) FROM tasks t WHERE t.program_item_id = pi.id) AS task_count
       FROM program_items pi
       LEFT JOIN task_series ts ON ts.id = pi.series_id
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
    const { event_id, day_number, time, title, description, color, series_id } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ error: 'Titel fehlt' });
    }

    // Ans Ende des Tages einsortieren.
    const max = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM program_items WHERE event_id = $1 AND day_number = $2',
      [event_id, day_number]
    );

    const result = await query(
      `INSERT INTO program_items (event_id, day_number, time, title, description, sort_order, color, series_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [event_id, day_number, zeitOderNull(time), String(title).trim(), description || null,
       max.rows[0].m + 10, farbeOderNull(color), serieOderNull(series_id)]
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
      color = alt.color,
      series_id = alt.series_id,
    } = req.body;

    const result = await query(
      `UPDATE program_items
       SET day_number = $1, time = $2, title = $3, description = $4, color = $5, series_id = $6
       WHERE id = $7 RETURNING *`,
      [day_number, zeitOderNull(time), String(title).trim(), description || null,
       farbeOderNull(color), serieOderNull(series_id), id]
    );

    /*
     * Wechselt die Gruppe den Tag, muessen ihre Aufgaben mit. Sonst stuende
     * die Ueberschrift an Tag 2 und ihre Aufgaben weiter an Tag 1 - in der
     * Ansicht waeren sie schlicht verschwunden.
     */
    if (Number(day_number) !== Number(alt.day_number)) {
      await query('UPDATE tasks SET day_number = $1 WHERE program_item_id = $2', [day_number, id]);
    }

    /*
     * Gehoert die Gruppe zu einer Serie, bekommt deren Team die Aufgaben
     * der Gruppe zugewiesen - sonst waere die Zuordnung eine Angabe ohne
     * Wirkung, bis jemand zufaellig die Serie anfasst.
     */
    const neueSerie = serieOderNull(series_id);
    if (neueSerie) await syncSeriesAssignments(neueSerie);

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
 * Welche Aufgaben gehoeren zur Gruppe?
 *
 * Der Bearbeiten-Dialog schickt die vollstaendige Liste der angehakten
 * Aufgaben. Alles, was frueher drin war und jetzt fehlt, faellt heraus;
 * alles Neue kommt hinein - auch wenn es vorher in einer ANDEREN Gruppe
 * stand. Eine Aufgabe gehoert zu hoechstens einer Gruppe.
 *
 * Angenommen werden nur Aufgaben derselben Veranstaltung und desselben
 * Tages. Eine Aufgabe von Tag 3 unter einer Ueberschrift von Tag 1 waere
 * in keiner Ansicht zu finden.
 */
router.put('/:id/tasks', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), async (req, res) => {
  try {
    const { id } = req.params;
    const { task_ids } = req.body;

    const g = await query('SELECT * FROM program_items WHERE id = $1', [id]);
    if (g.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabengruppe nicht gefunden' });
    }
    const gruppe = g.rows[0];

    const gewuenscht: number[] = Array.isArray(task_ids)
      ? task_ids.map((n: unknown) => Number(n)).filter((n: number) => Number.isInteger(n))
      : [];

    // Herausnehmen, was nicht mehr angehakt ist.
    await query(
      `UPDATE tasks SET program_item_id = NULL
       WHERE program_item_id = $1 AND NOT (id = ANY($2::int[]))`,
      [id, gewuenscht]
    );

    // Aufnehmen, was angehakt ist - aber nur aus derselben Veranstaltung
    // und demselben Tag.
    const rein = await query(
      `UPDATE tasks SET program_item_id = $1
       WHERE id = ANY($2::int[]) AND event_id = $3 AND day_number = $4
       RETURNING id`,
      [id, gewuenscht, gruppe.event_id, gruppe.day_number]
    );

    const zahl = await query(
      'SELECT COUNT(*)::int AS n FROM tasks WHERE program_item_id = $1', [id]
    );

    // Neu aufgenommene Aufgaben brauchen die Zuweisungen der Serie.
    if (gruppe.series_id) await syncSeriesAssignments(gruppe.series_id);

    broadcastUpdate('task', { action: 'group_updated', eventId: gruppe.event_id });
    res.json({
      message: 'Zuordnung gespeichert',
      task_count: zahl.rows[0].n,
      uebersprungen: gewuenscht.length - rein.rows.length,
    });
  } catch (error) {
    console.error('Set task group members error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

/*
 * Gruppe duplizieren - auf denselben oder einen anderen Tag.
 *
 * Die Kopie ist eigenstaendig: nichts verweist zurueck. Wer spaeter die
 * eine aendert, aendert die andere nicht.
 *
 * Kopierte Aufgaben starten auf "nicht gestartet" - der Stand des Originals
 * gehoert zu dessen Tag, nicht zum neuen. Zuweisungen kommen nur auf
 * Wunsch mit; wer am zweiten Tag Kuechendienst hat, ist selten dasselbe
 * Team.
 */
router.post('/:id/duplicate', authMiddleware, teamleiterOrAdminMiddleware,
  eventZugriff(req => eventIdVonGruppe(req.params.id)), async (req, res) => {
  try {
    const { id } = req.params;
    const { day_number, mit_aufgaben = true, mit_zuweisungen = false } = req.body;

    const g = await query('SELECT * FROM program_items WHERE id = $1', [id]);
    if (g.rows.length === 0) {
      return res.status(404).json({ error: 'Aufgabengruppe nicht gefunden' });
    }
    const alt = g.rows[0];
    const zielTag = Number.isInteger(Number(day_number)) ? Number(day_number) : alt.day_number;

    const max = await query(
      'SELECT COALESCE(MAX(sort_order), 0) AS m FROM program_items WHERE event_id = $1 AND day_number = $2',
      [alt.event_id, zielTag]
    );

    const neu = await query(
      `INSERT INTO program_items (event_id, day_number, time, title, description, sort_order, color, series_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [alt.event_id, zielTag, alt.time, alt.title, alt.description,
       max.rows[0].m + 10, alt.color, alt.series_id]
    );
    const neueGruppe = neu.rows[0];

    let kopierteAufgaben = 0;
    let kopierteZuweisungen = 0;

    if (mit_aufgaben) {
      const aufgaben = await query(
        'SELECT * FROM tasks WHERE program_item_id = $1 ORDER BY sort_order, id', [id]
      );

      for (const a of aufgaben.rows) {
        const kopie = await query(
          `INSERT INTO tasks
             (event_id, program_item_id, day_number, title, description, scheduled_time,
              reminder_minutes, start_time, end_time, is_public, status, is_active,
              sort_order, series_id, needed_staff, needed_female, needed_male, auto_complete)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'not_started', $11, $12, $13, $14, $15, $16, $17)
           RETURNING id`,
          [alt.event_id, neueGruppe.id, zielTag, a.title, a.description, a.scheduled_time,
           a.reminder_minutes, a.start_time, a.end_time, a.is_public, a.is_active,
           a.sort_order, a.series_id, a.needed_staff, a.needed_female, a.needed_male, a.auto_complete]
        );
        kopierteAufgaben++;

        if (mit_zuweisungen) {
          const zuw = await query(
            'SELECT DISTINCT user_id, event_instance_id, reminder_minutes FROM task_assignments WHERE task_id = $1',
            [a.id]
          );
          for (const z of zuw.rows) {
            await query(
              `INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes)
               VALUES ($1, $2, $3, $4)`,
              [kopie.rows[0].id, z.event_instance_id, z.user_id, z.reminder_minutes]
            );
            kopierteZuweisungen++;
          }
        }
      }
    }

    broadcastUpdate('task', { action: 'group_created', eventId: alt.event_id });
    res.status(201).json({
      gruppe: neueGruppe,
      kopierteAufgaben,
      kopierteZuweisungen,
      message: `„${alt.title}" wurde nach Tag ${zielTag} kopiert`,
    });
  } catch (error) {
    console.error('Duplicate task group error:', error);
    res.status(500).json({ error: 'Server Fehler' });
  }
});

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
