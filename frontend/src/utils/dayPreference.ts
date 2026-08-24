import { currentDayNumber } from './date';

/*
 * Merkt sich, welchen Veranstaltungstag man zuletzt angesehen hat.
 *
 * Zwei Wünsche, die sich widersprechen können: die Seite soll die eigene
 * Auswahl behalten UND von selbst auf den heutigen Tag springen. Gelöst
 * über das Speicherdatum - innerhalb desselben Kalendertages gilt die
 * eigene Auswahl, an einem neuen Tag gewinnt der aktuelle
 * Veranstaltungstag. So bleibt ein bewusstes "Tag 2" beim Blättern
 * erhalten, ist am nächsten Morgen aber nicht mehr im Weg.
 */

export type DaySelection = number | 'all';

const PREFIX = 'selectedDay:';

const todayKey = (): string => {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

interface Stored {
  day: DaySelection;
  saved: string;
}

const read = (scope: string): Stored | null => {
  try {
    const raw = localStorage.getItem(PREFIX + scope);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.day !== 'all' && typeof parsed.day !== 'number') return null;
    return parsed as Stored;
  } catch {
    return null;
  }
};

export const storeDay = (scope: string, day: DaySelection): void => {
  try {
    localStorage.setItem(PREFIX + scope, JSON.stringify({ day, saved: todayKey() }));
  } catch {
    /* Privater Modus o.ä. - die Auswahl geht dann nur nicht verloren-sicher. */
  }
};

/**
 * Startwert für die Tagesauswahl: heute getroffene Auswahl, sonst der
 * heutige Veranstaltungstag, sonst die ältere Auswahl, sonst "Alle Tage".
 *
 * `todayDay` ist der heutige Veranstaltungstag oder null. Im
 * Mitarbeiterbereich stammt er aus den Aufgaben selbst, im Admin-Bereich
 * aus Startdatum und Dauer der Durchführung.
 */
export const resolveInitialDay = (scope: string, todayDay: number | null): DaySelection => {
  const stored = read(scope);
  if (stored && stored.saved === todayKey()) return stored.day;
  if (todayDay !== null) return todayDay;
  return stored ? stored.day : 'all';
};

/** Bequemlichkeitsvariante für eine einzelne Durchführung. */
export const resolveInitialDayForEvent = (
  scope: string,
  startDate: unknown,
  days: number | undefined
): DaySelection => resolveInitialDay(scope, currentDayNumber(startDate, days));
