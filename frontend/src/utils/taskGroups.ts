import { TaskGroup } from '../api/program';

/*
 * Aufgabengruppen in den Listen.
 *
 * Eine Gruppe ist eine Zwischenüberschrift über zusammengehörenden
 * Aufgaben. Sie wird nie zerrissen: alle ihre Aufgaben stehen unter ihr,
 * egal wonach sortiert wird.
 *
 * Wo die Gruppe steht, hängt von der gewählten Sortierung ab:
 *
 *   "manuell"  Gruppen UND Aufgaben ohne Gruppe stehen auf einer Ebene und
 *              teilen sich eine Zählung. Deshalb lässt sich eine Gruppe
 *              auch zwischen zwei lose Aufgaben schieben. Die Reihenfolge
 *              kommt vom Server (sort_order), die Pfeile ändern sie.
 *
 *   "zeit"     Alles nach Uhrzeit. Die Zeit einer Gruppe ist ihre eigene,
 *              und wenn sie keine hat, die früheste ihrer Aufgaben. Was
 *              gar keine Zeit hat, steht am Ende des Tages.
 *
 *   sonst      (Titel, Status) Die Gruppe erscheint an der Stelle ihrer
 *              ersten Aufgabe - die vorhandene Sortierung bleibt, die
 *              Gruppierung legt sich nur darüber.
 */

export interface Gruppierbar {
  id: number;
  day_number?: number;
  program_item_id?: number | null;
  scheduled_time?: string | null;
  start_time?: string | null;
  sort_order?: number | null;
}

export type Sortierung = 'manuell' | 'zeit' | 'sonst';

export type Zeile<T> =
  | { typ: 'gruppe'; gruppe: TaskGroup; aufgaben: T[] }
  | { typ: 'aufgabe'; aufgabe: T };

/** Die Zeit, nach der eine Aufgabe einsortiert wird. */
const zeitVonAufgabe = (a: Gruppierbar): string | null =>
  (a.scheduled_time || a.start_time || null) as string | null;

/**
 * Die Zeit, nach der eine Gruppe einsortiert wird: ihre eigene, sonst die
 * früheste ihrer Aufgaben. Passt zu "Gruppen ohne Zeit stehen am Ende" -
 * eine Gruppe ohne eigene Zeit, deren Aufgaben aber Zeiten haben, ist eben
 * doch verortet.
 */
export const zeitVonGruppe = <T extends Gruppierbar>(gruppe: TaskGroup, aufgaben: T[]): string | null => {
  if (gruppe.time) return String(gruppe.time);
  const zeiten = aufgaben.map(zeitVonAufgabe).filter(Boolean) as string[];
  return zeiten.length > 0 ? zeiten.sort()[0] : null;
};

export const zeilenMitGruppen = <T extends Gruppierbar>(
  aufgaben: T[],
  gruppen: TaskGroup[],
  sortierung: Sortierung = 'sonst'
): Zeile<T>[] => {
  const nachId = new Map(gruppen.map(g => [g.id, g]));
  const zeilen: Zeile<T>[] = [];
  const schonGesetzt = new Map<number, { typ: 'gruppe'; gruppe: TaskGroup; aufgaben: T[] }>();

  // Erster Durchgang: sammeln, in der Reihenfolge der uebergebenen Liste.
  // Eine Aufgabe, die auf eine Gruppe zeigt, die es nicht (mehr) gibt, wird
  // wie eine ungruppierte behandelt - lieber ohne Ueberschrift als unsichtbar.
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

  if (sortierung === 'sonst') return zeilen;

  const tagVon = (z: Zeile<T>): number =>
    z.typ === 'gruppe' ? (z.gruppe.day_number ?? 0) : (z.aufgabe.day_number ?? 0);

  if (sortierung === 'manuell') {
    /*
     * Ein gemeinsamer Rang fuer Gruppen und lose Aufgaben - der Server
     * fuehrt beide in derselben Zaehlung (utils/reihenfolge). Nur so kann
     * eine Gruppe zwischen zwei losen Aufgaben stehen.
     */
    const rang = (z: Zeile<T>) =>
      z.typ === 'gruppe' ? (z.gruppe.sort_order ?? 0) : (z.aufgabe.sort_order ?? 0);

    return [...zeilen].sort((a, b) => {
      const tag = tagVon(a) - tagVon(b);
      if (tag !== 0) return tag;
      const r = rang(a) - rang(b);
      if (r !== 0) return r;
      // Gleicher Rang kommt nach einem Import vor, bevor einmal sortiert
      // wurde - dann wenigstens stabil und nachvollziehbar.
      return a.typ === b.typ ? 0 : a.typ === 'gruppe' ? -1 : 1;
    });
  }

  // sortierung === 'zeit'
  const zeitVon = (z: Zeile<T>): string | null =>
    z.typ === 'gruppe' ? zeitVonGruppe(z.gruppe, z.aufgaben) : zeitVonAufgabe(z.aufgabe);

  return [...zeilen].sort((a, b) => {
    const tag = tagVon(a) - tagVon(b);
    if (tag !== 0) return tag;

    const za = zeitVon(a);
    const zb = zeitVon(b);
    // Ohne Zeit ans Ende des Tages.
    if (!za && !zb) return 0;
    if (!za) return 1;
    if (!zb) return -1;
    return za.localeCompare(zb);
  });
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
