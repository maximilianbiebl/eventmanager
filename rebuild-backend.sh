#!/bin/bash

echo "========================================"
echo "Backend neu bauen und starten"
echo "========================================"
echo ""

echo "Schritt 1: Backend Container stoppen..."
docker-compose stop backend

echo ""
echo "Schritt 2: Alten Container entfernen..."
docker-compose rm -f backend

echo ""
echo "Schritt 3: Backend neu bauen (TypeScript kompilieren)..."
docker-compose build backend

echo ""
echo "Schritt 4: Backend Container starten..."
docker-compose up -d backend

echo ""
echo "Schritt 5: Warte 5 Sekunden auf Start..."
sleep 5

echo ""
echo "Schritt 6: Backend Status prüfen..."
docker-compose ps backend

echo ""
echo "Schritt 7: Letzte Logs anzeigen..."
docker-compose logs --tail=30 backend

echo ""
echo "========================================"
echo "Fertig! Backend läuft mit neuem Code"
echo "========================================"
echo ""
echo "Jetzt können Sie Signal Setup im Browser versuchen."
echo ""
