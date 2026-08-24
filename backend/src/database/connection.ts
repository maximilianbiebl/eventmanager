import { Pool, types } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

/*
 * DATE-Spalten als reine Zeichenkette liefern.
 *
 * Standardmässig baut der pg-Treiber aus einer DATE-Spalte ein JS-Date -
 * Mitternacht in der ZEITZONE DES SERVERS. Über JSON wird daraus ein
 * UTC-Zeitstempel, und jeder Client legt seine eigene Zeitzone darüber.
 * Der 7. Oktober wurde so je nach Standort zum 6. oder 8.
 *
 * Ein Startdatum ist aber ein Kalendertag, kein Zeitpunkt. Deshalb wird es
 * unverändert als "YYYY-MM-DD" durchgereicht - dann interpretiert es
 * niemand mehr um. (1082 = OID des Typs DATE.)
 */
types.setTypeParser(1082, (value: string) => value);

// Lade Konfiguration aus config.json
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

export const pool = new Pool({
  host: process.env.DB_HOST || config.database.host,
  port: parseInt(process.env.DB_PORT || config.ports.database),
  database: process.env.DB_NAME || config.database.name,
  user: process.env.DB_USER || config.database.user,
  password: process.env.DB_PASSWORD || config.database.password,
});

export const query = (text: string, params?: any[]) => {
  return pool.query(text, params);
};

export default pool;
