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
  andere.splice(stelleNachZeit(andere, neue.zeit), 0, neue);
  await nummerieren(andere);
};

/*
 * Wohin eine Zeile mit dieser Uhrzeit gehoert - in einer Liste, deren
 * Reihenfolge sonst bleibt, wie sie ist.
 *
 *   - Ohne Uhrzeit: ans Ende.
 *   - Mit Uhrzeit: direkt hinter die letzte Zeile, deren Zeit nicht
 *     spaeter ist. Gibt es keine solche, vor die erste Zeile mit Zeit.
 *     Zeilen OHNE Zeit dazwischen bleiben, wo sie stehen - an ihnen wird
 *     nicht gemessen.
 *
 * Vorher kam eine neue Zeile vor die erste, die spaeter ODER ohne Zeit
 * war. Stand oben in einer Gruppe eine Aufgabe ohne Uhrzeit, landete jede
 * neue Aufgabe mit Uhrzeit ganz oben - egal, was ihre Zeit war. Darum
 * "nicht immer": nur in Gruppen, die so anfingen.
 */
export const stelleNachZeit = (zeilen: { zeit?: string | null }[], zeit: string | null | undefined): number => {
  if (!zeit) return zeilen.length;
  const t = String(zeit);
  let letzteFruehere = -1;
  let ersteMitZeit = -1;
  zeilen.forEach((z, i) => {
    if (!z.zeit) return;
    if (ersteMitZeit === -1) ersteMitZeit = i;
    if (String(z.zeit) <= t) letzteFruehere = i;
  });
  if (letzteFruehere !== -1) return letzteFruehere + 1;
  if (ersteMitZeit !== -1) return ersteMitZeit;
  return zeilen.length;
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
  andere.splice(stelleNachZeit(andere, neue.zeit), 0, neue);
  await nummerieren(andere);
};

/*
 * Mehrere markierte Zeilen auf einmal um eine Stelle verschieben.
 *
 * Zusammenhaengende Markierungen bewegen sich als Block: [x, A, B] wird
 * mit "hoch" zu [A, B, x]. Steht der Block schon am Rand, bewegt er sich
 * nicht - und eine Markierung springt nie ueber eine andere.
 *
 * Arbeitet auf einer beliebigen Liste (Zeilen eines Tages oder Aufgaben
 * einer Gruppe); zurueck kommt sie in neuer Reihenfolge, und ob sich etwas
 * bewegt hat.
 */
export const verschiebeMarkierte = <T>(
  liste: T[],
  markiert: (eintrag: T) => boolean,
  richtung: 'hoch' | 'runter'
): { liste: T[]; bewegt: boolean } => {
  const neu = [...liste];
  let bewegt = false;
  const tausche = (i: number, j: number) => { [neu[i], neu[j]] = [neu[j], neu[i]]; bewegt = true; };
  if (richtung === 'hoch') {
    for (let i = 1; i < neu.length; i++) {
      if (markiert(neu[i]) && !markiert(neu[i - 1])) tausche(i - 1, i);
    }
  } else {
    for (let i = neu.length - 2; i >= 0; i--) {
      if (markiert(neu[i]) && !markiert(neu[i + 1])) tausche(i, i + 1);
    }
  }
  return { liste: neu, bewegt };
};

/** Lose Aufgaben eines Tages gemeinsam verschieben (sie tauschen auch mit Gruppen). */
export const verschiebeLoseAufgaben = async (
  eventId: number,
  dayNumber: number,
  taskIds: Set<number>,
  richtung: 'hoch' | 'runter'
): Promise<boolean> => {
  const zeilen = await zeilenDesTages(eventId, dayNumber);
  const { liste, bewegt } = verschiebeMarkierte(zeilen, (z) => z.art === 'aufgabe' && taskIds.has(z.id), richtung);
  if (bewegt) await nummerieren(liste);
  return bewegt;
};

/** Aufgaben innerhalb einer Gruppe gemeinsam verschieben. */
export const verschiebeInGruppe = async (
  gruppenId: number,
  taskIds: Set<number>,
  richtung: 'hoch' | 'runter'
): Promise<boolean> => {
  const zeilen = await aufgabenDerGruppe(gruppenId);
  const { liste, bewegt } = verschiebeMarkierte(zeilen, (z) => taskIds.has(z.id), richtung);
  if (bewegt) await nummerieren(liste);
  return bewegt;
};

