import webpush from 'web-push';
import { query } from '../database/connection';
import { signalService } from './signal';
import { pushZustellung, Meldungsart } from '../utils/pushZustellung';

/*
 * Meldungen verschicken - Signal und Push - an EINER Stelle.
 *
 * Vorher stand dasselbe Verschicken sechsmal in den Routen und dreimal im
 * Zeitplaner, jedes Mal mit "await" mitten im Ablauf. Das hatte Folgen:
 *
 *   - Verspaetung: signal-cli braucht im normalen Modus Sekunden pro
 *     Nachricht und laesst immer nur einen Aufruf zur Zeit an ein Konto.
 *     Der Zeitplaner wartete auf jede einzelne - und startete trotzdem
 *     jede Minute einen neuen Durchlauf. Bei vielen Erinnerungen um 8 Uhr
 *     liefen die Durchlaeufe uebereinander, blockierten sich gegenseitig
 *     und schoben einen Rueckstau bis zu einer Stunde vor sich her. Push
 *     wartete in derselben Schlange mit.
 *   - Doppelte: Die uebereinander laufenden Durchlaeufe verschickten
 *     dieselbe Erinnerung mehrfach. Und beim Abhaken wartete die Anfrage
 *     des Handys, bis alle Signal-Nachrichten an die Leitung raus waren;
 *     bei schlechtem Netz gab das Handy vorher auf, merkte sich die
 *     Aenderung und schickte sie spaeter noch einmal - die Leitung bekam
 *     "Erledigt" ein zweites Mal.
 *
 * Jetzt:
 *   - Signal geht in EINE Warteschlange, die im Hintergrund der Reihe nach
 *     abgearbeitet wird. Wer etwas meldet, wartet nicht darauf.
 *   - Dieselbe Nachricht an dieselbe Nummer kurz hintereinander geht nur
 *     einmal raus (mehrere Konten mit derselben Handynummer, doppelte
 *     Anfragen).
 *   - Was zu alt geworden ist, verfaellt; was spuerbar spaet kommt, sagt es.
 *   - Push geht sofort und gleichzeitig an alle Geraete.
 */

// ---------------------------------------------------------------- Signal

interface SignalAuftrag {
  von: string;
  an: string;
  text: string;
  erstellt: number;
  /** Nach so vielen Millisekunden lohnt die Nachricht nicht mehr. */
  verfallMs: number;
}

/** Wie lange eine Nachricht hoechstens warten darf, je nach Art. */
export const VERFALL_MS: Record<Meldungsart, number> = {
  erinnerung: 20 * 60 * 1000,     // "in 15 Minuten" eine halbe Stunde spaeter waere falsch
  start: 20 * 60 * 1000,
  eigene: 30 * 60 * 1000,
  ueberfaellig: 60 * 60 * 1000,
  aenderung: 2 * 60 * 60 * 1000,
};

/** Ab dieser Wartezeit steht ein Hinweis in der Nachricht. */
const SPAET_AB_MS = 3 * 60 * 1000;
/** Gleiche Nachricht an gleiche Nummer innerhalb dieser Zeit: nur einmal. */
const DOPPELT_FENSTER_MS = 3 * 60 * 1000;

const schlange: SignalAuftrag[] = [];
const zuletztGesendet = new Map<string, number>();
let arbeitet = false;

const schluessel = (an: string, text: string) => `${an}\u0000${text}`;
const uhrzeit = (ms: number) =>
  new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });

/** Wie viele Nachrichten gerade warten - fuer Protokoll und Tests. */
export const signalWartend = () => schlange.length + (arbeitet ? 1 : 0);

/**
 * Signal-Nachricht in die Warteschlange stellen. Kehrt sofort zurueck.
 * false = als doppelt verworfen.
 */
export const signalSenden = (von: string, an: string, text: string, art: Meldungsart): boolean => {
  if (!von || !an) return false;
  const k = schluessel(an, text);
  const jetzt = Date.now();
  const vorhin = zuletztGesendet.get(k);
  if ((vorhin && jetzt - vorhin < DOPPELT_FENSTER_MS) || schlange.some((a) => schluessel(a.an, a.text) === k)) {
    console.log(`[Signal] Doppelte Nachricht an ${an} verworfen`);
    return false;
  }
  zuletztGesendet.set(k, jetzt);
  schlange.push({ von, an, text, erstellt: jetzt, verfallMs: VERFALL_MS[art] });
  void abarbeiten();
  return true;
};

