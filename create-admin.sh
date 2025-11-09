#!/bin/bash

echo "========================================"
echo "Admin-Benutzer erstellen"
echo "========================================"
echo ""

# Prüfe ob wir im richtigen Verzeichnis sind
if [ ! -f "backend/package.json" ]; then
  echo "❌ Fehler: Bitte führen Sie dieses Script aus dem eventmanager-Verzeichnis aus"
  exit 1
fi

# Frage nach Benutzername
read -p "Admin-Benutzername: " username

# Frage nach Passwort (ohne Echo)
read -s -p "Admin-Passwort: " password
echo ""
read -s -p "Passwort wiederholen: " password2
echo ""

# Prüfe ob Passwörter übereinstimmen
if [ "$password" != "$password2" ]; then
  echo "❌ Passwörter stimmen nicht überein!"
  exit 1
fi

# Prüfe Passwortlänge
if [ ${#password} -lt 8 ]; then
  echo "❌ Passwort muss mindestens 8 Zeichen lang sein!"
  exit 1
fi

echo ""
echo "Erstelle Admin-Benutzer '$username'..."
echo ""

# Führe das Node-Script aus
cd backend
node src/database/create-admin.js "$username" "$password"

echo ""
echo "========================================"
echo "Fertig!"
echo "========================================"
