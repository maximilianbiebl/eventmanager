import { query } from '../database/connection';
import { signalService } from './signal';

/*
 * Stimmt die Signal-Kopplung noch?
 *
 * Bisher wurde das genau einmal festgestellt - beim Koppeln - und danach nie
 * wieder. Wurde das Geraet am Handy unter "Verknuepfte Geraete" entfernt
 * (oder von Signal abgemeldet), stand in der App weiter "Signal verbunden",
 * und jede Nachricht scheiterte still mit "User ... is not registered".
 *
 * Jetzt:
 *   - alle 15 Minuten und beim Oeffnen der Signal-Einstellungen wird
 *     abgeglichen, welche Kopplungen signal-cli noch als gueltig fuehrt;
 *   - scheitert ein Versand, weil der Absender nicht mehr registriert ist,
 *     wird das sofort festgehalten;
 *   - eine verlorene Kopplung bekommt signal_getrennt_am - daran erkennt die
 *     Oberflaeche beim Anmelden, dass sie Bescheid sagen muss.
 */

/** Kopplung einer Nummer als verloren eintragen und die Reste in signal-cli aufraeumen. */
export const markiereGetrennt = async (nummer: string): Promise<void> => {
  const r = await query(
    `UPDATE users SET signal_linked = false, signal_getrennt_am = NOW()
     WHERE signal_account_number = $1 AND signal_linked = true
     RETURNING id, name`,
    [nummer]
  );
  if (r.rows.length === 0) return;
  console.warn(`[Signal] Kopplung von ${nummer} besteht nicht mehr (${r.rows.map((u: any) => u.name).join(', ')})`);
  /*
   * Nur wenn signal-cli das Konto selbst nicht mehr fuer gueltig haelt
   * (ignore_registered=false) - so wird nie eine funktionierende Kopplung
   * geloescht. Die Reste stoeren sonst bei jedem Aufruf ("Ignoring ...")
   * und beim erneuten Koppeln derselben Nummer.
   */
  await signalService.loescheLokaleDaten(nummer, false);
};

signalService.beiVerlorenerKopplung = markiereGetrennt;

let letztePruefung = 0;

/**
 * Alle als gekoppelt gefuehrten Nummern gegen signal-cli pruefen.
 * Ist signal-cli nicht erreichbar, wird NICHTS geaendert - ein abgestuerzter
 * Container ist keine getrennte Kopplung.
 */
export const pruefeKopplungen = async (): Promise<void> => {
  letztePruefung = Date.now();
  const gekoppelt = await query(
    `SELECT DISTINCT signal_account_number AS nummer FROM users
     WHERE signal_linked = true AND signal_account_number IS NOT NULL`
  );
  if (gekoppelt.rows.length === 0) return;

  const gueltig = await signalService.getAccounts();
  if (gueltig === null) return;

  for (const { nummer } of gekoppelt.rows) {
    if (!gueltig.includes(nummer)) await markiereGetrennt(nummer);
  }
};

/** Wie pruefeKopplungen, aber hoechstens einmal pro Minute - fuer Seitenaufrufe. */
export const pruefeKopplungenGedrosselt = async (): Promise<void> => {
  if (Date.now() - letztePruefung < 60_000) return;
  await pruefeKopplungen();
};

/*
 * Alle gekoppelten Konten wach halten - siehe signalService.lebenszeichen.
 * Laeuft alle 12 Stunden; meldet ein Konto "nicht registriert", ist die
 * Kopplung weg und wird wie oben festgehalten.
 */
export const halteKopplungenWach = async (): Promise<void> => {
  const r = await query(
    `SELECT DISTINCT signal_account_number AS nummer FROM users
     WHERE signal_linked = true AND signal_account_number IS NOT NULL
       AND signal_account_number NOT LIKE '+temp%'`
  );
  for (const { nummer } of r.rows) {
    const lebt = await signalService.lebenszeichen(nummer);
    if (lebt === false) await markiereGetrennt(nummer);
  }
};