/**
 * Die Aufgaben einer Gruppe in der Reihenfolge, in der die Liste sie zeigt.
 *
 * Gleiche Nummern (nach Import oder Vorlage) und fehlende Nummern kommen
 * vor. Frueher suchte der Pfeil den Nachbarn mit "sort_order < meine" -
 * eine gleich nummerierte Aufgabe direkt darueber fand er so nicht, und die
 * Aufgabe sprang ueber sie hinweg, zwei oder mehr Zeilen weit. Jetzt wird
 * in dieser Liste getauscht und die Gruppe danach neu durchnummeriert;
 * danach sind die Nummern wieder eindeutig.
 */
export const aufgabenDerGruppe = async (gruppenId: number): Promise<Zeile[]> => {
  const r = await query(
    `SELECT id, sort_order AS rang FROM tasks WHERE program_item_id = $1
     ORDER BY sort_order NULLS LAST, id`,
    [gruppenId]
  );
  // Ohne Nummer = ganz hinten, wie in der Anzeige (999999).
  return r.rows.map((x: any) => ({ art: 'aufgabe' as const, id: x.id, rang: x.rang === null ? 999999 : Number(x.rang) }));
};

/*
 * Nach dem Bearbeiten neu einsortieren.
 *
 * Bisher bekam nur eine NEUE Aufgabe ihren Platz nach der Uhrzeit. Wer
 * eine Aufgabe ohne Uhrzeit anlegte (sie kommt ans Ende) und die Zeit
 * spaeter nachtrug, fand sie weiter ganz unten - auch wenn sie zeitlich
 * ganz oben hingehoert. Ebenso nach einem Wechsel von Tag oder Gruppe im
 * Bearbeiten-Dialog: die alte Nummer passte zum neuen Ort nicht.
 *
 * Neu einsortiert wird nur, wenn sich Tag, Gruppe oder Uhrzeit wirklich
 * aendern - eine reine Titelaenderung laesst die Handreihenfolge in Ruhe.
 * Wird die Uhrzeit nur geloescht, bleibt die Aufgabe, wo sie ist.
 */
const zeitVon = (t: any): string | null => {
  const z = t?.scheduled_time || t?.start_time;
  return z ? String(z).slice(0, 5) : null;
};

/** Zeit, nach der eine Gruppe einsortiert wird: eigene, sonst frueheste ihrer Aufgaben. */
export const zeitDerGruppe = async (gruppenId: number): Promise<string | null> => {
  const r = await query(
    `SELECT COALESCE(pi.time, (
       SELECT MIN(COALESCE(t.scheduled_time, t.start_time)) FROM tasks t WHERE t.program_item_id = pi.id
     )) AS zeit FROM program_items pi WHERE pi.id = $1`,
    [gruppenId]
  );
  const z = r.rows[0]?.zeit;
  return z ? String(z).slice(0, 5) : null;
};

export const nachAenderungEinsortieren = async (
  alt: any,
  neu: any,
  gruppenZeitVorher: string | null
): Promise<void> => {
  const tagGewechselt = Number(alt.day_number) !== Number(neu.day_number);
  const gruppeGewechselt = (alt.program_item_id ?? null) !== (neu.program_item_id ?? null);
  const zeitNeu = zeitVon(neu);
  const zeitGeaendert = zeitVon(alt) !== zeitNeu;

  if (tagGewechselt || gruppeGewechselt || (zeitGeaendert && zeitNeu)) {
    if (neu.program_item_id) await einsortierenInGruppe(neu.program_item_id, neu.id);
    else await einsortierenNachZeit(neu.event_id, neu.day_number, 'aufgabe', neu.id);
  }

  // Gruppe ohne eigene Uhrzeit: ihre Zeit kommt von den Aufgaben und kann
  // sich gerade geaendert haben - dann gehoert die Gruppe an einen anderen Platz.
  if (neu.program_item_id && !gruppeGewechselt && zeitGeaendert) {
    const nachher = await zeitDerGruppe(neu.program_item_id);
    if (nachher && nachher !== gruppenZeitVorher) {
      await einsortierenNachZeit(neu.event_id, neu.day_number, 'gruppe', neu.program_item_id);
    }
  }
};
