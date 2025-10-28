import * as fs from 'fs';
import * as path from 'path';
import pool from './connection';

async function runMigration() {
  try {
    console.log('Running migration 005_add_view_and_notification_preferences.sql...');

    const migrationPath = path.join(__dirname, 'migrations/005_add_view_and_notification_preferences.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migration);

    console.log('✅ Migration 005 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
