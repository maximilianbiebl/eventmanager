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
    console.log('Starting migration 014: Add task series support...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '014_add_task_series.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✓ Migration 014 completed successfully!');

    // Show stats
    const seriesTableCheck = await client.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'task_series'"
    );

    const membersTableCheck = await client.query(
      "SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'task_series_members'"
    );

    console.log(`✓ task_series table created: ${seriesTableCheck.rows[0].count === '1' ? 'Yes' : 'No'}`);
    console.log(`✓ task_series_members table created: ${membersTableCheck.rows[0].count === '1' ? 'Yes' : 'No'}`);

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
