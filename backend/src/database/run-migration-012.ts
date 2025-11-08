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
    console.log('Starting migration 012: Add Co-Teamleiter and Event Staff Pool...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '012_add_co_teamleiter.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✓ Migration 012 completed successfully!');

    // Show stats
    const teamleiterCount = await client.query('SELECT COUNT(*) FROM event_teamleiter');
    const eventStaffCount = await client.query('SELECT COUNT(*) FROM event_staff');

    console.log(`✓ Migrated ${teamleiterCount.rows[0].count} teamleiter assignments`);
    console.log(`✓ Migrated ${eventStaffCount.rows[0].count} event staff assignments`);

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
