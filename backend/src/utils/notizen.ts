/*
 * Interne Notizen - und wie sie im Mitarbeiterbereich draussen bleiben.
 *
 * Die Notiz ist ein Zuruf unter der Leitung ("Filter der Maschine ist hin",
 * "Schluessel liegt beim Hausmeister"). Sie steht in derselben Zeile wie die
 * Aufgabe, und die Abfragen des Mitarbeiterbereichs holen diese Zeile mit
 * SELECT t.* - eine neue Spalte waere dort also ungefragt mitgefahren.
 *
 * Statt alle diese Abfragen auf Spaltenlisten umzuschreiben (jede kuenftige
 * Spalte waere wieder eine Entscheidung), fliegt die Notiz hier am Ausgang
 * raus: einmal fuer die Antworten des Mitarbeiterbereichs, einmal fuer die
 * SSE-Meldungen - die gehen an ALLE offenen Sitzungen, auch an die von
 * Mitarbeitern.
 */

/** Eine Zeile ohne ihre Notiz. null/undefined bleiben, wie sie sind. */
export const ohneNotiz = <T extends Record<string, any>>(zeile: T): T => {
  if (!zeile || typeof zeile !== 'object') return zeile;
  const { note, ...rest } = zeile;
  return rest as T;
};

/** Dasselbe fuer eine Liste. */
export const ohneNotizen = <T extends Record<string, any>>(zeilen: T[]): T[] =>
  zeilen.map(ohneNotiz);

/**
 * Notiztext aus dem Formular: leer bedeutet "keine Notiz".
 *
 * Ein leerer String wuerde als Notiz gelten und in der Liste ein
 * Notizzeichen stehen lassen, hinter dem nichts steht.
 */
export const notizOderNull = (wert: unknown): string | null => {
  if (wert === null || wert === undefined) return null;
  const s = String(wert).trim();
  return s === '' ? null : s;
};
