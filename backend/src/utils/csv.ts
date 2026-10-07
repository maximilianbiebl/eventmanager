/*
 * CSV an einer Stelle.
 *
 * Lesen und Schreiben lagen vorher in drei Dateien nebeneinander, in
 * unterschiedlicher Qualitaet: users.ts konnte verdoppelte
 * Anfuehrungszeichen, tasks.ts und events.ts trennten stumpfer. Wer eine
 * Datei exportierte und wieder einlas, bekam je nach Weg ein anderes
 * Ergebnis.
 */

/*
 * Byte-Order-Mark vor jede exportierte Datei.
 *
 * Ohne es oeffnet Excel die Datei in der Zeichensatz-Vorgabe des Systems
 * (unter Windows meist Windows-1252) statt in UTF-8: aus "Frühstück" wird
 * "FrÃ¼hstÃ¼ck". Drei Bytes am Anfang sagen dem Programm, woran es ist;
 * Editoren und Tabellenprogramme blenden sie aus.
 */
export const CSV_BOM = '﻿';

/** Fuehrendes BOM abstreifen - sonst heisst die erste Spalte "﻿id". */
export const ohneBom = (text: string): string => text.replace(/^﻿/, '');

/*
 * Hochgeladene Datei als Text - in der Kodierung, in der sie geschrieben ist.
 *
 * Excel unter Windows speichert "CSV (Trennzeichen-getrennt)" nicht in
 * UTF-8, sondern in Windows-1252. Als UTF-8 gelesen wurde aus "Jürgen"
 * "J�rgen" - das Konto hiess dann so, und die Anmeldung als "Jürgen"
 * fand niemanden. Gueltiges UTF-8 bleibt UTF-8; alles andere wird als
 * Windows-1252 gelesen (deckt Umlaute, ß und € ab).
 */
export const csvTextAus = (daten: Buffer): string => {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(daten);
  } catch {
    text = new TextDecoder('windows-1252').decode(daten);
  }
  return ohneBom(text);
};

/*
 * Trennzeichen aus der Kopfzeile: Komma oder Semikolon.
 *
 * Das deutsche Excel trennt mit Semikolon. Bisher wurde nur am Komma
 * getrennt - die Kopfzeile "name;role" war dann EINE Spalte, und jede
 * Zeile wurde mit "Kein Name angegeben" abgelehnt. Gezaehlt wird nur
 * ausserhalb von Anfuehrungszeichen.
 */
export const trennzeichenVon = (kopfzeile: string): ',' | ';' => {
  let komma = 0, semikolon = 0, inQuotes = false;
  for (const c of kopfzeile) {
    if (c === '"') inQuotes = !inQuotes;
    else if (!inQuotes && c === ',') komma++;
    else if (!inQuotes && c === ';') semikolon++;
  }
  return semikolon > komma ? ';' : ',';
};

/*
 * Eine Zeile zerlegen.
 *
 * Beachtet Anfuehrungszeichen: ein Komma darin trennt nicht ("Mustermann,
 * Max" bleibt ein Feld), und "" innerhalb eines Feldes ist ein einzelnes
 * Anfuehrungszeichen - so schreibt es das Format vor.
 */
export const parseCsvLine = (line: string, trenner: ',' | ';' = ','): string[] => {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }  // "" = ein Anfuehrungszeichen
        else inQuotes = false;
      } else cur += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === trenner) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  out.push(cur.trim());
  return out;
};

/*
 * Ein Textfeld fuer die Ausgabe. Immer in Anfuehrungszeichen, enthaltene
 * werden verdoppelt - damit reisst kein Titel wie 'Der "grosse" Abend' und
 * kein Name mit Komma die Zeile auseinander.
 */
export const csvFeld = (wert: unknown): string =>
  `"${String(wert ?? '').replace(/"/g, '""')}"`;
