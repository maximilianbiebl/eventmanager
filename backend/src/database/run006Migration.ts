import * as fs from 'fs';
import * as path from 'path';
import pool from './connection';

async function runMigration() {
  try {
    console.log('Running migration 006_add_task_active_field.sql...');

    const migrationPath = path.join(__dirname, 'migrations/006_add_task_active_field.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migration);

    console.log('✅ Migration 006 completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
