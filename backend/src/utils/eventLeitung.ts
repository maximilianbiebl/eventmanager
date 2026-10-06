import { query } from '../database/connection';

/*
 * Leitung einer neuen Veranstaltung eintragen.
 *
 * Wer eine Veranstaltung anlegt, leitet sie und steht in ihrem
 * Mitarbeiter-Pool - sonst kann er sich keine Aufgaben geben, und als
 * Leitung taucht er nirgends auf. Das stand bisher nur beim Anlegen und
 * bei "Vorlage verwenden" im Code, jeweils von Hand. Beim Duplizieren und
 * beim CSV-Import fehlte es: die neue Veranstaltung hatte keine Leitung
 * und einen leeren Pool, man konnte sich nur noch als Co-Leitung
 * nachtragen. Loeschen ging trotzdem, weil das nur am Ersteller haengt.
 *
 * Deshalb eine gemeinsame Stelle fuer alle Wege, auf denen eine
 * Veranstaltung entsteht. Mehrfaches Ausfuehren schadet nicht.
 */
export const trageLeitungEin = async (
  eventId: number,
  erstellerId: number,
  coTeamleiterIds?: unknown
): Promise<void> => {
  await query(
    `INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, true)
     ON CONFLICT (event_id, user_id) DO NOTHING`,
    [eventId, erstellerId]
  );
  await query(
    'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING',
    [eventId, erstellerId]
  );

  if (!Array.isArray(coTeamleiterIds)) return;
  for (const coId of coTeamleiterIds) {
    await query(
      `INSERT INTO event_teamleiter (event_id, user_id, is_primary) VALUES ($1, $2, false)
       ON CONFLICT (event_id, user_id) DO NOTHING`,
      [eventId, coId]
    );
    await query(
      'INSERT INTO event_staff (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING',
      [eventId, coId]
    );
  }
};
