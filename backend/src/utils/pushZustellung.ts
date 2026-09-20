/*
 * Wie lange eine Benachrichtigung noch etwas wert ist - und welche sie
 * ersetzt.
 *
 * Der Push-Dienst (Google, Apple, Mozilla) hebt eine Nachricht auf, wenn
 * das Geraet gerade kein Netz hat, und stellt sie beim Wiederverbinden zu.
 * Ohne Angabe gilt die Voreinstellung der Bibliothek: VIER WOCHEN. Wer eine
 * Stunde im Funkloch war, bekam beim Auftauchen jede Erinnerung dieser
 * Stunde auf einmal - auch die zu Aufgaben, die laengst vorbei sind.
 *
 * Zwei Angaben raeumen das auf:
 *
 *   TTL   Sekunden, die die Nachricht hoechstens warten darf. Danach wirft
 *         der Push-Dienst sie weg. Gerechnet wird bis zu dem Moment, in dem
 *         die Erinnerung nichts mehr nuetzt - dem Ende der Aufgabe, sonst
 *         ihrem Beginn - plus einer kurzen Gnadenfrist.
 *
 *   topic Ein Kennzeichen je Aufgabe. Trifft eine neue Nachricht mit
 *         demselben topic ein, waehrend die alte noch wartet, ERSETZT sie
 *         diese. So liegt hoechstens EINE Nachricht je Aufgabe in der
 *         Warteschlange, statt "15 Minuten vorher", "startet jetzt" und
 *         "ueberfaellig" nacheinander.
 *
 * Erlaubte Zeichen im topic: A-Z a-z 0-9 - _ , hoechstens 32 Zeichen
 * (so pruefen es die Bibliothek und der Standard).
 */

export interface Zustellung {
  /** Sekunden, die die Nachricht beim Push-Dienst warten darf. */
  TTL: number;
  /** Ersetzt eine noch wartende Nachricht derselben Aufgabe. */
  topic?: string;
}

/** Art der Meldung - davon haengt ab, wie schnell sie altert. */
export type Meldungsart = 'erinnerung' | 'start' | 'ueberfaellig' | 'eigene';

/*
 * Kuerzer als fuenf Minuten ist sinnlos - ein kurzer Funkloch-Moment
 * wuerde die Nachricht sonst schlucken. Laenger als eine Stunde ebenso:
 * was eine Stunde alt ist, sagt einem niemand mehr nuetzlich.
 */
export const TTL_MINDESTENS = 5 * 60;
export const TTL_HOECHSTENS = 60 * 60;

/** Nach dem Ende einer Aufgabe ist eine Erinnerung noch kurz hilfreich. */
const GNADENFRIST_MS = 15 * 60 * 1000;

/** "14:30:00" am Tag von `jetzt` - die Aufgaben tragen nur Uhrzeiten. */
const heuteUm = (jetzt: Date, zeit: string): Date => {
  const [h, m] = zeit.split(':');
  const d = new Date(jetzt);
  d.setHours(Number(h), Number(m), 0, 0);
  return d;
};

interface Aufgabenzeiten {
  id: number;
  scheduled_time?: string | null;
  start_time?: string | null;
  end_time?: string | null;
}

/**
 * Wann die Meldung nichts mehr nuetzt.
 *
 * Fuer Erinnerungen ist das das Ende der Aufgabe (sonst ihr Beginn, sonst
 * die geplante Zeit) plus Gnadenfrist. "Ueberfaellig" und selbst gesetzte
 * Erinnerungen altern von sich aus: eine halbe Stunde spaeter will das
 * niemand mehr wissen.
 */
const verfaelltUm = (jetzt: Date, aufgabe: Aufgabenzeiten, art: Meldungsart): Date => {
  if (art === 'ueberfaellig' || art === 'eigene') {
    return new Date(jetzt.getTime() + 30 * 60 * 1000);
  }
  const zeit = aufgabe.end_time || aufgabe.start_time || aufgabe.scheduled_time;
  if (!zeit) return new Date(jetzt.getTime() + 30 * 60 * 1000);
  return new Date(heuteUm(jetzt, zeit).getTime() + GNADENFRIST_MS);
};

export const pushZustellung = (
  jetzt: Date,
  aufgabe: Aufgabenzeiten,
  instanzId: number,
  art: Meldungsart
): Zustellung => {
  const sekunden = Math.round((verfaelltUm(jetzt, aufgabe, art).getTime() - jetzt.getTime()) / 1000);
  return {
    TTL: Math.min(TTL_HOECHSTENS, Math.max(TTL_MINDESTENS, sekunden)),
    // Je Aufgabe und Durchfuehrung - nicht je Art: die neuere Meldung zu
    // derselben Aufgabe soll die aeltere ersetzen.
    topic: `t${aufgabe.id}-i${instanzId}`,
  };
};
