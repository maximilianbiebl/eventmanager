/*
 * Anmeldenamen vereinheitlichen.
 *
 * Der Name ist der Benutzername. Was in einer CSV aus Excel, Word oder vom
 * Mac steht, kann gleich aussehen und trotzdem anders sein:
 *   - zwei Leerzeichen zwischen Vor- und Nachname (der Browser zeigt eins),
 *   - ein geschuetztes Leerzeichen (U+00A0) statt eines normalen,
 *   - "ü" als u + Trema-Zeichen (zerlegte Form, NFD) statt als ein Zeichen.
 * Beim Anmelden tippt man die gewoehnliche Form - und "Benutzername oder
 * Passwort falsch" war die Folge, obwohl der Name in der Liste stimmte.
 *
 * Deshalb wird jeder Name beim Speichern UND beim Anmelden gleich
 * behandelt: zusammengesetzte Form (NFC), jede Art Leerraum als ein
 * einfaches Leerzeichen, nichts am Anfang oder Ende. Bestehende Namen hat
 * Migration 028 so bereinigt.
 */
export const normalisiereName = (name: unknown): string =>
  String(name ?? '')
    .normalize('NFC')
    .replace(/[\s   ​﻿]+/g, ' ')
    .trim();
