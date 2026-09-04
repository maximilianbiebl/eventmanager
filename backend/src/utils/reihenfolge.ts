import { query } from '../database/connection';

/*
 * Handreihenfolge eines Veranstaltungstages.
 *
 * Auf einer Ebene stehen nebeneinander:
 *   - die Aufgabengruppen (Zwischenueberschriften)
 *   - die Aufgaben OHNE Gruppe
 *
 * Beide werden aus derselben Zaehlung bedient, damit sich eine Gruppe auch
 * ZWISCHEN zwei losen Aufgaben platzieren laesst. Vorher hatten sie zwei
 * getrennte Zaehlungen, und die Liste musste erst alle Gruppen und danach
 * alle losen Aufgaben zeigen - eine Gruppe liess sich nicht dazwischen
 * schieben.
 *
 * Aufgaben INNERHALB einer Gruppe zaehlen fuer sich; sie werden mit ihren
 * eigenen Pfeilen nur innerhalb ihrer Gruppe verschoben.
 *
 * Nach jedem Verschieben wird der ganze Tag neu durchnummeriert (10, 20,
 * 30 ...). Das ist ein paar Zeilen mehr Schreibarbeit, macht die
 * Reihenfolge aber eindeutig: bei blossem Tauschen bleiben gleiche Werte
 * gleich, und dann bewegt sich nichts.
 */

export type ZeilenArt = 'gruppe' | 'aufgabe';

export interface Zeile {
  art: ZeilenArt;
  id: number;
  rang: number;
}

/** Gruppen und gruppenlose Aufgaben eines Tages in ihrer Reihenfolge. */
export const zeilenDesTages = async (eventId: number, dayNumber: number): Promise<Zeile[]> => {
  const [gruppen, lose] = await Promise.all([
    query(
      `SELECT id, COALESCE(sort_order, 0) AS rang FROM program_items
       WHERE event_id = $1 AND day_number = $2`,
      [eventId, dayNumber]
    ),
    query(
      `SELECT id, COALESCE(sort_order, 0) AS rang FROM tasks
       WHERE event_id = $1 AND day_number = $2 AND program_item_id IS NULL`,
      [eventId, dayNumber]
    ),
  ]);

  const zeilen: Zeile[] = [
    ...gruppen.rows.map(r => ({ art: 'gruppe' as const, id: r.id, rang: Number(r.rang) })),
    ...lose.rows.map(r => ({ art: 'aufgabe' as const, id: r.id, rang: Number(r.rang) })),
  ];

  // Bei gleichem Rang zuerst die Gruppen, dann nach Nummer - Hauptsache
  // eindeutig, sonst waere die Reihenfolge von Lauf zu Lauf verschieden.
  return zeilen.sort((a, b) =>
    a.rang - b.rang
    || (a.art === b.art ? 0 : a.art === 'gruppe' ? -1 : 1)
    || a.id - b.id
  );
};

/** Schreibt die Reihenfolge zurueck - 10, 20, 30 ... */
const nummerieren = async (zeilen: Zeile[]): Promise<void> => {
  for (let i = 0; i < zeilen.length; i++) {
    const rang = (i + 1) * 10;
    const z = zeilen[i];
    if (z.art === 'gruppe') {
      await query('UPDATE program_items SET sort_order = $1 WHERE id = $2', [rang, z.id]);
    } else {
      await query('UPDATE tasks SET sort_order = $1 WHERE id = $2', [rang, z.id]);
    }
  }
};

export interface VerschiebeErgebnis {
  bewegt: boolean;
  meldung: string;
}

/**
 * Verschiebt eine Gruppe oder eine gruppenlose Aufgabe um eine Stelle -
 * quer ueber beide Arten, sodass eine Gruppe auch zwischen zwei losen
 * Aufgaben landen kann.
 */
export const verschiebeZeile = async (
  eventId: number,
  dayNumber: number,
  art: ZeilenArt,
  id: number,
  richtung: 'hoch' | 'runter'
): Promise<VerschiebeErgebnis> => {
  const zeilen = await zeilenDesTages(eventId, dayNumber);
  const i = zeilen.findIndex(z => z.art === art && z.id === id);
  if (i === -1) return { bewegt: false, meldung: 'Nicht gefunden' };

  const j = richtung === 'hoch' ? i - 1 : i + 1;
  if (j < 0 || j >= zeilen.length) {
    return {
      bewegt: false,
      meldung: richtung === 'hoch' ? 'Steht bereits ganz oben' : 'Steht bereits ganz unten',
    };
  }

  [zeilen[i], zeilen[j]] = [zeilen[j], zeilen[i]];
  await nummerieren(zeilen);
  return { bewegt: true, meldung: 'Reihenfolge aktualisiert' };
};