const abarbeiten = async () => {
  if (arbeitet) return;
  arbeitet = true;
  try {
    while (schlange.length > 0) {
      const a = schlange.shift()!;
      const wartezeit = Date.now() - a.erstellt;
      if (wartezeit > a.verfallMs) {
        console.warn(`[Signal] Nachricht an ${a.an} nach ${Math.round(wartezeit / 60000)} Min verworfen - zu alt`);
        continue;
      }
      const text = wartezeit > SPAET_AB_MS
        ? `⏱ Verspätet – ausgelöst um ${uhrzeit(a.erstellt)} Uhr\n\n${a.text}`
        : a.text;
      const t0 = Date.now();
      await signalService.sendMessage(a.von, a.an, text);
      const dauer = Date.now() - t0;
      if (dauer > 10_000 || schlange.length > 5) {
        console.warn(`[Signal] Senden dauerte ${Math.round(dauer / 1000)} s, noch ${schlange.length} in der Warteschlange`);
      }
    }
  } finally {
    arbeitet = false;
    // Alte Eintraege der Doppelt-Sperre aufraeumen.
    const grenze = Date.now() - DOPPELT_FENSTER_MS;
    for (const [k, t] of zuletztGesendet) if (t < grenze) zuletztGesendet.delete(k);
  }
};

/**
 * Mit welchem Konto die Veranstaltung schreibt: das erste gekoppelte der
 * Leitung, die Hauptleitung zuerst.
 */
export const absenderFuer = async (eventId: number): Promise<string | null> => {
  const r = await query(
    `SELECT u.signal_account_number FROM event_teamleiter et JOIN users u ON u.id = et.user_id
     WHERE et.event_id = $1 AND u.signal_linked = true AND u.signal_account_number IS NOT NULL
     ORDER BY et.is_primary DESC, et.id ASC LIMIT 1`,
    [eventId]
  );
  return r.rows[0]?.signal_account_number ?? null;
};

// ------------------------------------------------------------------ Push

/**
 * Push an alle Geraete dieser Personen - gleichzeitig, ohne aufeinander
 * zu warten. Abgelaufene Geraete werden ausgetragen.
 */
export const pushSenden = async (
  userIds: number[], payload: object, task: any, instanzId: number | null, art: Meldungsart
): Promise<void> => {
  if (userIds.length === 0) return;
  const subs = await query(
    `SELECT DISTINCT ON (ps.endpoint) ps.id, ps.user_id, ps.endpoint, ps.keys_p256dh, ps.keys_auth
     FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id
     WHERE ps.user_id = ANY($1::int[]) AND u.web_push_enabled IS DISTINCT FROM false`,
    [userIds]
  );
  const zustellung = pushZustellung(new Date(), task, instanzId, art);
  const text = JSON.stringify(payload);
  await Promise.all(subs.rows.map(async (sub: any) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.keys_p256dh, auth: sub.keys_auth } },
        text, zustellung
      );
    } catch (e: any) {
      if (e.statusCode === 404 || e.statusCode === 410) {
        await query('DELETE FROM push_subscriptions WHERE id = $1', [sub.id]);
      } else {
        console.error('Push-Fehler:', e.statusCode || e.message);
      }
    }
  }));
};

// ------------------------------------------------------- Nachrichtentext

const hhmm = (t: any) => (t ? String(t).slice(0, 5) : '');

/** Zeilen mit den Zeiten der Aufgabe - leer, wenn sie keine hat. */
export const zeitZeilen = (t: any): string => {
  const z: string[] = [];
  if (t.scheduled_time) z.push(`Geplant: ${hhmm(t.scheduled_time)} Uhr`);
  if (t.start_time) z.push(`Start: ${hhmm(t.start_time)} Uhr`);
  if (t.end_time) z.push(`Ende: ${hhmm(t.end_time)} Uhr`);
  return z.length ? `\n\n${z.join('\n')}` : '';
};

/*
 * Beschreibung fuer Signal - mit ihren Zeilenumbruechen. Die erste Zeile
 * bekommt das Symbol, die weiteren werden eingerueckt, damit klar bleibt,
 * was zur Beschreibung gehoert.
 */
export const beschreibungZeilen = (t: any): string => {
  const b = String(t.description ?? '').replace(/\r\n?/g, '\n').trim();
  if (!b) return '';
  return `\n📋 ${b.split('\n').join('\n     ')}`;
};

export const STATUS_TEXT: Record<string, string> = {
  not_started: 'Offen', in_progress: 'In Arbeit', completed: 'Erledigt', overdue: 'Überfällig',
};

// --------------------------------------------- Statusmeldung an die Leitung

/** Ohne eigene Auswahl: was die Leitung schon immer gemeldet bekam. */
export const LEITUNG_STANDARD = ['not_started', 'in_progress', 'completed'];

