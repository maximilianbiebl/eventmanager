import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config from '../config';
import { query } from '../database/connection';

/*
 * Aenderungsprotokoll der Leitung.
 *
 * Damit die Co-Leitung nachvollziehen kann, was die andere Leitung gemacht
 * hat - und beim naechsten Oeffnen der App sieht, was sich in ihrer
 * Abwesenheit getan hat (routes/aenderungen).
 *
 * Eine Middleware vor allen API-Routen statt Aufrufe in jeder Route: die
 * Routen bleiben, wie sie sind, und was protokolliert wird, steht hier an
 * einer Stelle. Jede Regel kann VORHER nachsehen (fuer "von ... auf ..."
 * und fuer Geloeschtes, das danach nicht mehr da ist) und schreibt NACHHER
 * einen Satz - nur wenn die Anfrage gelungen ist.
 *
 * Erfasst wird nur, was Leitung und Admins tun. Mitarbeiter haken ab und
 * stellen Erinnerungen; das gehoert nicht hierher.
 *
 * Ein Fehler beim Protokollieren darf die eigentliche Aenderung nie
 * stoeren: alles hier ist abgefangen und landet hoechstens im Log.
 */

interface Eintrag {
  eventId: number;
  art: string;
  text: string;
  taskId?: number | null;
  /*
   * Gleicher Eintrag derselben Person kurz zuvor: nur dessen Zeit
   * auffrischen statt eine neue Zeile. Fuer die Pfeile - zehn Klicks, bis
   * eine Aufgabe an ihrem Platz ist, sind EINE Aenderung.
   */
  zusammenfassen?: boolean;
}

interface Kontext {
  req: Request;
  treffer: RegExpMatchArray;
  body: any;
}

interface Regel {
  methode: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  pfad: RegExp;
  vorher?: (k: Kontext) => Promise<any>;
  nachher: (k: Kontext, vorher: any, antwort: any) => Promise<Eintrag | Eintrag[] | null>;
}

// ---- Hilfen ---------------------------------------------------------------

const zahl = (x: unknown): number => Number(x);
const uhr = (t: any): string => (t ? String(t).slice(0, 5) : '–');
const STATUS: Record<string, string> = {
  not_started: 'Offen', in_progress: 'In Arbeit', completed: 'Erledigt', overdue: 'Überfällig',
};
const status = (s: any) => STATUS[s] || String(s ?? '–');
const liste = (namen: string[], max = 6) =>
  namen.length <= max ? namen.join(', ') : `${namen.slice(0, max).join(', ')} und ${namen.length - max} weitere`;
const aufgaben = (n: number) => (n === 1 ? '1 Aufgabe' : `${n} Aufgaben`);

const aufgabe = async (id: number) => {
  const r = await query(
    `SELECT t.*, pi.title AS gruppe FROM tasks t LEFT JOIN program_items pi ON pi.id = t.program_item_id WHERE t.id = $1`,
    [id]
  );
  return r.rows[0] || null;
};
const gruppe = async (id: number) => (await query('SELECT * FROM program_items WHERE id = $1', [id])).rows[0] || null;
const serie = async (id: number) => (await query('SELECT * FROM task_series WHERE id = $1', [id])).rows[0] || null;
const namenVon = async (ids: unknown): Promise<string[]> => {
  const z = Array.isArray(ids) ? ids.map(zahl).filter(Number.isInteger) : [];
  if (z.length === 0) return [];
  const r = await query('SELECT name FROM users WHERE id = ANY($1::int[]) ORDER BY name', [z]);
  return r.rows.map((x: any) => x.name);
};
const titelVon = async (ids: unknown): Promise<{ titel: string[]; eventId: number | null }> => {
  const z = Array.isArray(ids) ? ids.map(zahl).filter(Number.isInteger) : [];
  if (z.length === 0) return { titel: [], eventId: null };
  const r = await query('SELECT title, event_id FROM tasks WHERE id = ANY($1::int[]) ORDER BY day_number, sort_order, id', [z]);
  return { titel: r.rows.map((x: any) => x.title), eventId: r.rows[0]?.event_id ?? null };
};
const eingeteilt = async (taskId: number, instanzId: number): Promise<string[]> => {
  const r = await query(
    `SELECT u.name FROM task_assignments ta JOIN users u ON u.id = ta.user_id
     WHERE ta.task_id = $1 AND ta.event_instance_id = $2 ORDER BY u.name`,
    [taskId, instanzId]
  );
  return r.rows.map((x: any) => x.name);
};
const eventVonInstanz = async (id: number): Promise<number | null> =>
  (await query('SELECT event_id FROM event_instances WHERE id = $1', [id])).rows[0]?.event_id ?? null;

