/*
 * Beschreibungen mit Zeilenumbruechen.
 *
 * Gespeichert wurden die Umbrueche immer - angezeigt aber nicht: HTML
 * fasst Zeilenumbrueche zu einem Leerzeichen zusammen. Ausgeschrieben
 * zeigen die Ansichten sie jetzt (white-space: pre-line); die kurzen
 * Vorschauen in Tabellen bleiben einzeilig und bieten "mehr" an, sobald
 * es eine weitere Zeile gibt.
 */
import type React from 'react';

/** Fuer ausgeschriebene Beschreibungen. */
export const MIT_UMBRUECHEN: React.CSSProperties = { whiteSpace: 'pre-line', overflowWrap: 'anywhere' };

/** Einzeilige Vorschau: Umbrueche als " · ", gekuerzt auf hoechstens n Zeichen. */
export const vorschau = (text: string, n: number): string => {
  const eine = text.trim().replace(/\s*\n+\s*/g, ' · ');
  return eine.length > n ? `${eine.substring(0, n)}...` : eine;
};

/** Ist an der Vorschau etwas abgeschnitten? */
export const hatMehr = (text: string, n: number): boolean =>
  text.trim().length > n || /\n/.test(text.trim());

/**
 * Fuer Karten: zu lang zum vollstaendigen Zeigen? Kurze Beschreibungen mit
 * wenigen Zeilen stehen ganz da - mit ihren Umbruechen, ohne "mehr".
 */
export const istLang = (text: string, n: number, zeilen = 4): boolean =>
  text.trim().length > n || text.trim().split('\n').length > zeilen;
