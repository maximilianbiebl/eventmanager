import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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
