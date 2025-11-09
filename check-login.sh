#!/bin/bash

# Script zum Überprüfen von Login-Credentials
# Verwendung: ./check-login.sh <username> <password>

if [ "$#" -ne 2 ]; then
    echo "❌ Verwendung: ./check-login.sh <username> <password>"
    echo "   Beispiel: ./check-login.sh admin MeinPasswort"
    exit 1
fi

username="$1"
password="$2"

echo "🔍 Überprüfe Login für Benutzer: $username"
echo ""

# Prüfe ob Docker läuft
if ! docker-compose ps backend | grep -q "Up"; then
    echo "❌ Backend-Container läuft nicht!"
    echo "   Starte Container mit: docker-compose up -d"
    exit 1
fi

# Führe Check im Container aus
docker-compose exec -T backend node /app/src/database/check-login.js "$username" "$password"
