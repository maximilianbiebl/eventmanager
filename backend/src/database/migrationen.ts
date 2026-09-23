import * as fs from 'fs';
import * as path from 'path';
import { PoolClient } from 'pg';
import pool from './connection';

/*
 * Migrationen ausfuehren und mitschreiben, was schon gelaufen ist.
 *
 * ANLASS
 *   Bis hierher war jede Migration ein eigenes Skript, das von Hand
 *   aufgerufen werden musste. Wird eines vergessen, faellt das erst im
 *   Betrieb auf - bei 024 fehlte task_assignments.reminder_at, und damit
 *   scheiterte JEDER Abruf der eigenen Aufgaben. Fuer die Mitarbeiter sah
 *   es aus, als gaebe es keine Aufgaben mehr.
 *
 *   Eine vergessene Migration darf die Anwendung nicht lahmlegen. Also
 *   fuehrt der Server sie selbst aus, beim Start, bevor er Anfragen
 *   annimmt - und schreibt in schema_migrations mit, was gelaufen ist.
 *
 * WARUM NICHT BEIM "docker compose build"
 *   Beim Bauen gibt es keine Datenbank: gebaut wird ein Abbild, die
 *   Datenbank laeuft in einem anderen Container, oft auf einem anderen
 *   Rechner und mit anderen Daten. Ein Abbild, das an eine bestimmte
 *   Datenbank gebunden ist, waere auch kein Abbild mehr.
 *
 *   Und beim "docker compose up -d" gibt es niemanden, der ein j/n
 *   beantworten koennte - "-d" heisst gerade, dass kein Terminal
 *   danebensteht. Deshalb zwei Wege:
 *
 *     beim Start des Servers   automatisch, ohne Rueckfrage
 *     ./migrieren.sh           von Hand, MIT Rueckfrage und Liste
 *
 *   Wer die Automatik nicht will, setzt MIGRATIONEN_AUTOMATISCH=nein.
 *   Dann meldet der Start nur, was offen ist, und aendert nichts.
 *
 * WIEDERHOLBAR
 *   Jede Migrationsdatei sagt in ihrem Kopf, ob man sie gefahrlos erneut
 *   ausfuehren kann:
 *
 *     -- Wiederholbar: ja     nur "IF NOT EXISTS"-Sachen, kein Datenumbau
 *     -- Wiederholbar: nein   schreibt Daten um, darf genau einmal laufen
 *
 *   Das zaehlt bei der Bestandsaufnahme (siehe unten). Fehlt die Angabe,
 *   gilt "nein" - die vorsichtige Annahme.
 */

export interface Migration {
  /** Die Nummer vorne im Dateinamen, z. B. "024". */
  version: string;
  datei: string;
  pfad: string;
  /** Darf gefahrlos noch einmal laufen. */
  wiederholbar: boolean;
  /** Erste Zeile des Kommentarkopfs - fuer die Liste im Dialog. */
  titel: string;
}

const VERZEICHNIS = path.join(__dirname, 'migrations');

/*
 * Sitzungssperre: laufen zwei Server gleichzeitig an (Neustart mit
 * Ueberlappung, zweite Instanz), wartet der zweite, statt dieselbe
 * Migration ein zweites Mal zu starten.
 */
const SPERRSCHLUESSEL = 918_024;

const MARKE_WIEDERHOLBAR = /^--\s*Wiederholbar:\s*(ja|nein)\b/im;
const MARKE_TITEL = /^--\s*Migration\s*\d*\s*:\s*(.+)$/im;

export const leseMigrationen = (): Migration[] => {
  if (!fs.existsSync(VERZEICHNIS)) return [];

  return fs
    .readdirSync(VERZEICHNIS)
    .filter((d) => d.endsWith('.sql'))
    // Sortiert nach Dateiname - die Nummer vorne gibt die Reihenfolge vor.
    .sort()
    .map((datei) => {
      const pfad = path.join(VERZEICHNIS, datei);
      const kopf = fs.readFileSync(pfad, 'utf-8').slice(0, 4000);
      return {
        version: datei.split('_')[0],
        datei,
        pfad,
        wiederholbar: MARKE_WIEDERHOLBAR.exec(kopf)?.[1].toLowerCase() === 'ja',
        titel: MARKE_TITEL.exec(kopf)?.[1].trim() || datei.replace(/\.sql$/, ''),
      };
    });
};