/**
 * Die Leitung ueber einen Statuswechsel informieren.
 *
 * Nur bei einem ECHTEN Wechsel - wer eine schon erledigte Aufgabe noch
 * einmal abhakt (jede eingeteilte Person tut das fuer sich), loest keine
 * weitere Meldung aus. Jede Person aus der Leitung bekommt nur die Status,
 * die sie in ihren Einstellungen gewaehlt hat, und oeffentliche Aufgaben
 * nur, wenn sie das will. Wer die Aenderung selbst gemacht hat, bekommt
 * nichts.
 *
 * Kehrt sofort zurueck; Fehler landen im Log.
 */
export const meldeLeitung = (
  task: any, neu: string, alt: string | null, wer: { id: number | null; name: string }
): void => {
  if (!task || neu === alt || task.auto_complete) return;
  void (async () => {
    const leitung = await query(
      `SELECT DISTINCT u.id, u.signal_enabled, u.signal_phone_number
       FROM event_teamleiter et JOIN users u ON u.id = et.user_id
       WHERE et.event_id = $1
         AND ($2::int IS NULL OR u.id <> $2)
         AND u.teamleiter_status_notifications IS DISTINCT FROM false
         AND $3 = ANY(COALESCE(u.leitung_meldungen, $4::text[]))
         AND ($5 = false OR u.leitung_oeffentliche IS DISTINCT FROM false)`,
      [task.event_id, wer.id, neu, LEITUNG_STANDARD, !!task.is_public]
    );
    if (leitung.rows.length === 0) return;

    const titel = `Status wurde zu "${STATUS_TEXT[neu] || neu}" geändert`;
    const eventName = task.event_name
      ?? (await query('SELECT name FROM events WHERE id = $1', [task.event_id])).rows[0]?.name ?? '';

    await pushSenden(
      leitung.rows.map((u: any) => u.id),
      {
        title: titel, body: `${wer.name}: "${task.title}"`,
        icon: '/icon.png', badge: '/badge.png', vibrate: [200, 100, 200],
        requireInteraction: neu === 'overdue',
      },
      task, null, 'aenderung'
    );

    const von = await absenderFuer(task.event_id);
    if (!von) return;
    const text = `${titel}\n\n${task.title}${beschreibungZeilen(task)}${zeitZeilen(task)}\n\n🎪 ${eventName}\n👤 ${wer.name}`;
    const nummern = new Set<string>();
    for (const u of leitung.rows) {
      if (u.signal_enabled && u.signal_phone_number) nummern.add(u.signal_phone_number);
    }
    for (const n of nummern) signalSenden(von, n, text, 'aenderung');
  })().catch((e) => console.error('Meldung an Leitung:', e));
};

// ------------------------------------ Statusmeldung an die Mitarbeitenden

/**
 * Leitung oder Admin hat den Status geaendert: die Eingeteilten erfahren
 * es - bei einer oeffentlichen Aufgabe der ganze Pool. Wer die Aenderung
 * gemacht hat, bekommt nichts. Kehrt sofort zurueck.
 */
export const meldeMitarbeitenden = (
  task: any, neu: string, wer: { id: number; name: string }
): void => {
  if (!task || task.auto_complete) return;
  void (async () => {
    const empfaenger = task.is_public
      ? await query(
          `SELECT DISTINCT u.id, u.signal_enabled, u.signal_phone_number
           FROM event_staff es JOIN users u ON u.id = es.user_id
           WHERE es.event_id = $1 AND u.role = 'staff' AND u.id <> $2`,
          [task.event_id, wer.id])
      : await query(
          `SELECT DISTINCT u.id, u.signal_enabled, u.signal_phone_number
           FROM task_assignments ta JOIN users u ON u.id = ta.user_id
           WHERE ta.task_id = $1 AND u.id <> $2`,
          [task.id, wer.id]);
    if (empfaenger.rows.length === 0) return;

    const titel = task.is_public ? 'Öffentliche Aufgabe aktualisiert' : 'Aufgaben-Status geändert';
    await pushSenden(
      empfaenger.rows.map((u: any) => u.id),
      {
        title: titel, body: `"${task.title}" ist jetzt: ${STATUS_TEXT[neu] || neu}`,
        icon: '/icon.png', badge: '/badge.png', vibrate: [200, 100, 200],
        requireInteraction: neu === 'overdue',
      },
      task, null, 'aenderung'
    );

    const von = await absenderFuer(task.event_id);
    if (!von) return;
    const text = `${titel}\n\n${task.title}\nist jetzt: ${STATUS_TEXT[neu] || neu}${zeitZeilen(task)}\n\n👤 Geändert von: ${wer.name}`;
    const nummern = new Set<string>();
    for (const u of empfaenger.rows) {
      if (u.signal_enabled && u.signal_phone_number) nummern.add(u.signal_phone_number);
    }
    for (const n of nummern) signalSenden(von, n, text, 'aenderung');
  })().catch((e) => console.error('Meldung an Mitarbeitende:', e));
};