/** "Startzeit 12:15 → 12:30, Status Offen → Erledigt" - nur was sich geaendert hat. */
const unterschiedeAufgabe = (a: any, b: any): string[] => {
  const d: string[] = [];
  if (a.title !== b.title) d.push(`Titel „${a.title}“ → „${b.title}“`);
  if (a.day_number !== b.day_number) d.push(`Tag ${a.day_number} → ${b.day_number}`);
  if (uhr(a.start_time) !== uhr(b.start_time)) d.push(`Startzeit ${uhr(a.start_time)} → ${uhr(b.start_time)}`);
  if (uhr(a.end_time) !== uhr(b.end_time)) d.push(`Endzeit ${uhr(a.end_time)} → ${uhr(b.end_time)}`);
  if (uhr(a.scheduled_time) !== uhr(b.scheduled_time)) d.push(`geplante Zeit ${uhr(a.scheduled_time)} → ${uhr(b.scheduled_time)}`);
  if (a.status !== b.status) d.push(`Status ${status(a.status)} → ${status(b.status)}`);
  if ((a.gruppe || null) !== (b.gruppe || null)) d.push(`Gruppe ${a.gruppe ? `„${a.gruppe}“` : '–'} → ${b.gruppe ? `„${b.gruppe}“` : '–'}`);
  if (!!a.is_public !== !!b.is_public) d.push(b.is_public ? 'jetzt öffentlich' : 'nicht mehr öffentlich');
  if ((a.needed_staff ?? null) !== (b.needed_staff ?? null)) d.push(`Bedarf ${a.needed_staff ?? '–'} → ${b.needed_staff ?? '–'}`);
  if ((a.needed_female ?? null) !== (b.needed_female ?? null) || (a.needed_male ?? null) !== (b.needed_male ?? null)) d.push('Aufteilung w/m geändert');
  if ((a.description || '') !== (b.description || '')) d.push('Beschreibung geändert');
  if (!!a.auto_complete !== !!b.auto_complete) d.push(b.auto_complete ? 'erledigt sich jetzt von selbst' : 'erledigt sich nicht mehr von selbst');
  if ((a.reminder_minutes ?? null) !== (b.reminder_minutes ?? null)) d.push(`Erinnerung ${a.reminder_minutes ?? '–'} → ${b.reminder_minutes ?? '–'} Min vorher`);
  if ((a.series_id ?? null) !== (b.series_id ?? null)) d.push('Serie geändert');
  return d;
};

/** Wo eine Aufgabe steht - fuer die Saetze zur Reihenfolge. */
const ortVon = (t: any) => (t.gruppe ? `in „${t.gruppe}“, Tag ${t.day_number}` : `Tag ${t.day_number}`);

// ---- Regeln ---------------------------------------------------------------

