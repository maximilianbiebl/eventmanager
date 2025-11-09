#!/usr/bin/env node

/**
 * Script zum Überprüfen von Login-Credentials
 * Verwendung: node check-login.js <username> <password>
 */

const bcrypt = require('bcrypt');
const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function checkLogin() {
  // Argumente einlesen
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.error('❌ Verwendung: node check-login.js <username> <password>');
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
    console.log('🔍 Verbinde mit Datenbank...');
    await client.connect();

    console.log(`\n📝 Suche nach Benutzer "${username}"...`);

    // Benutzer suchen
    const result = await client.query('SELECT id, name, password_hash, role FROM users WHERE name = $1', [username]);

    if (result.rows.length === 0) {
      console.log('❌ Benutzer nicht gefunden!\n');
      console.log('📋 Verfügbare Benutzer:');
      const allUsers = await client.query('SELECT id, name, role FROM users ORDER BY id');
      allUsers.rows.forEach(u => {
        console.log(`   - ID: ${u.id}, Name: "${u.name}", Rolle: ${u.role}`);
      });
      process.exit(1);
    }

    const user = result.rows[0];
    console.log('✅ Benutzer gefunden!');
    console.log(`   ID: ${user.id}`);
    console.log(`   Name: "${user.name}" (Länge: ${user.name.length} Zeichen)`);
    console.log(`   Rolle: ${user.role}`);
    console.log(`   Password Hash: ${user.password_hash.substring(0, 29)}... (Länge: ${user.password_hash.length})`);

    console.log(`\n🔐 Teste Passwort "${password}" (Länge: ${password.length} Zeichen)...`);

    // Passwort prüfen
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (validPassword) {
      console.log('✅ Passwort ist KORREKT! Login sollte funktionieren.');
    } else {
      console.log('❌ Passwort ist FALSCH!');
      console.log('\n💡 Mögliche Probleme:');
      console.log('   1. Passwort wurde falsch eingegeben');
      console.log('   2. Passwort-Hash wurde nicht korrekt erstellt');
      console.log('   3. Leerzeichen am Anfang/Ende des Passworts');

      // Test mit Leerzeichen
      const trimmedPassword = password.trim();
      if (trimmedPassword !== password) {
        console.log(`\n   ⚠️  Passwort hat Leerzeichen: Original hat ${password.length} Zeichen, getrimmt ${trimmedPassword.length}`);
        const validTrimmed = await bcrypt.compare(trimmedPassword, user.password_hash);
        if (validTrimmed) {
          console.log('   ✅ Mit getrimmtem Passwort würde es funktionieren!');
        }
      }
    }

  } catch (error) {
    console.error('❌ Fehler:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

checkLogin();
