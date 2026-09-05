import { query } from '../database/connection';

/*
 * Aufgaben einer Serie.
 *
 * Dazu gehoeren die direkt zugeordneten UND die aus Gruppen, die zur Serie
 * gehoeren. Steht an einer Aufgabe eine EIGENE Serie, gewinnt sie - ueber
 * die Gruppe kommen also nur Aufgaben ohne eigene Serie dazu.
 *
 * $x ist der Platzhalter, unter dem die Serien-Nummer im jeweiligen Aufruf
 * steht - er taucht zweimal auf, das ist in Postgres in Ordnung.
 */
export const AUFGABEN_DER_SERIE = (platzhalter: string, alias = 't') => `(
    ${alias}.series_id = ${platzhalter}
    OR (${alias}.series_id IS NULL AND ${alias}.program_item_id IN
          (SELECT id FROM program_items WHERE series_id = ${platzhalter}))
  )`;

export const syncSeriesAssignments = async (seriesId: number | string): Promise<number> => {
  const members = await query(
    'SELECT user_id FROM task_series_members WHERE series_id = $1',
    [seriesId]
  );
  if (members.rows.length === 0) return 0;

  const tasks = await query(
    `SELECT t.id, t.event_id, t.reminder_minutes FROM tasks t WHERE ${AUFGABEN_DER_SERIE('$1')}`,
    [seriesId]
  );
  if (tasks.rows.length === 0) return 0;

  // Alle Durchfuehrungen der zugehoerigen Veranstaltung
  const instances = await query(
    'SELECT id FROM event_instances WHERE event_id = $1',
    [tasks.rows[0].event_id]
  );

  let created = 0;

  for (const task of tasks.rows) {
    for (const instance of instances.rows) {
      for (const { user_id } of members.rows) {
        const existing = await query(
          'SELECT id FROM task_assignments WHERE task_id = $1 AND event_instance_id = $2 AND user_id = $3',
          [task.id, instance.id, user_id]
        );
        if (existing.rows.length === 0) {
          await query(
            'INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes) VALUES ($1, $2, $3, $4)',
            [task.id, instance.id, user_id, task.reminder_minutes ?? 15]
          );
          created++;
        }
      }
    }
  }

  return created;
};
