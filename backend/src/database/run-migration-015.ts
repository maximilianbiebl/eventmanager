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
    console.log('Starting migration 015: Backfill series assignments...');

    const before = await client.query('SELECT COUNT(*)::int AS n FROM task_assignments');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '015_backfill_series_assignments.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    const after = await client.query('SELECT COUNT(*)::int AS n FROM task_assignments');
    const created = after.rows[0].n - before.rows[0].n;

    console.log(`✓ Migration 015 abgeschlossen: ${created} fehlende Zuweisungen ergaenzt.`);
    if (created === 0) {
      console.log('  (Nichts nachzuholen - alle Serien-Mitglieder hatten bereits Zuweisungen.)');
    }
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', error);
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
