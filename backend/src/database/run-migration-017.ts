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
    console.log('Starting migration 017: Status timestamp...');


    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '017_status_changed_at.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✓ Migration 017 abgeschlossen: Statusaenderungen bekommen jetzt einen Zeitstempel.');
  } catch (error: any) {
    await client.query('ROLLBACK');
    // Die Migration bricht absichtlich ab, wenn es Doppelte gibt - dann ist
    // die Meldung des Servers die eigentliche Information.
    console.error('\nMigration 017 nicht ausgefuehrt:');
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
