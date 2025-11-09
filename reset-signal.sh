#!/bin/bash

echo "=========================================="
echo "Signal-CLI Zurücksetzen"
echo "=========================================="
echo ""
echo "⚠️  WARNUNG: Dies löscht alle Signal-CLI Daten!"
echo "   - Alle verknüpften Geräte werden getrennt"
echo "   - Sie müssen den QR-Code erneut scannen"
echo ""
read -p "Möchten Sie fortfahren? (j/n): " confirm

if [[ ! "$confirm" =~ ^[Jj]$ ]]; then
  echo "Abgebrochen."
  exit 0
fi

echo ""
echo "1. Stoppe Signal-CLI Container..."
docker-compose stop signal-cli

echo ""
echo "2. Lösche Signal-CLI Daten..."
docker volume rm eventmanager_signal_data 2>/dev/null || echo "   Volume existiert nicht oder ist noch in Verwendung"

echo ""
echo "3. Starte Signal-CLI neu..."
docker-compose up -d signal-cli

echo ""
echo "4. Warte 10 Sekunden auf Container-Start..."
sleep 10

echo ""
echo "5. Prüfe Signal-CLI Status..."
docker-compose exec signal-cli wget -O- http://localhost:8080/v1/about 2>/dev/null | head -20

echo ""
echo "6. Setze Datenbank zurück (signal_linked = false)..."
docker-compose exec -T postgres psql -U eventmanager -d eventmanager -c "
UPDATE users
SET signal_linked = false,
    signal_account_number = NULL,
    signal_linked_at = NULL
WHERE signal_linked = true;
"

echo ""
echo "=========================================="
echo "✅ Signal-CLI wurde zurückgesetzt!"
echo "=========================================="
echo ""
echo "Sie können jetzt in der Anwendung:"
echo "  1. Zur Signal-Einrichtung gehen"
echo "  2. Einen neuen QR-Code generieren"
echo "  3. Den QR-Code mit Ihrem Handy scannen"
echo ""
