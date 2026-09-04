import { TaskGroup } from '../api/program';

/*
 * Aufgabengruppen in den Listen.
 *
 * Eine Gruppe ist eine Zwischenüberschrift über zusammengehörenden
 * Aufgaben. Sie erscheint an der Stelle ihrer ERSTEN Aufgabe - so bleibt
 * die vorhandene Sortierung (Tag, Reihenfolge, Zeit) unangetastet, und die
 * Gruppierung legt sich nur darüber.
 */

export interface Gruppierbar {
  id: number;
  program_item_id?: number | null;
}

export type Zeile<T> =
  | { typ: 'gruppe'; gruppe: TaskGroup; aufgaben: T[] }
  | { typ: 'aufgabe'; aufgabe: T };

/**
 * Baut aus einer bereits sortierten Aufgabenliste die Abfolge aus
 * Gruppenüberschriften und einzelnen Aufgaben.
 *
 * Aufgaben ohne Gruppe bleiben da stehen, wo sie sind. Zeigt eine Aufgabe
 * auf eine Gruppe, die es nicht (mehr) gibt, wird sie wie eine ungruppierte
 * behandelt - lieber ohne Überschrift als gar nicht sichtbar.
 */
export const zeilenMitGruppen = <T extends Gruppierbar>(
  aufgaben: T[],
  gruppen: TaskGroup[]
): Zeile<T>[] => {
  const nachId = new Map(gruppen.map(g => [g.id, g]));
  const zeilen: Zeile<T>[] = [];
  const schonGesetzt = new Map<number, { typ: 'gruppe'; gruppe: TaskGroup; aufgaben: T[] }>();

  for (const aufgabe of aufgaben) {
    const gid = aufgabe.program_item_id;
    const gruppe = gid ? nachId.get(gid) : undefined;

    if (!gruppe) {
      zeilen.push({ typ: 'aufgabe', aufgabe });
      continue;
    }

    const vorhanden = schonGesetzt.get(gruppe.id);
    if (vorhanden) {
      vorhanden.aufgaben.push(aufgabe);
    } else {
      const neu = { typ: 'gruppe' as const, gruppe, aufgaben: [aufgabe] };
      schonGesetzt.set(gruppe.id, neu);
      zeilen.push(neu);
    }
  }

  return zeilen;
};

/* ------------------------------------------------------------------------
 * Auf- und Zuklappen
 *
 * Gemerkt werden nur die ZUGEKLAPPTEN Gruppen. Offen ist der Normalfall -
 * die Gruppe ist eine Lesehilfe, kein Versteck. Nebeneffekt: eine neu
 * angelegte Gruppe ist automatisch offen, statt in einem alten Zustand zu
 * verschwinden.
 * ---------------------------------------------------------------------- */

const schluessel = (eventId: number) => `taskGroupsCollapsed:${eventId}`;

export const zugeklappteGruppen = (eventId: number): Set<number> => {
  try {
    const roh = localStorage.getItem(schluessel(eventId));
    const liste = roh ? JSON.parse(roh) : [];
    return new Set(Array.isArray(liste) ? liste.map(Number) : []);
  } catch {
    return new Set();
  }
};

export const merkeZugeklappt = (eventId: number, ids: Set<number>): void => {
  try {
    localStorage.setItem(schluessel(eventId), JSON.stringify([...ids]));
  } catch {
    /* privater Modus o.ä. - dann eben ohne Merken */
  }
};

/** Zeit einer Gruppe als "07:30", oder leer wenn keine hinterlegt ist. */
export const gruppenZeit = (gruppe: TaskGroup): string =>
  gruppe.time ? String(gruppe.time).slice(0, 5) : '';
