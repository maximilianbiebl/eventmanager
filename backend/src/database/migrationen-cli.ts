import * as readline from 'readline';
import pool from './connection';
import { ermittleLage, fuehreAus } from './migrationen';

/*
 * Migrationen von Hand ausfuehren - mit Liste und Rueckfrage.
 *
 * Der Server macht das beim Start von selbst (siehe migrationen.ts). Beim
 * "docker compose up -d" steht aber kein Terminal daneben, das ein j/n
 * beantworten koennte. Wer vorher sehen will, was passiert, ruft dieses
 * Skript auf - ueber ./migrieren.sh im Projektverzeichnis.
 *
 *   ./migrieren.sh             zeigen, fragen, ausfuehren
 *   ./migrieren.sh --liste     nur zeigen, nichts aendern
 *   ./migrieren.sh --ja        ohne Rueckfrage (fuer Skripte)
 */

const SPERRSCHLUESSEL = 918_024;

const frage = (text: string): Promise<string> =>
  new Promise((antwort) => {
    const leser = readline.createInterface({ input: process.stdin, output: process.stdout });
    leser.question(text, (eingabe) => {
      leser.close();
      antwort(eingabe.trim().toLowerCase());
    });
  });

const lauf = async (): Promise<number> => {
  const argumente = process.argv.slice(2);
  const nurZeigen = argumente.includes('--liste');
  const ohneRueckfrage = argumente.includes('--ja') || argumente.includes('-j');

  const c = await pool.connect();
  try {
    await c.query('SELECT pg_advisory_lock($1)', [SPERRSCHLUESSEL]);
    const { offen, grundschemaFehlt } = await ermittleLage(c);

    if (grundschemaFehlt) {
      console.error('Das Grundschema fehlt (Tabelle "users" gibt es nicht).');
      console.error('Einmalig anlegen mit:  docker-compose exec backend npm run migrate');
      return 1;
    }

    if (offen.length === 0) {
      console.log('Die Datenbank ist auf Stand - nichts auszufuehren.');
      return 0;
    }

    console.log(`\nOffen (${offen.length}):\n`);
    for (const m of offen) {
      const hinweis = m.wiederholbar ? '' : '   (schreibt Daten um)';
      console.log(`  ${m.version}  ${m.titel}${hinweis}`);
    }
    console.log('');

    if (nurZeigen) return 0;

    if (!ohneRueckfrage) {
      if (!process.stdin.isTTY) {
        console.error('Kein Terminal fuer die Rueckfrage. Mit --ja ohne Rueckfrage ausfuehren.');
        return 1;
      }
      const antwort = await frage('Jetzt ausfuehren? [j/N] ');
      if (antwort !== 'j' && antwort !== 'ja' && antwort !== 'y') {
        console.log('Abgebrochen - es wurde nichts geaendert.');
        return 0;
      }
    }

    await fuehreAus(c, offen);
    console.log('\nFertig.');
    return 0;
  } catch (fehler: any) {
    console.error(`\n${fehler?.message || fehler}`);
    return 1;
  } finally {
    await c.query('SELECT pg_advisory_unlock($1)', [SPERRSCHLUESSEL]).catch(() => undefined);
    c.release();
    await pool.end();
  }
};

lauf().then((code) => process.exit(code));
