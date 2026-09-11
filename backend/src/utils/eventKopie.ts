import { query } from '../database/connection';

/*
 * Inhalte einer Veranstaltung in eine andere kopieren.
 *
 * Gebraucht wird das an vier Stellen: aus einer Vorlage eine Veranstaltung
 * machen, eine Veranstaltung als Vorlage ablegen, einen Vorschlag
 * uebernehmen und eine Veranstaltung duplizieren. Alle vier hatten
 * denselben Block noch einmal stehen - mit dem Ergebnis, dass eine
 * Neuerung (zuletzt die Farbe der Gruppen) an einer Stelle ankam und an
 * den anderen fehlte.
 *
 * Kopiert werden:
 *   - Serien (nur Name und Beschreibung, siehe unten)
 *   - Aufgabengruppen mit Farbe und ihrer Serie
 *   - Aufgaben mit allem, was an der Aufgabe haengt, und ihren Verweisen
 *     auf Gruppe und Serie
 *
 * NICHT kopiert werden Menschen: weder die Mitglieder einer Serie noch
 * Zuweisungen. Wer mitarbeitet, entscheidet sich je Veranstaltung neu -
 * eine Vorlage ist ein Bauplan, keine Mannschaftsaufstellung.
 *
 * Der Status wird zurueckgesetzt: eine Kopie faengt bei "nicht gestartet"
 * an, auch wenn das Original laengst erledigt war.
 */
export interface KopierErgebnis {
  serien: number;
  gruppen: number;
  aufgaben: number;
}

export const kopiereInhalte = async (
  vonEventId: number | string,
  nachEventId: number
): Promise<KopierErgebnis> => {
  // --- Serien
  const serien = await query(
    'SELECT * FROM task_series WHERE event_id = $1 ORDER BY id', [vonEventId]
  );
  const serienMap = new Map<number, number>();
  for (const s of serien.rows) {
    const neu = await query(
      'INSERT INTO task_series (event_id, name, description) VALUES ($1, $2, $3) RETURNING id',
      [nachEventId, s.name, s.description ?? null]
    );
    serienMap.set(s.id, neu.rows[0].id);
  }

  // --- Aufgabengruppen
  const gruppen = await query(
    'SELECT * FROM program_items WHERE event_id = $1 ORDER BY id', [vonEventId]
  );
  const gruppenMap = new Map<number, number>();

  if (gruppen.rows.length > 0) {
    const werte = gruppen.rows.map((_, i) =>
      `($1, $${i * 7 + 2}, $${i * 7 + 3}, $${i * 7 + 4}, $${i * 7 + 5}, $${i * 7 + 6}, $${i * 7 + 7}, $${i * 7 + 8})`
    ).join(', ');
    const werteListe: any[] = [nachEventId];
    for (const g of gruppen.rows) {
      werteListe.push(
        g.day_number, g.time, g.title, g.description, g.sort_order ?? 0,
        g.color ?? null,
        g.series_id ? serienMap.get(g.series_id) ?? null : null
      );
    }
    const neu = await query(
      `INSERT INTO program_items
         (event_id, day_number, time, title, description, sort_order, color, series_id)
       VALUES ${werte} RETURNING id`,
      werteListe
    );
    gruppen.rows.forEach((g, i) => gruppenMap.set(g.id, neu.rows[i].id));
  }

  // --- Aufgaben
  const aufgaben = await query('SELECT * FROM tasks WHERE event_id = $1 ORDER BY id', [vonEventId]);

  if (aufgaben.rows.length > 0) {
    const SPALTEN = 17;
    const werte = aufgaben.rows.map((_, i) => {
      const b = i * SPALTEN + 2;
      return `($1, ${Array.from({ length: SPALTEN }, (_, k) => `$${b + k}`).join(', ')})`;
    }).join(', ');

    const werteListe: any[] = [nachEventId];
    for (const t of aufgaben.rows) {
      werteListe.push(
        t.program_item_id ? gruppenMap.get(t.program_item_id) ?? null : null,
        t.day_number,
        t.title,
        t.description,
        t.scheduled_time,
        t.start_time,
        t.end_time,
        t.reminder_minutes,
        t.is_public,
        'not_started',
        t.is_active !== undefined ? t.is_active : true,
        t.sort_order ?? 0,
        // Personalbedarf gehoert zur Aufgabe und muss mit.
        t.needed_staff ?? null,
        t.needed_female ?? null,
        t.needed_male ?? null,
        t.auto_complete ?? false,
        t.series_id ? serienMap.get(t.series_id) ?? null : null
      );
    }

    await query(
      `INSERT INTO tasks (
         event_id, program_item_id, day_number, title, description,
         scheduled_time, start_time, end_time, reminder_minutes, is_public, status, is_active,
         sort_order, needed_staff, needed_female, needed_male, auto_complete, series_id
       ) VALUES ${werte}`,
      werteListe
    );
  }

  return {
    serien: serienMap.size,
    gruppen: gruppenMap.size,
    aufgaben: aufgaben.rows.length,
  };
};
