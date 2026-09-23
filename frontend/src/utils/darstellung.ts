/*
 * Schriftgroesse und Abstaende der Oberflaeche.
 *
 * Zwei Regler in den Einstellungen, zwei Zahlen: beide sind Faktoren, kein
 * fester Wert. So bleiben die Groessenverhaeltnisse erhalten - eine
 * Ueberschrift bleibt groesser als ihr Fliesstext, nur eben alles etwas
 * groesser oder kleiner.
 *
 *   --ui-skala    -> Schriftgroesse. Haengt an der Wurzel-Schriftgroesse;
 *                    alles, was in rem gerechnet ist, folgt automatisch.
 *   --ui-abstand  -> Luft in den Listen: Zellen der Tabelle, Karten,
 *                    Werkzeugleiste.
 *
 * Gespeichert wird geraetweise (localStorage) - wie das Farbschema. Wer an
 * einem grossen Bildschirm sitzt, will nicht dieselbe Schriftgroesse wie
 * auf dem Handy in der Hand.
 */

export interface Darstellung {
  /** 0.75 bis 1.75 - 1 ist die gewohnte Groesse. */
  skala: number;
  /** 0.6 bis 2 - 1 ist der gewohnte Abstand. */
  abstand: number;
}

export const STANDARD: Darstellung = { skala: 1, abstand: 1 };

/*
 * Die Spanne ist bewusst weit: am Schreibtisch will man oft mehr Zeilen
 * sehen, in der Hand oder mit Brille deutlich groessere Schrift. Die
 * Enden sind Absicht und keine Empfehlung - wer nichts anfasst, bleibt
 * bei 100 %.
 *
 * Aeltere gespeicherte Werte liegen immer innerhalb dieser Spanne; die
 * Grenzen sind nur weiter geworden, nie enger.
 */
export const GRENZEN = {
  skala: { min: 0.75, max: 1.75, schritt: 0.05 },
  abstand: { min: 0.6, max: 2, schritt: 0.05 },
};

const SCHLUESSEL = 'uiDarstellung';

const inGrenzen = (wert: unknown, grenze: { min: number; max: number }, ersatz: number) => {
  const n = Number(wert);
  if (!Number.isFinite(n)) return ersatz;
  return Math.min(grenze.max, Math.max(grenze.min, n));
};

export const leseDarstellung = (): Darstellung => {
  try {
    const roh = localStorage.getItem(SCHLUESSEL);
    if (!roh) return STANDARD;
    const d = JSON.parse(roh);
    return {
      skala: inGrenzen(d?.skala, GRENZEN.skala, STANDARD.skala),
      abstand: inGrenzen(d?.abstand, GRENZEN.abstand, STANDARD.abstand),
    };
  } catch {
    return STANDARD;
  }
};

/** Setzt die beiden Werte am <html> - alles andere haengt daran. */
export const wendeDarstellungAn = (d: Darstellung): void => {
  const wurzel = document.documentElement;
  wurzel.style.setProperty('--ui-skala', String(d.skala));
  wurzel.style.setProperty('--ui-abstand', String(d.abstand));
};

export const merkeDarstellung = (d: Darstellung): void => {
  try {
    localStorage.setItem(SCHLUESSEL, JSON.stringify(d));
  } catch {
    // Kein Speicher (privates Fenster): dann gilt die Einstellung eben
    // nur fuer diese Sitzung.
  }
  wendeDarstellungAn(d);
};
