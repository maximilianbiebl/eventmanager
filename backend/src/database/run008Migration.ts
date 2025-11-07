import * as fs from 'fs';
import * as path from 'path';
import pool from './connection';

async function runMigration() {
  try {
    console.log('Running migration 008_add_teamleiter_role.sql...');

    const migrationPath = path.join(__dirname, 'migrations/008_add_teamleiter_role.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migration);

    console.log('✅ Migration 008 completed successfully!');
    console.log('   - Added is_template column to events table');
    console.log('   - Updated role column documentation for teamleiter role');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
