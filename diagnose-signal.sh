#!/bin/bash

echo "=========================================="
echo "Signal-CLI Container Diagnose"
echo "=========================================="
echo ""

echo "1. Überprüfe ob Container läuft:"
docker ps | grep signal

echo ""
echo "2. Überprüfe MODE Umgebungsvariable im Container:"
docker exec eventmanager-signal env | grep MODE

echo ""
echo "3. Teste verfügbare Endpunkte:"
echo ""
echo "   Testing /v1/about:"
docker exec eventmanager-signal curl -s http://localhost:8080/v1/about || echo "Fehler"

echo ""
echo "   Testing /v1/health:"
docker exec eventmanager-signal curl -s http://localhost:8080/v1/health || echo "Fehler"

echo ""
echo "   Testing /v1/qrcodelink (sollte 405 Method Not Allowed ohne POST sein):"
docker exec eventmanager-signal curl -s http://localhost:8080/v1/qrcodelink || echo "Fehler"

echo ""
echo "   Testing /v2/qrcodelink:"
docker exec eventmanager-signal curl -s http://localhost:8080/v2/qrcodelink || echo "Fehler"

echo ""
echo "4. Überprüfe Container Logs (letzte 30 Zeilen):"
docker logs --tail=30 eventmanager-signal

echo ""
echo "=========================================="
echo "Diagnose abgeschlossen"
echo "=========================================="