const sorgeFuerBuch = async (c: PoolClient): Promise<void> => {
  await c.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version        TEXT PRIMARY KEY,
      datei          TEXT NOT NULL,
      ausgefuehrt_am TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      dauer_ms       INTEGER,
      herkunft       TEXT NOT NULL DEFAULT 'lauf'
    )`);
};

/** Steht das Grundschema (schema.sql) schon? Sonst ergibt keine Migration Sinn. */
const grundschemaVorhanden = async (c: PoolClient): Promise<boolean> => {
  const r = await c.query(`SELECT to_regclass('public.users') IS NOT NULL AS da`);
  return r.rows[0]?.da === true;
};

/*
 * Lief hier schon einmal etwas, oder ist die Datenbank frisch angelegt?
 *
 * Das entscheidet ueber die Bestandsaufnahme, und die Unterscheidung ist
 * wichtiger, als sie aussieht: bei einer frischen Datenbank sind die
 * Migrationen NICHT gelaufen, nur schema.sql. Wuerde hier Bestand
 * aufgenommen, bliebe 007 fuer immer aus - und tasks.sort_order fehlte,
 * denn im Grundschema steht die Spalte nicht.
 *
 * Nach schema.sql stehen die Tabellen leer da; das Konto der Leitung wird
 * erst danach angelegt. Ein Datenbestand ist also der Beleg dafuer, dass
 * hier laengst gearbeitet wird. Umgekehrt ist es unbedenklich: wo weder
 * Konten noch Veranstaltungen sind, gibt es auch nichts, was eine erneut
 * ausgefuehrte Migration umschreiben koennte.
 */
const istBestandsdatenbank = async (c: PoolClient): Promise<boolean> => {
  const r = await c.query(`
    SELECT EXISTS (SELECT 1 FROM users) OR EXISTS (SELECT 1 FROM events) AS benutzt`);
  return r.rows[0]?.benutzt === true;
};

const bereitsEingetragen = async (c: PoolClient): Promise<Set<string>> => {
  const r = await c.query('SELECT version FROM schema_migrations');
  return new Set(r.rows.map((z: any) => String(z.version)));
};

/*
 * Bestandsaufnahme - genau einmal, beim ersten Lauf mit dem Buch.
 *
 * Die Datenbank laeuft laengst, die Migrationen sind irgendwann von Hand
 * ausgefuehrt worden, nur weiss davon niemand etwas. Alles blind erneut
 * auszufuehren waere falsch (007 wuerde die Sortierung aller Aufgaben
 * neu vergeben), alles blind als erledigt einzutragen aber auch: dann
 * bliebe eine tatsaechlich fehlende Migration fuer immer unentdeckt -
 * genau der Fall, der uns hierher gebracht hat.
 *
 * Deshalb die Unterscheidung aus dem Dateikopf: was wiederholbar ist,
 * laeuft jetzt einfach (und ergaenzt dabei, was fehlt); alles andere wird
 * als erledigt vermerkt, ohne es auszufuehren.
 */
const nimmBestandAuf = async (c: PoolClient, alle: Migration[]): Promise<Migration[]> => {
  const nurVermerken = alle.filter((m) => !m.wiederholbar);

  for (const m of nurVermerken) {
    await c.query(
      `INSERT INTO schema_migrations (version, datei, herkunft)
       VALUES ($1, $2, 'bestandsaufnahme')
       ON CONFLICT (version) DO NOTHING`,
      [m.version, m.datei]
    );
  }

  console.log(
    `[Migrationen] Bestandsaufnahme: ${nurVermerken.length} bereits vorhandene ` +
    'Migrationen vermerkt (nicht ausgefuehrt).'
  );

  return alle.filter((m) => m.wiederholbar);
};

export interface Lage {
  offen: Migration[];
  grundschemaFehlt: boolean;
}

/** Was ist noch offen? Erwartet eine Verbindung, die die Sperre haelt. */
export const ermittleLage = async (c: PoolClient): Promise<Lage> => {
  if (!(await grundschemaVorhanden(c))) {
    return { offen: [], grundschemaFehlt: true };
  }

  await sorgeFuerBuch(c);
  const alle = leseMigrationen();
  const eingetragen = await bereitsEingetragen(c);

  if (eingetragen.size === 0 && (await istBestandsdatenbank(c))) {
    return { offen: await nimmBestandAuf(c, alle), grundschemaFehlt: false };
  }

  return { offen: alle.filter((m) => !eingetragen.has(m.version)), grundschemaFehlt: false };
};

/**
 * Fuehrt die uebergebenen Migrationen der Reihe nach aus - jede fuer sich
 * in einer Transaktion. Bricht eine ab, bleibt sie unvollstaendig
 * zurueckgerollt und nicht eingetragen; die davor bleiben bestehen.
 */
export const fuehreAus = async (c: PoolClient, liste: Migration[]): Promise<void> => {
  for (const m of liste) {
    const sql = fs.readFileSync(m.pfad, 'utf-8');
    const start = Date.now();

    try {
      await c.query('BEGIN');
      await c.query(sql);
      await c.query(
        `INSERT INTO schema_migrations (version, datei, dauer_ms, herkunft)
         VALUES ($1, $2, $3, 'lauf')
         ON CONFLICT (version) DO UPDATE SET
           ausgefuehrt_am = CURRENT_TIMESTAMP,
           dauer_ms = EXCLUDED.dauer_ms`,
        [m.version, m.datei, Date.now() - start]
      );
      await c.query('COMMIT');
      console.log(`[Migrationen] ${m.version} ausgefuehrt (${Date.now() - start} ms) - ${m.titel}`);
    } catch (fehler: any) {
      await c.query('ROLLBACK').catch(() => undefined);
      throw new Error(`Migration ${m.datei} fehlgeschlagen: ${fehler?.message || fehler}`);
    }
  }
};

const automatikAus = (): boolean => {
  const wert = (process.env.MIGRATIONEN_AUTOMATISCH || '').trim().toLowerCase();
  return ['nein', 'no', 'false', '0', 'off', 'aus'].includes(wert);
};

/**
 * Wird beim Start aufgerufen, bevor der Wecker loslaeuft.
 *
 * Schlaegt etwas fehl, wird das deutlich gemeldet, der Start aber nicht
 * abgebrochen: ein laufender Server mit einer fehlenden Spalte ist immer
 * noch besser als gar keiner - und die Meldung sagt, was zu tun ist.
 */
export const migriereBeimStart = async (): Promise<void> => {
  let c: PoolClient;
  try {
    c = await pool.connect();
  } catch (fehler: any) {
    console.error(`[Migrationen] Keine Verbindung zur Datenbank: ${fehler?.message || fehler}`);
    return;
  }

  try {
    await c.query('SELECT pg_advisory_lock($1)', [SPERRSCHLUESSEL]);
    const { offen, grundschemaFehlt } = await ermittleLage(c);

    if (grundschemaFehlt) {
      console.error(
        '[Migrationen] Das Grundschema fehlt (Tabelle "users" gibt es nicht).\n' +
        '              Einmalig anlegen mit:  npm run migrate'
      );
      return;
    }

    if (offen.length === 0) {
      console.log('[Migrationen] Alles auf Stand.');
      return;
    }

    if (automatikAus()) {
      console.warn(
        `[Migrationen] ${offen.length} offen, Automatik ist abgeschaltet: ` +
        `${offen.map((m) => m.version).join(', ')}\n` +
        '              Ausfuehren mit:  ./migrieren.sh'
      );
      return;
    }

    console.log(`[Migrationen] ${offen.length} offen, wird jetzt ausgefuehrt ...`);
    await fuehreAus(c, offen);
    console.log('[Migrationen] Fertig.');
  } catch (fehler: any) {
    console.error(
      `[Migrationen] ${fehler?.message || fehler}\n` +
      '              Der Server laeuft weiter, die Datenbank ist aber nicht auf Stand.\n' +
      '              Bitte von Hand nachsehen:  ./migrieren.sh'
    );
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [SPERRSCHLUESSEL]).catch(() => undefined);
    c.release();
  }
};
