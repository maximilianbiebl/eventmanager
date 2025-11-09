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
    console.log('Starting migration 013: Add teamleiter status notifications preference...');

    const migrationSQL = fs.readFileSync(
      path.join(__dirname, 'migrations', '013_add_teamleiter_status_notifications.sql'),
      'utf8'
    );

    await client.query('BEGIN');
    await client.query(migrationSQL);
    await client.query('COMMIT');

    console.log('✓ Migration 013 completed successfully!');

    // Show stats
    const usersWithPrefCount = await client.query(
      'SELECT COUNT(*) FROM users WHERE teamleiter_status_notifications IS NOT NULL'
    );

    console.log(`✓ ${usersWithPrefCount.rows[0].count} users now have teamleiter_status_notifications preference`);

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
