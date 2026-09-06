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
  /** Zeit, nach der einsortiert wird - siehe zeilenDesTages. */
  zeit?: string | null;
}

/**
 * Gruppen und gruppenlose Aufgaben eines Tages in ihrer Reihenfolge.
 *
 * Mit der Zeit, nach der die Zeile einsortiert wird: bei einer Aufgabe die
 * geplante bzw. die Startzeit, bei einer Gruppe ihre eigene - und wenn sie
 * keine hat, die frueheste ihrer Aufgaben. Dieselbe Regel wie in der
 * Anzeige (frontend/utils/taskGroups): eine Gruppe ohne eigene Zeit, deren
 * Aufgaben aber Zeiten haben, ist eben doch verortet.
 */
export const zeilenDesTages = async (eventId: number, dayNumber: number): Promise<Zeile[]> => {
  const [gruppen, lose] = await Promise.all([
    query(
      `SELECT pi.id, COALESCE(pi.sort_order, 0) AS rang,
              COALESCE(pi.time, (
                SELECT MIN(COALESCE(t.scheduled_time, t.start_time))
                FROM tasks t WHERE t.program_item_id = pi.id
              )) AS zeit
       FROM program_items pi
       WHERE pi.event_id = $1 AND pi.day_number = $2`,
      [eventId, dayNumber]
    ),
    query(
      `SELECT id, COALESCE(sort_order, 0) AS rang,
              COALESCE(scheduled_time, start_time) AS zeit
       FROM tasks
       WHERE event_id = $1 AND day_number = $2 AND program_item_id IS NULL`,
      [eventId, dayNumber]
    ),
  ]);

  const zeilen: Zeile[] = [
    ...gruppen.rows.map(r => ({ art: 'gruppe' as const, id: r.id, rang: Number(r.rang), zeit: r.zeit ?? null })),
    ...lose.rows.map(r => ({ art: 'aufgabe' as const, id: r.id, rang: Number(r.rang), zeit: r.zeit ?? null })),
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

/**
 * Eine neu angelegte Zeile an ihren Platz setzen - nach der Uhrzeit.
 *
 * Der Reihe nach: die Zeile kommt vor die erste vorhandene, die spaeter
 * dran ist. Was keine Zeit hat, kommt ans Ende des Tages - dieselbe Regel
 * wie in der Anzeige. Die vorhandene Handreihenfolge bleibt unangetastet;
 * eingefuegt wird nur die neue Zeile.
 *
 * Danach wird der Tag neu durchnummeriert. Das ist seit der
 * Sammelanweisung billig und erspart die Rechnerei mit Luecken, die
 * frueher zwischen zwei gleichen Nummern stecken blieb.
 */
export const einsortierenNachZeit = async (
  eventId: number,
  dayNumber: number,
  art: ZeilenArt,
  id: number
): Promise<void> => {
  const alle = await zeilenDesTages(eventId, dayNumber);
  const neue = alle.find(z => z.art === art && z.id === id);
  if (!neue) return;

  const andere = alle.filter(z => !(z.art === art && z.id === id));
  const spaeter = (a: string | null | undefined, b: string | null | undefined) => {
    if (!a) return false;          // ohne Zeit steht nichts "spaeter"
    if (!b) return true;           // alles Zeitlose kommt danach
    return String(b) > String(a);
  };

  let stelle = andere.findIndex(z => spaeter(neue.zeit, z.zeit));
  if (stelle === -1) stelle = andere.length;

  andere.splice(stelle, 0, neue);
  await nummerieren(andere);
};

/**
 * Dasselbe innerhalb einer Gruppe: eine neue Aufgabe kommt an die Stelle,
 * die ihre Uhrzeit vorgibt, statt ans Ende.
 */
export const einsortierenInGruppe = async (gruppenId: number, taskId: number): Promise<void> => {
  const r = await query(
    `SELECT id, COALESCE(sort_order, 0) AS rang,
            COALESCE(scheduled_time, start_time) AS zeit
     FROM tasks WHERE program_item_id = $1`,
    [gruppenId]
  );
  const alle: Zeile[] = r.rows.map((x: any) =>
    ({ art: 'aufgabe' as const, id: x.id, rang: Number(x.rang), zeit: x.zeit ?? null }));

  const neue = alle.find(z => z.id === taskId);
  if (!neue) return;

  const andere = alle.filter(z => z.id !== taskId).sort((a, b) => a.rang - b.rang || a.id - b.id);
  let stelle = andere.findIndex(z => (neue.zeit ? (!z.zeit || String(z.zeit) > String(neue.zeit)) : false));
  if (stelle === -1) stelle = andere.length;

  andere.splice(stelle, 0, neue);
  await nummerieren(andere);
};
