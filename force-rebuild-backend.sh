#!/bin/bash

echo "========================================"
echo "Backend FORCE REBUILD (ohne Cache)"
echo "========================================"
echo ""

echo "WICHTIG: Stellen Sie sicher, dass Sie 'git pull' ausgeführt haben!"
echo ""
read -p "Haben Sie 'git pull' gemacht? (j/n): " answer

if [[ ! "$answer" =~ ^[Jj]$ ]]; then
  echo ""
  echo "Bitte führen Sie zuerst aus:"
  echo "  git pull origin claude/fix-docker-nginx-connectivity-011CUwSugaXQvds6QtJL7RxR"
  echo ""
  echo "Dann starten Sie dieses Script erneut."
  exit 1
fi

echo ""
echo "Schritt 1: Backend Container stoppen..."
docker-compose stop backend

echo ""
echo "Schritt 2: Container entfernen..."
docker-compose rm -f backend

echo ""
echo "Schritt 3: Backend neu bauen (OHNE CACHE)..."
docker-compose build --no-cache backend

echo ""
echo "Schritt 4: Backend starten..."
docker-compose up -d backend

echo ""
echo "Schritt 5: Warte 10 Sekunden..."
sleep 10

echo ""
echo "Schritt 6: Überprüfe ob der neue Code verwendet wird..."
docker-compose exec backend grep -n "axios.get" /app/dist/services/signal.js | head -3

echo ""
echo "Schritt 7: Backend Logs (letzte 50 Zeilen)..."
docker-compose logs --tail=50 backend

echo ""
echo "========================================"
echo "Fertig!"
echo "========================================"
echo ""
echo "Wenn oben 'axios.get' erscheint (Schritt 6), dann läuft der neue Code."
echo "Jetzt Signal Setup im Browser versuchen!"
echo ""
