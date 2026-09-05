/*
 * Farben der Aufgabengruppen.
 *
 * Gespeichert wird ein NAME, kein Hexwert - die Oberflaeche uebersetzt ihn
 * in Farbtoken, damit das dunkle Thema eigene Werte setzen kann. Was nicht
 * in der Liste steht, wird zu "keine Farbe": lieber farblos als eine Farbe,
 * die im dunklen Thema niemand lesen kann.
 */
export const GRUPPEN_FARBEN = ['blau', 'gruen', 'gelb', 'rot', 'violett', 'tuerkis', 'braun', 'grau'];

export const farbeOderNull = (wert: unknown): string | null => {
  const s = String(wert ?? '').trim().toLowerCase();
  return GRUPPEN_FARBEN.includes(s) ? s : null;
};
