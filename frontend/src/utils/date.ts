/*
 * Datumshilfen.
 *
 * Postgres liefert ein `date`-Feld über den pg-Treiber als JS-Date, das als
 * ISO-Zeitstempel serialisiert wird - und zwar als Mitternacht in der
 * SERVERZEIT, umgerechnet nach UTC. Bei positivem Zeitversatz steht dort
 * also z.B. "2025-10-06T22:00:00.000Z" für den 7. Oktober.
 *
 * Ein simples .slice(0, 10) nimmt den UTC-Anteil und liefert dann den
 * Vortag. Deshalb muss über die LOKALEN Komponenten gerechnet werden -
 * ausser der Wert ist bereits ein reines "YYYY-MM-DD", denn das würde
 * new Date() als UTC-Mitternacht lesen und bei negativem Versatz wieder
 * einen Tag zurückrutschen.
 */

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Wert für <input type="date"> ("YYYY-MM-DD"), zeitzonensicher. */
export const toDateInputValue = (value: unknown): string => {
  if (!value) return '';
  const s = String(value);
  if (PLAIN_DATE.test(s)) return s;

  const d = new Date(s);
  if (isNaN(d.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

/** Date-Objekt aus einem Datumswert, ebenfalls ohne Zeitzonen-Versatz. */
export const toLocalDate = (value: unknown): Date | null => {
  if (!value) return null;
  const s = String(value);
  if (PLAIN_DATE.test(s)) {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
  }
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

/**
 * Welcher Veranstaltungstag ist heute? 1-basiert, oder null wenn heute
 * ausserhalb der Veranstaltung liegt (oder kein Startdatum gesetzt ist).
 */
export const currentDayNumber = (
  startDate: unknown,
  days: number | undefined
): number | null => {
  const start = toLocalDate(startDate);
  if (!start || !days || days < 1) return null;
  if (start.getFullYear() < 2000) return null;

  const today = new Date();
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffMs = todayMidnight.getTime() - start.getTime();
  const day = Math.floor(diffMs / 86400000) + 1;

  return day >= 1 && day <= days ? day : null;
};
