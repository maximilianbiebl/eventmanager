#!/usr/bin/env node

/**
 * Script zum Erstellen eines Admin-Benutzers
 * Verwendung: node create-admin.js <username> <password>
 */

const bcrypt = require('bcrypt');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function createAdmin() {
  // Argumente einlesen
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Verwendung: node create-admin.js <username> <password>');
    console.error('   Beispiel: node create-admin.js admin MeinSicheresPasswort123');
    process.exit(1);
  }

  const [username, password] = args;

  // Config laden
  const configPath = process.env.CONFIG_PATH || path.join(__dirname, '../../config.json');
  const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

  // Datenbank-Verbindung
  const client = new Client({
    host: process.env.DB_HOST || config.database.host,
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || config.database.name,
    user: process.env.DB_USER || config.database.user,
    password: process.env.DB_PASSWORD || config.database.password,
  });

  try {
    console.log('Verbinde mit Datenbank...');
    await client.connect();

    // Prüfen ob Benutzer bereits existiert
    const checkResult = await client.query('SELECT id, role FROM users WHERE name = $1', [username]);

    if (checkResult.rows.length > 0) {
      const existingUser = checkResult.rows[0];
      console.log(`⚠️  Benutzer "${username}" existiert bereits (ID: ${existingUser.id}, Rolle: ${existingUser.role})`);

      // Fragen ob Passwort aktualisiert werden soll
      const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
      });

      const answer = await new Promise(resolve => {
        readline.question('Möchten Sie das Passwort aktualisieren? (j/n): ', resolve);
      });
      readline.close();

      if (answer.toLowerCase() === 'j' || answer.toLowerCase() === 'y') {
        const passwordHash = await bcrypt.hash(password, 10);
        await client.query(
          'UPDATE users SET password_hash = $1, role = $2 WHERE name = $3',
          [passwordHash, 'admin', username]
        );
        console.log(`✅ Passwort für "${username}" wurde aktualisiert und Rolle auf "admin" gesetzt`);
      } else {
        console.log('Abgebrochen.');
      }
    } else {
      // Neuen Admin-Benutzer erstellen
      console.log(`Erstelle Admin-Benutzer "${username}"...`);
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await client.query(
        'INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3) RETURNING id',
        [username, passwordHash, 'admin']
      );

      const userId = result.rows[0].id;
      console.log(`✅ Admin-Benutzer "${username}" wurde erstellt (ID: ${userId})`);
      console.log('');
      console.log('Sie können sich jetzt anmelden mit:');
      console.log(`   Benutzername: ${username}`);
      console.log(`   Passwort: ${password}`);
    }

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

createAdmin();
