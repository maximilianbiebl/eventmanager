import { query } from '../database/connection';

/*
 * Mit welcher Erinnerungszeit eine neue Einteilung startet.
 *
 * Die Standard-Erinnerungszeit in den Einstellungen wurde gespeichert, aber
 * nirgends verwendet - jede Einteilung uebernahm einfach den Wert der
 * Aufgabe. Jetzt, wie es der Hinweis in den Einstellungen sagt ("gilt als
 * Standard fuer neue Aufgaben"):
 *
 *   - Hat die Leitung an der Aufgabe einen EIGENEN Wert gesetzt (alles
 *     ausser dem allgemeinen Standard 15, auch 0 = keine Erinnerung), gilt
 *     ihrer - sie weiss, warum "Getraenke einkaufen" 30 Minuten Vorlauf
 *     braucht und "Nachtruhe" gar keinen.
 *   - Sonst gilt der persoenliche Standard der eingeteilten Person.
 *
 * Bestehende Einteilungen bleiben, wie sie sind; eine eigene Erinnerung an
 * der Aufgabe (Knopf "Erinnerung") geht ohnehin vor.
 */
export const STANDARD_ERINNERUNG = 15;

export const erinnerungFuer = async (taskId: number | string, userId: number | string): Promise<number> => {
  const r = await query(
    `SELECT CASE WHEN COALESCE(t.reminder_minutes, $3) = $3
                 THEN COALESCE(u.default_reminder_minutes, $3)
                 ELSE t.reminder_minutes END AS minuten
     FROM tasks t, users u WHERE t.id = $1 AND u.id = $2`,
    [taskId, userId, STANDARD_ERINNERUNG]
  );
  return r.rows[0]?.minuten ?? STANDARD_ERINNERUNG;
};
