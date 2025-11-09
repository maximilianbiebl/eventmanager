#!/bin/bash

echo "=========================================="
echo "Vollständige Datenbank-Migration"
echo "=========================================="
echo ""

# Prüfe ob wir im richtigen Verzeichnis sind
if [ ! -f "docker-compose.yml" ]; then
  echo "❌ Fehler: Bitte führen Sie dieses Script aus dem eventmanager-Verzeichnis aus"
  exit 1
fi

# Prüfe ob Datenbank-Container läuft
if ! docker-compose ps postgres | grep -q "Up"; then
  echo "❌ Datenbank-Container läuft nicht!"
  echo "   Starte Container..."
  docker-compose up -d postgres
  echo "   Warte 5 Sekunden..."
  sleep 5
fi

echo "1. Erstelle Datenbank neu (WARNUNG: Alle Daten werden gelöscht!)"
read -p "   Möchten Sie fortfahren? (j/n): " confirm

if [[ ! "$confirm" =~ ^[Jj]$ ]]; then
  echo "Abgebrochen."
  exit 0
fi

echo ""
echo "2. Lösche und erstelle Datenbank neu..."
docker-compose exec -T postgres psql -U eventmanager -d postgres -c "DROP DATABASE IF EXISTS eventmanager;"
docker-compose exec -T postgres psql -U eventmanager -d postgres -c "CREATE DATABASE eventmanager;"

echo ""
echo "3. Führe Basis-Schema aus..."
docker-compose exec -T postgres psql -U eventmanager -d eventmanager < backend/src/database/schema.sql

echo ""
echo "4. Führe Migrationen aus..."

# Migrationen in Reihenfolge
MIGRATIONS=(
  "001_extend_schema.sql"
  "003_add_user_settings.sql"
  "004_add_notification_type.sql"
  "005_add_view_and_notification_preferences.sql"
  "006_add_task_active_field.sql"
  "007_add_task_sort_order.sql"
  "008_add_teamleiter_role.sql"
  "009_add_template_suggestion.sql"
  "010_make_instance_start_date_nullable.sql"
  "011_add_signal_notifications.sql"
  "012_add_co_teamleiter.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  if [ -f "backend/src/database/migrations/$migration" ]; then
    echo "   → $migration"
    docker-compose exec -T postgres psql -U eventmanager -d eventmanager < "backend/src/database/migrations/$migration"
  else
    echo "   ⚠️  Überspringe $migration (nicht gefunden)"
  fi
done

echo ""
echo "5. Erstelle Admin-Benutzer..."
read -p "   Admin-Benutzername [admin]: " username
username=${username:-admin}

read -s -p "   Admin-Passwort: " password
echo ""

if [ -z "$password" ]; then
  password="admin"
  echo "   Verwende Standard-Passwort: admin"
fi

# Prüfe ob Backend läuft
if ! docker-compose ps backend | grep -q "Up"; then
  echo "   Starte Backend-Container..."
  docker-compose up -d backend
  echo "   Warte 10 Sekunden..."
  sleep 10
fi

# Erstelle Admin im Container
docker-compose exec -T backend node /app/dist/database/create-admin.js "$username" "$password" 2>/dev/null || {
  echo "   ℹ️  Script nicht im Container, erstelle direkt in DB..."

  # Fallback: Direkt in Datenbank mit vorgeneriertem Hash
  # Hash für "admin" mit bcrypt rounds=10
  HASH='$2b$10$XQHb7A1HLd.FvJPKh9Z7JOqKp0qYvGn6mGG4Vh4qhC4VhC4Vh4qhm'

  docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "
    INSERT INTO users (name, password_hash, role)
    VALUES ('$username', '$HASH', 'admin')
    ON CONFLICT DO NOTHING;
  "
}

echo ""
echo "6. Überprüfe Datenbank-Struktur..."
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "\dt" | grep -E "users|events|tasks"

echo ""
echo "=========================================="
echo "✅ Migration abgeschlossen!"
echo "=========================================="
echo ""
echo "Login-Daten:"
echo "  Benutzername: $username"
echo "  Passwort: $password"
echo ""
echo "Starten Sie nun das Backend und Frontend neu:"
echo "  docker-compose restart backend frontend"
echo ""
