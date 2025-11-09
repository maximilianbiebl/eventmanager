#!/bin/bash

# Script zum Zurücksetzen eines Benutzer-Passworts
# Verwendung: ./reset-password.sh <username> <new-password>

if [ "$#" -ne 2 ]; then
    echo "❌ Verwendung: ./reset-password.sh <username> <new-password>"
    echo "   Beispiel: ./reset-password.sh maxi MeinNeuesPasswort123"
    exit 1
fi

username="$1"
password="$2"

echo "🔄 Setze Passwort für Benutzer: $username"
echo ""

# Prüfe ob Backend läuft
if ! docker-compose ps backend | grep -q "Up"; then
    echo "❌ Backend-Container läuft nicht!"
    echo "   Starte Container..."
    docker-compose up -d backend
    echo "   Warte 10 Sekunden..."
    sleep 10
fi

echo "Generiere bcrypt-Hash im Backend-Container..."

# Erstelle temporäres Node.js-Script zum Hashen
HASH=$(docker-compose exec -T backend node -e "
const bcrypt = require('bcrypt');
bcrypt.hash('$password', 10).then(hash => console.log(hash));
")

# Entferne Leerzeichen/Newlines
HASH=$(echo "$HASH" | tr -d '[:space:]')

if [ -z "$HASH" ] || [ ${#HASH} -ne 60 ]; then
    echo "❌ Fehler beim Generieren des Hashes!"
    echo "   Hash: '$HASH' (Länge: ${#HASH})"
    exit 1
fi

echo "✅ Hash generiert (Länge: ${#HASH})"
echo ""

# Aktualisiere Passwort in Datenbank
echo "Aktualisiere Passwort in Datenbank..."
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "
UPDATE users
SET password_hash = '$HASH'
WHERE name = '$username';
"

# Prüfe ob Update erfolgreich war
result=$(docker-compose exec -T postgres psql -U eventmanager -d eventmanager -t -c "SELECT COUNT(*) FROM users WHERE name = '$username';")
count=$(echo "$result" | tr -d '[:space:]')

if [ "$count" -eq "0" ]; then
    echo "❌ Benutzer '$username' nicht gefunden!"
    echo ""
    echo "Verfügbare Benutzer:"
    docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "SELECT id, name, role FROM users ORDER BY id;"
    exit 1
fi

echo ""
echo "=========================================="
echo "✅ Passwort wurde erfolgreich geändert!"
echo "=========================================="
echo ""
echo "Login-Daten:"
echo "  Benutzername: $username"
echo "  Passwort: $password"
echo ""
echo "Sie können sich jetzt einloggen."
echo ""