const REGELN: Regel[] = [
  // Reihenfolge (Pfeile). Die Richtung steht bewusst nicht im Satz: hoch
  // und runter im Wechsel werden zu einem Eintrag zusammengefasst.
  {
    methode: 'PUT', pfad: /^\/tasks\/(\d+)\/move-(up|down)$/,
    nachher: async (k, _v, a) => {
      if (a?.bewegt === false) return null;
      const t = await aufgabe(zahl(k.treffer[1]));
      return t ? {
        eventId: t.event_id, art: 'reihenfolge', taskId: t.id, zusammenfassen: true,
        text: `Reihenfolge geändert: „${t.title}“ (${ortVon(t)})`,
      } : null;
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/event\/(\d+)\/bulk-reorder$/,
    vorher: (k) => titelVon(k.body.task_ids),
    nachher: async (k, v, a) => (a?.bewegt && v?.titel.length) ? {
      eventId: zahl(k.treffer[1]), art: 'reihenfolge', zusammenfassen: true,
      text: `Reihenfolge geändert: ${aufgaben(v.titel.length)} gemeinsam verschoben – ${liste(v.titel)}`,
    } : null,
  },
  {
    methode: 'PUT', pfad: /^\/program\/(\d+)\/move-(up|down)$/,
    nachher: async (k, _v, a) => {
      if (a?.bewegt === false) return null;
      const g = await gruppe(zahl(k.treffer[1]));
      return g ? {
        eventId: g.event_id, art: 'reihenfolge', zusammenfassen: true,
        text: `Reihenfolge geändert: Gruppe „${g.title}“ (Tag ${g.day_number})`,
      } : null;
    },
  },

  // Aufgaben
  {
    methode: 'POST', pfad: /^\/tasks$/,
    nachher: async (_k, _v, a) => a?.id ? {
      eventId: a.event_id, art: 'aufgabe_neu', taskId: a.id,
      text: `Aufgabe „${a.title}“ angelegt (Tag ${a.day_number}${a.start_time ? `, ${uhr(a.start_time)}–${uhr(a.end_time)}` : a.scheduled_time ? `, ${uhr(a.scheduled_time)}` : ''})`,
    } : null,
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/(\d+)$/,
    vorher: (k) => aufgabe(zahl(k.treffer[1])),
    nachher: async (k, v) => {
      const n = await aufgabe(zahl(k.treffer[1]));
      if (!v || !n) return null;
      const d = unterschiedeAufgabe(v, n);
      return d.length ? { eventId: n.event_id, art: 'aufgabe_geaendert', taskId: n.id, text: `„${n.title}“: ${d.join(', ')}` } : null;
    },
  },
  {
    methode: 'PATCH', pfad: /^\/tasks\/(\d+)\/note$/,
    nachher: async (k) => {
      const n = await aufgabe(zahl(k.treffer[1]));
      return n ? { eventId: n.event_id, art: 'notiz', taskId: n.id, text: `Notiz an „${n.title}“ ${n.note ? 'geändert' : 'entfernt'}` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/(\d+)\/(deactivate|activate)$/,
    nachher: async (k) => {
      const n = await aufgabe(zahl(k.treffer[1]));
      return n ? { eventId: n.event_id, art: 'aufgabe_geaendert', taskId: n.id, text: `„${n.title}“ ${k.treffer[2] === 'deactivate' ? 'deaktiviert' : 'wieder aktiviert'}` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/(\d+)\/status$/,
    nachher: async (k) => {
      const n = await aufgabe(zahl(k.treffer[1]));
      return n ? { eventId: n.event_id, art: 'status', taskId: n.id, text: `„${n.title}“: Status ${status(n.status)}` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/complete\/(\d+)$/,
    nachher: async (k) => {
      const r = await query('SELECT t.id, t.title, t.event_id FROM task_assignments ta JOIN tasks t ON t.id = ta.task_id WHERE ta.id = $1', [zahl(k.treffer[1])]);
      const t = r.rows[0];
      return t ? { eventId: t.event_id, art: 'status', taskId: t.id, text: `„${t.title}“ als erledigt gemeldet` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/(\d+)\/complete-public$/,
    nachher: async (k) => {
      const n = await aufgabe(zahl(k.treffer[1]));
      return n ? { eventId: n.event_id, art: 'status', taskId: n.id, text: `„${n.title}“ als erledigt gemeldet` } : null;
    },
  },
  {
    methode: 'DELETE', pfad: /^\/tasks\/assignment\/(\d+)$/,
    vorher: async (k) => (await query(
      `SELECT u.name, t.id, t.title, t.event_id FROM task_assignments ta
       JOIN users u ON u.id = ta.user_id JOIN tasks t ON t.id = ta.task_id WHERE ta.id = $1`,
      [zahl(k.treffer[1])]
    )).rows[0],
    nachher: async (_k, v) => v ? { eventId: v.event_id, art: 'einteilung', taskId: v.id, text: `${v.name} aus „${v.title}“ ausgetragen` } : null,
  },
  {
    methode: 'DELETE', pfad: /^\/tasks\/(\d+)$/,
    vorher: (k) => aufgabe(zahl(k.treffer[1])),
    nachher: async (_k, v) => v ? { eventId: v.event_id, art: 'aufgabe_geloescht', text: `Aufgabe „${v.title}“ gelöscht (Tag ${v.day_number})` } : null,
  },
  {
    methode: 'POST', pfad: /^\/tasks\/assign$/,
    vorher: (k) => eingeteilt(zahl(k.body.task_id), zahl(k.body.event_instance_id)),
    nachher: async (k, v: string[]) => {
      const t = await aufgabe(zahl(k.body.task_id));
      if (!t) return null;
      const n = await eingeteilt(t.id, zahl(k.body.event_instance_id));
      const dazu = n.filter((x) => !v.includes(x));
      const weg = v.filter((x) => !n.includes(x));
      if (!dazu.length && !weg.length) return null;
      const teile = [dazu.length ? `+ ${liste(dazu)}` : '', weg.length ? `− ${liste(weg)}` : ''].filter(Boolean);
      return { eventId: t.event_id, art: 'einteilung', taskId: t.id, text: `Einteilung „${t.title}“: ${teile.join('; ')}` };
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/event\/(\d+)\/bulk-delete$/,
    vorher: (k) => titelVon(k.body.task_ids),
    nachher: async (k, v) => v?.titel.length ? { eventId: zahl(k.treffer[1]), art: 'aufgabe_geloescht', text: `${aufgaben(v.titel.length)} gelöscht: ${liste(v.titel)}` } : null,
  },
  {
    methode: 'POST', pfad: /^\/tasks\/event\/(\d+)\/bulk-(move|copy)$/,
    vorher: (k) => titelVon(k.body.task_ids),
    nachher: async (k, v) => {
      if (!v?.titel.length) return null;
      const ziel: string[] = [];
      if (k.body.day_number) ziel.push(`auf Tag ${k.body.day_number}`);
      if (Object.prototype.hasOwnProperty.call(k.body, 'program_item_id')) {
        const g = k.body.program_item_id ? await gruppe(zahl(k.body.program_item_id)) : null;
        ziel.push(g ? `in „${g.title}“` : 'ohne Gruppe');
      }
      const kopiert = k.treffer[2] === 'copy';
      return {
        eventId: zahl(k.treffer[1]),
        art: kopiert ? 'aufgabe_kopiert' : 'aufgabe_verschoben',
        text: `${aufgaben(v.titel.length)} ${kopiert ? 'kopiert' : 'verschoben'}${ziel.length ? ` ${ziel.join(', ')}` : ''}: ${liste(v.titel)}`,
      };
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/instance\/(\d+)\/bulk-assign$/,
    nachher: async (k) => {
      const eventId = await eventVonInstanz(zahl(k.treffer[1]));
      const namen = await namenVon(k.body.user_ids);
      const { titel } = await titelVon(k.body.task_ids);
      return eventId && namen.length && titel.length
        ? { eventId, art: 'einteilung', text: `${liste(namen)} eingeteilt in ${aufgaben(titel.length)}: ${liste(titel)}` } : null;
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/bulk-remove-assignments$/,
    vorher: async (k) => {
      const ids = Array.isArray(k.body.assignment_ids) ? k.body.assignment_ids.map(zahl) : [];
      return (await query(
        `SELECT u.name, t.title, t.event_id FROM task_assignments ta
         JOIN users u ON u.id = ta.user_id JOIN tasks t ON t.id = ta.task_id WHERE ta.id = ANY($1::int[])`,
        [ids]
      )).rows;
    },
    nachher: async (_k, v: any[]) => {
      if (!v?.length) return null;
      const name = v[0].name;
      return { eventId: v[0].event_id, art: 'einteilung', text: `${name} aus ${aufgaben(v.length)} ausgetragen: ${liste(v.map((x) => x.title))}` };
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/replace-staff\/(\d+)$/,
    nachher: async (k) => {
      const [alt] = await namenVon([k.body.old_user_id]);
      const [neu] = await namenVon([k.body.new_user_id]);
      return alt && neu ? { eventId: zahl(k.treffer[1]), art: 'einteilung', text: `${alt} durch ${neu} ersetzt` } : null;
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/event\/(\d+)\/import-csv$/,
    nachher: async (k, _v, a) => ({ eventId: zahl(k.treffer[1]), art: 'aufgabe_neu', text: `Aufgaben aus CSV importiert${a?.message ? ` (${a.message})` : ''}` }),
  },

  // Serien
  {
    methode: 'POST', pfad: /^\/tasks\/task-series$/,
    nachher: async (k, _v, a) => a?.id ? { eventId: zahl(k.body.event_id), art: 'serie', text: `Serie „${a.name}“ angelegt` } : null,
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/task-series\/(\d+)$/,
    nachher: async (k) => {
      const s = await serie(zahl(k.treffer[1]));
      return s ? { eventId: s.event_id, art: 'serie', text: `Serie „${s.name}“ geändert` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/tasks\/task-series\/(\d+)\/inhalt$/,
    nachher: async (k) => {
      const s = await serie(zahl(k.treffer[1]));
      return s ? { eventId: s.event_id, art: 'serie', text: `Inhalt der Serie „${s.name}“ geändert` } : null;
    },
  },
  {
    methode: 'DELETE', pfad: /^\/tasks\/task-series\/(\d+)$/,
    vorher: (k) => serie(zahl(k.treffer[1])),
    nachher: async (k, v) => {
      if (!v) return null;
      const mode = String(k.req.query.mode || 'keep');
      const wie = mode === 'delete_tasks' ? ', samt Aufgaben' : mode === 'unassign' ? ', Zuweisungen aufgehoben' : '';
      return { eventId: v.event_id, art: 'serie', text: `Serie „${v.name}“ aufgelöst${wie}` };
    },
  },
  {
    methode: 'POST', pfad: /^\/tasks\/task-series\/(\d+)\/members$/,
    nachher: async (k) => {
      const s = await serie(zahl(k.treffer[1]));
      const namen = await namenVon(k.body.user_ids);
      return s && namen.length ? { eventId: s.event_id, art: 'serie', text: `Serie „${s.name}“: + ${liste(namen)}` } : null;
    },
  },
  {
    methode: 'DELETE', pfad: /^\/tasks\/task-series\/(\d+)\/members\/(\d+)$/,
    nachher: async (k) => {
      const s = await serie(zahl(k.treffer[1]));
      const [name] = await namenVon([k.treffer[2]]);
      return s && name ? { eventId: s.event_id, art: 'serie', text: `Serie „${s.name}“: − ${name}` } : null;
    },
  },

  // Aufgabengruppen
  {
    methode: 'POST', pfad: /^\/program$/,
    nachher: async (_k, _v, a) => a?.id ? {
      eventId: a.event_id, art: 'gruppe',
      text: `Gruppe „${a.title}“ angelegt (Tag ${a.day_number}${a.time ? `, ${uhr(a.time)}` : ''})`,
    } : null,
  },
  {
    methode: 'PUT', pfad: /^\/program\/(\d+)$/,
    vorher: (k) => gruppe(zahl(k.treffer[1])),
    nachher: async (k, v) => {
      const n = await gruppe(zahl(k.treffer[1]));
      if (!v || !n) return null;
      const d: string[] = [];
      if (v.title !== n.title) d.push(`Name „${v.title}“ → „${n.title}“`);
      if (uhr(v.time) !== uhr(n.time)) d.push(`Uhrzeit ${uhr(v.time)} → ${uhr(n.time)}`);
      if (v.day_number !== n.day_number) d.push(`Tag ${v.day_number} → ${n.day_number}`);
      if ((v.color || null) !== (n.color || null)) d.push('Farbe geändert');
      if ((v.series_id ?? null) !== (n.series_id ?? null)) d.push('Serie geändert');
      return d.length ? { eventId: n.event_id, art: 'gruppe', text: `Gruppe „${n.title}“: ${d.join(', ')}` } : null;
    },
  },
  {
    methode: 'PUT', pfad: /^\/program\/(\d+)\/tasks$/,
    nachher: async (k) => {
      const g = await gruppe(zahl(k.treffer[1]));
      return g ? { eventId: g.event_id, art: 'gruppe', text: `Aufgaben der Gruppe „${g.title}“ neu zugeordnet` } : null;
    },
  },
  {
    methode: 'PATCH', pfad: /^\/program\/(\d+)\/note$/,
    nachher: async (k) => {
      const g = await gruppe(zahl(k.treffer[1]));
      return g ? { eventId: g.event_id, art: 'notiz', text: `Notiz an Gruppe „${g.title}“ ${g.note ? 'geändert' : 'entfernt'}` } : null;
    },
  },
  {
    methode: 'POST', pfad: /^\/program\/(\d+)\/duplicate$/,
    nachher: async (k) => {
      const g = await gruppe(zahl(k.treffer[1]));
      return g ? { eventId: g.event_id, art: 'gruppe', text: `Gruppe „${g.title}“ auf Tag ${k.body.day_number} dupliziert` } : null;
    },
  },
  {
    methode: 'DELETE', pfad: /^\/program\/(\d+)$/,
    vorher: (k) => gruppe(zahl(k.treffer[1])),
    nachher: async (_k, v) => v ? { eventId: v.event_id, art: 'gruppe', text: `Gruppe „${v.title}“ gelöscht (Tag ${v.day_number})` } : null,
  },

  // Veranstaltung
  {
    methode: 'POST', pfad: /^\/events$/,
    nachher: async (_k, _v, a) => a?.id ? { eventId: a.id, art: 'veranstaltung', text: 'Veranstaltung angelegt' } : null,
  },
  {
    methode: 'POST', pfad: /^\/events\/(\d+)\/(duplicate|create-from-template)$/,
    vorher: async (k) => (await query('SELECT name FROM events WHERE id = $1', [zahl(k.treffer[1])])).rows[0],
    nachher: async (k, v, a) => a?.id ? {
      eventId: a.id, art: 'veranstaltung',
      text: k.treffer[2] === 'duplicate' ? `Als Kopie von „${v?.name}“ angelegt` : `Aus der Vorlage „${v?.name}“ angelegt`,
    } : null,
  },
  {
    methode: 'PUT', pfad: /^\/events\/(\d+)$/,
    vorher: async (k) => {
      const id = zahl(k.treffer[1]);
      const e = (await query('SELECT * FROM events WHERE id = $1', [id])).rows[0];
      const co = (await query(
        `SELECT u.name FROM event_teamleiter et JOIN users u ON u.id = et.user_id
         WHERE et.event_id = $1 AND et.is_primary = false ORDER BY u.name`, [id])).rows.map((x: any) => x.name);
      return e ? { ...e, co } : null;
    },
    nachher: async (k, v) => {
      const id = zahl(k.treffer[1]);
      const n = (await query('SELECT * FROM events WHERE id = $1', [id])).rows[0];
      if (!v || !n) return null;
      const co = (await query(
        `SELECT u.name FROM event_teamleiter et JOIN users u ON u.id = et.user_id
         WHERE et.event_id = $1 AND et.is_primary = false ORDER BY u.name`, [id])).rows.map((x: any) => x.name);
      const d: string[] = [];
      if (v.name !== n.name) d.push(`Name „${v.name}“ → „${n.name}“`);
      if (String(v.start_date) !== String(n.start_date)) d.push(`Start ${v.start_date ?? '–'} → ${n.start_date ?? '–'}`);
      if (v.days !== n.days) d.push(`Tage ${v.days} → ${n.days}`);
      if ((v.description || '') !== (n.description || '')) d.push('Beschreibung geändert');
      const coDazu = co.filter((x: string) => !v.co.includes(x));
      const coWeg = v.co.filter((x: string) => !co.includes(x));
      if (coDazu.length) d.push(`Co-Leitung + ${liste(coDazu)}`);
      if (coWeg.length) d.push(`Co-Leitung − ${liste(coWeg)}`);
      return d.length ? { eventId: id, art: 'veranstaltung', text: `Veranstaltung geändert: ${d.join(', ')}` } : null;
    },
  },
  {
    methode: 'PATCH', pfad: /^\/events\/(\d+)\/note$/,
    nachher: async (k) => {
      const e = (await query('SELECT note FROM events WHERE id = $1', [zahl(k.treffer[1])])).rows[0];
      return e ? { eventId: zahl(k.treffer[1]), art: 'notiz', text: `Notiz zur Veranstaltung ${e.note ? 'geändert' : 'entfernt'}` } : null;
    },
  },

  // Mitarbeiter-Pool
  {
    methode: 'POST', pfad: /^\/users\/event\/(\d+)\/staff$/,
    nachher: async (k) => {
      const namen = await namenVon(k.body.user_ids);
      return namen.length ? { eventId: zahl(k.treffer[1]), art: 'pool', text: `Pool: + ${liste(namen)}` } : null;
    },
  },
  {
    methode: 'DELETE', pfad: /^\/users\/event\/(\d+)\/staff\/(\d+)$/,
    vorher: async (k) => (await namenVon([k.treffer[2]]))[0],
    nachher: async (k, name) => {
      if (!name) return null;
      const an = k.req.query.reassign_to ? (await namenVon([k.req.query.reassign_to]))[0] : null;
      return { eventId: zahl(k.treffer[1]), art: 'pool', text: `Pool: − ${name}${an ? ` (Aufgaben an ${an} übertragen)` : ''}` };
    },
  },
];

const schreibe = async (eintraege: Eintrag[], user: { id: number; name: string }) => {
  for (const e of eintraege) {
    if (!e || !Number.isInteger(e.eventId)) continue;
    if (e.zusammenfassen) {
      const r = await query(
        `UPDATE aenderungen SET zeit = NOW()
         WHERE id = (SELECT id FROM aenderungen
                     WHERE event_id = $1 AND user_id = $2 AND art = $3 AND text = $4
                       AND zeit > NOW() - INTERVAL '10 minutes'
                       -- nur der juengste Eintrag der Veranstaltung: der
                       -- Verlauf sortiert nach Nummer, ein aelterer stuende
                       -- sonst mit neuer Uhrzeit zwischen spaeteren.
                       AND id = (SELECT MAX(id) FROM aenderungen WHERE event_id = $1))`,
        [e.eventId, user.id, e.art, e.text.slice(0, 2000)]
      );
      if ((r.rowCount ?? 0) > 0) continue;
    }
    await query(
      `INSERT INTO aenderungen (event_id, user_id, user_name, art, text, task_id)
       SELECT $1, $2, $3, $4, $5, $6 WHERE EXISTS (SELECT 1 FROM events WHERE id = $1)`,
      [e.eventId, user.id, user.name, e.art, e.text.slice(0, 2000), e.taskId ?? null]
    );
  }
};

/** Vor die API-Routen haengen: app.use('/api', protokollMiddleware). */
export const protokollMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return next();
  const regel = REGELN.find((r) => r.methode === req.method && r.pfad.test(req.path));
  if (!regel) return next();

  // Wer ist es? Die Routen pruefen das selbst noch einmal; hier geht es
  // nur darum, ob ueberhaupt protokolliert wird.
  let user: { id: number; name: string; role: string } | null = null;
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (token) user = jwt.verify(token, config.jwt.secret) as any;
  } catch { /* ungueltig - die Route lehnt ab */ }
  if (!user || (user.role !== 'admin' && user.role !== 'teamleiter')) return next();

  const k: Kontext = { req, treffer: req.path.match(regel.pfad)!, body: req.body || {} };
  let vorher: any;
  try {
    vorher = regel.vorher ? await regel.vorher(k) : undefined;
  } catch (e) {
    console.error('[Protokoll] vorher:', e);
  }

  let antwort: any;
  const json = res.json.bind(res);
  res.json = (daten: any) => { antwort = daten; return json(daten); };

  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    // body erst jetzt lesen: bei Datei-Uploads fuellt multer ihn in der Route.
    k.body = req.body || {};
    regel.nachher(k, vorher, antwort)
      .then((e) => (e ? schreibe(Array.isArray(e) ? e : [e], user!) : undefined))
      .catch((e) => console.error('[Protokoll] nachher:', e));
  });

  next();
};
