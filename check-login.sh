#!/bin/bash

# Script zum Überprüfen von Login-Credentials
# Verwendung: ./check-login.sh <username>

if [ "$#" -ne 1 ]; then
    echo "❌ Verwendung: ./check-login.sh <username>"
    echo "   Beispiel: ./check-login.sh admin"
    exit 1
fi

username="$1"

echo "🔍 Überprüfe Login für Benutzer: $username"
echo ""

# Prüfe ob Docker läuft
if ! docker-compose ps postgres | grep -q "Up"; then
    echo "❌ Datenbank-Container läuft nicht!"
    echo "   Starte Container mit: docker-compose up -d"
    exit 1
fi

# Lies DB-Konfiguration
DB_NAME=$(grep -A 5 '"database"' backend/config.json | grep '"name"' | cut -d'"' -f4)
DB_USER=$(grep -A 5 '"database"' backend/config.json | grep '"user"' | cut -d'"' -f4)

# SQL Query um Benutzer zu finden und Details anzuzeigen
SQL="
SELECT
    id,
    name,
    role,
    LENGTH(name) as name_length,
    LENGTH(password_hash) as hash_length,
    SUBSTRING(password_hash, 1, 29) || '...' as hash_preview,
    CASE
        WHEN password_hash LIKE '\$2b\$10\$%' THEN 'Bcrypt (korrekt)'
        WHEN password_hash LIKE '\$2a\$10\$%' THEN 'Bcrypt (korrekt)'
        ELSE 'WARNUNG: Kein bcrypt Hash!'
    END as hash_type
FROM users
WHERE name = '$username';
"

echo "📝 Suche nach Benutzer '$username'..."
echo ""

result=$(docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -t -c "$SQL")

if [ -z "$(echo "$result" | tr -d '[:space:]')" ]; then
    echo "❌ Benutzer '$username' nicht gefunden!"
    echo ""
    echo "📋 Verfügbare Benutzer:"
    docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "SELECT id, name, role FROM users ORDER BY id;"
else
    echo "✅ Benutzer gefunden!"
    echo ""
    docker-compose exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -c "$SQL"
    echo ""
    echo "💡 Hinweise:"
    echo "   - name_length sollte genau der Länge deines Benutzernamens entsprechen"
    echo "   - hash_length sollte 60 sein für bcrypt"
    echo "   - hash_type sollte 'Bcrypt (korrekt)' sein"
    echo ""
    echo "🔐 Um das Passwort zu testen, versuche dich einzuloggen und schicke mir:"
    echo "   1. Den genauen Benutzernamen (auch mit Groß-/Kleinschreibung)"
    echo "   2. Die Browser-Konsole Ausgabe (F12 -> Console)"
    echo "   3. Das Backend-Log zur Zeit des Login-Versuchs"
fi
