import { Response, NextFunction } from 'express';
import { query } from '../database/connection';
import { AuthRequest } from './auth';

/*
 * Zustaendigkeit fuer eine Veranstaltung - serverseitig.
 *
 * Bisher pruefte nur die Oberflaeche, wer welche Veranstaltung sieht: die
 * Uebersicht zeigt einem Teamleiter ausschliesslich eigene Veranstaltungen.
 * Die Aufgaben-Routen selbst hatten KEINE Pruefung - dort galt allein die
 * Rolle. Wer die event_id kannte, konnte in einer fremden Veranstaltung
 * Aufgaben anlegen, aendern und loeschen. Eine Regel, die nur im Browser
 * steht, ist keine Regel.
 *
 * Zustaendig ist:
 *   - jeder Admin
 *   - der Teamleiter, der die Veranstaltung angelegt hat
 *   - die Co-Teamleitung (Eintrag in event_teamleiter)
 *
 * Die Co-Teamleitung gehoert dazu, sonst waere die Rolle nur ein
 * Benachrichtigungs-Verteiler: man traegt jemanden als Mitleitung ein, er
 * bekommt Meldungen, kann aber nichts tun. Was ihr weiterhin verwehrt
 * bleibt, ist die Veranstaltung SELBST - Name, Datum, Loeschen bleiben beim
 * Ersteller (siehe die created_by-Pruefungen in routes/events.ts).
 */
export const darfEventVerwalten = async (
  user: { id: number; role: string },
  eventId: number | string | null | undefined
): Promise<boolean> => {
  if (user.role === 'admin') return true;
  if (!eventId) return false;

  const result = await query(
    `SELECT 1
     FROM events e
     LEFT JOIN event_teamleiter et ON et.event_id = e.id AND et.user_id = $2
     WHERE e.id = $1 AND (e.created_by = $2 OR et.user_id IS NOT NULL)
     LIMIT 1`,
    [eventId, user.id]
  );

  return result.rows.length > 0;
};

/** Gibt es die Veranstaltung ueberhaupt? Trennt 404 von 403. */
export const eventExistiert = async (eventId: number | string): Promise<boolean> => {
  const r = await query('SELECT 1 FROM events WHERE id = $1', [eventId]);
  return r.rows.length > 0;
};

// ---- Aufloesung der Veranstaltung aus dem, was die Route mitbringt ----

export const eventIdVonTask = async (taskId: number | string): Promise<number | null> => {
  const r = await query('SELECT event_id FROM tasks WHERE id = $1', [taskId]);
  return r.rows.length > 0 ? r.rows[0].event_id : null;
};

export const eventIdVonInstanz = async (instanceId: number | string): Promise<number | null> => {
  const r = await query('SELECT event_id FROM event_instances WHERE id = $1', [instanceId]);
  return r.rows.length > 0 ? r.rows[0].event_id : null;
};

export const eventIdVonZuweisung = async (assignmentId: number | string): Promise<number | null> => {
  const r = await query(
    `SELECT t.event_id FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id WHERE ta.id = $1`,
    [assignmentId]
  );
  return r.rows.length > 0 ? r.rows[0].event_id : null;
};

export const eventIdVonSerie = async (seriesId: number | string): Promise<number | null> => {
  const r = await query('SELECT event_id FROM task_series WHERE id = $1', [seriesId]);
  return r.rows.length > 0 ? r.rows[0].event_id : null;
};

// Die URL liefert Strings, Rumpf-Felder Zahlen - beides ist erlaubt.
type Aufloeser = (req: AuthRequest) =>
  | Promise<number | null>
  | number
  | string
  | null
  | undefined;

/*
 * Zugriffsschutz als Middleware. Der Aufloeser sagt, WO die Veranstaltung
 * steht - mal in der URL, mal im Rumpf, mal nur ueber die Aufgabe erreichbar.
 *
 * Existiert die Veranstaltung nicht, gibt es 404 statt 403: sonst liesse
 * sich an der Antwort ablesen, welche IDs vergeben sind.
 */
export const eventZugriff = (aufloeser: Aufloeser) =>
  async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const eventId = await aufloeser(req);

      if (!eventId || !(await eventExistiert(eventId))) {
        return res.status(404).json({ error: 'Veranstaltung nicht gefunden' });
      }

      if (!(await darfEventVerwalten(req.user!, eventId))) {
        return res.status(403).json({ error: 'Keine Berechtigung für diese Veranstaltung' });
      }

      next();
    } catch (error) {
      console.error('Event access check error:', error);
      res.status(500).json({ error: 'Server Fehler' });
    }
  };
