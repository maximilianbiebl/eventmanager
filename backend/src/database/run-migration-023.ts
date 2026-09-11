import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'eventmanager',
  user: process.env.DB_USER || 'eventmanager',
  password: process.env.DB_PASSWORD || 'eventmanager',
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('Starting migration 023: Notizen fuer Veranstaltung, Gruppe und Aufgabe...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '023_notizen.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✓ Migration 023 abgeschlossen: Notizfelder stehen bereit.');
  } catch (error: any) {
    await client.query('ROLLBACK');
    // Fehlermeldung des Servers durchreichen - sie sagt, was schiefging.

    console.error('\nMigration 023 nicht ausgefuehrt:');
    console.error(error?.message || error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration().catch((err) => {
  console.error('Migration error:', err);
  process.exit(1);
});
