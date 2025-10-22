import * as fs from 'fs';
import * as path from 'path';
import pool from './connection';

async function runMigration() {
  try {
    console.log('Running migration 001_extend_schema.sql...');

    const migrationPath = path.join(__dirname, 'migrations/001_extend_schema.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migration);

    console.log('✅ Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
