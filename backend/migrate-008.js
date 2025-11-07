const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Lade Config
const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const pool = new Pool({
  host: process.env.DB_HOST || config.database.host,
  port: parseInt(process.env.DB_PORT || config.ports.database),
  database: process.env.DB_NAME || config.database.name,
  user: process.env.DB_USER || config.database.user,
  password: process.env.DB_PASSWORD || config.database.password,
});

async function runMigration() {
  try {
    console.log('Running migration 008_add_teamleiter_role.sql...');
    console.log('Database config:', {
      host: config.database.host,
      port: config.ports.database,
      database: config.database.name,
      user: config.database.user
    });

    const migrationPath = path.join(__dirname, 'src/database/migrations/008_add_teamleiter_role.sql');
    const migration = fs.readFileSync(migrationPath, 'utf-8');

    await pool.query(migration);

    console.log('✅ Migration 008 completed successfully!');
    console.log('   - Added is_template column to events table');
    console.log('   - Updated role column documentation for teamleiter role');

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    await pool.end();
    process.exit(1);
  }
}

runMigration();
