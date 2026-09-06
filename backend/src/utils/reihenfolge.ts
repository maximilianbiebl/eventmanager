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

/**
 * Schreibt die Reihenfolge zurueck - 10, 20, 30 ...
 *
 * In HOECHSTENS zwei Anweisungen, eine je Tabelle, und nur fuer die
 * Zeilen, deren Rang sich wirklich aendert. Vorher lief je Zeile eine
 * eigene Anweisung, nacheinander abgewartet: bei 44 Zeilen am Tag waren
 * das 44 Hin- und Rueckwege zur Datenbank. Gemessen wuchs das Verschieben
 * damit von 12 auf 29 Millisekunden, waehrend eine Aufgabe innerhalb
 * ihrer Gruppe (zwei Schreibvorgaenge) bei 5 blieb - genau der
 * Unterschied, der sich beim Klicken als Stocken bemerkbar machte.
 */
const nummerieren = async (zeilen: Zeile[]): Promise<void> => {
  const geaendert = zeilen
    .map((z, i) => ({ ...z, neu: (i + 1) * 10 }))
    .filter((z) => z.neu !== z.rang);

  const schreibe = async (tabelle: 'program_items' | 'tasks', art: ZeilenArt) => {
    const treffer = geaendert.filter((z) => z.art === art);
    if (treffer.length === 0) return;
    await query(
      `UPDATE ${tabelle} AS t SET sort_order = v.rang
       FROM (SELECT * FROM unnest($1::int[], $2::int[]) AS x(id, rang)) AS v
       WHERE t.id = v.id`,
      [treffer.map((z) => z.id), treffer.map((z) => z.neu)]
    );
  };

  await Promise.all([schreibe('program_items', 'gruppe'), schreibe('tasks', 'aufgabe')]);
};

export interface VerschiebeErgebnis {
  bewegt: boolean;
  meldung: string;
  /*
   * Die neue Reihenfolge des Tages - Gruppen und lose Aufgaben mit ihrem
   * frischen Rang.
   *
   * Sie geht mit der Antwort zurueck, damit die Oberflaeche den Zug sofort
   * zeigen kann. Vorher musste sie nach jedem Pfeildruck alles neu holen:
   * Aufgaben, Gruppen, Veranstaltung, Nutzer - fuenf Abfragen fuer eine
   * vertauschte Zeile, und bis dahin stand die Liste still.
   */
  reihenfolge: Zeile[];
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
  if (i === -1) return { bewegt: false, meldung: 'Nicht gefunden', reihenfolge: zeilen };

  const j = richtung === 'hoch' ? i - 1 : i + 1;
  if (j < 0 || j >= zeilen.length) {
    return {
      bewegt: false,
      meldung: richtung === 'hoch' ? 'Steht bereits ganz oben' : 'Steht bereits ganz unten',
      reihenfolge: zeilen,
    };
  }

  [zeilen[i], zeilen[j]] = [zeilen[j], zeilen[i]];
  await nummerieren(zeilen);

  // Mit den Raengen, die gerade geschrieben wurden - nicht mit den alten.
  const neu = zeilen.map((z, k) => ({ ...z, rang: (k + 1) * 10 }));
  return { bewegt: true, meldung: 'Reihenfolge aktualisiert', reihenfolge: neu };
};
