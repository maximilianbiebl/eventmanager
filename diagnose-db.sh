#!/bin/bash

echo "=========================================="
echo "Datenbank Diagnose"
echo "=========================================="
echo ""

# Prüfe Verbindung
echo "1. Teste Datenbankverbindung..."
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "SELECT version();" > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "   ✅ Verbindung OK"
else
  echo "   ❌ Keine Verbindung zur Datenbank!"
  exit 1
fi

echo ""
echo "2. Vorhandene Tabellen:"
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "\dt" | grep -v "^$"

echo ""
echo "3. Users-Tabelle Struktur:"
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "\d users"

echo ""
echo "4. Anzahl Benutzer:"
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "SELECT COUNT(*), role FROM users GROUP BY role;"

echo ""
echo "5. Benutzer-Liste (ohne Passwort-Hash):"
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "SELECT id, name, role, created_at FROM users;"

echo ""
echo "6. Fehlende Spalten prüfen (sollte keine Fehler geben):"

# Prüfe wichtige Spalten
COLUMNS=(
  "users.default_reminder_minutes"
  "users.push_enabled"
  "users.default_view"
  "users.start_notification_enabled"
  "users.signal_enabled"
  "users.signal_phone_number"
  "users.web_push_enabled"
  "tasks.start_time"
  "tasks.end_time"
  "tasks.is_public"
  "tasks.sort_order"
)

for col in "${COLUMNS[@]}"; do
  TABLE=$(echo $col | cut -d. -f1)
  COLUMN=$(echo $col | cut -d. -f2)

  docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name='$TABLE' AND column_name='$COLUMN'
  " | grep -q "$COLUMN"

  if [ $? -eq 0 ]; then
    echo "   ✅ $col"
  else
    echo "   ❌ $col (FEHLT!)"
  fi
done

echo ""
echo "=========================================="
echo "Diagnose abgeschlossen"
echo "=========================================="
