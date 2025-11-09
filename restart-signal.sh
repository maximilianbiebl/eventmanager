#!/bin/bash

echo "========================================"
echo "Signal-CLI Container Neustart"
echo "========================================"
echo ""

echo "Schritt 1: Signal-CLI Container stoppen..."
docker-compose stop signal-cli

echo ""
echo "Schritt 2: Container entfernen..."
docker-compose rm -f signal-cli

echo ""
echo "Schritt 3: Container mit neuem MODE neu erstellen..."
docker-compose up -d signal-cli

echo ""
echo "Schritt 4: Warte 5 Sekunden..."
sleep 5

echo ""
echo "Schritt 5: Container-Status prüfen..."
docker-compose ps signal-cli

echo ""
echo "Schritt 6: Letzte Logs anzeigen..."
docker-compose logs --tail=20 signal-cli

echo ""
echo "========================================"
echo "Fertig!"
echo "========================================"
echo ""
echo "Prüfen Sie, ob diese Zeile in den Logs erscheint:"
echo '  level=info msg="Started Signal Messenger REST API"'
echo ""
echo "Wenn ja, versuchen Sie jetzt die Signal-Einrichtung im Browser."
echo ""
