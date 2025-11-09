#!/bin/bash

echo "=========================================="
echo "Diagnose: Warum läuft alter Code?"
echo "=========================================="
echo ""

echo "1. Welcher Branch ist aktiv?"
git branch --show-current

echo ""
echo "2. Letzter Commit:"
git log -1 --oneline

echo ""
echo "3. Ist axios.get in der TypeScript-Datei?"
grep -n "axios.get" backend/src/services/signal.ts | head -2

echo ""
echo "4. Ist axios.post noch in der TypeScript-Datei?"
grep -n "axios.post" backend/src/services/signal.ts | grep qrcodelink

echo ""
echo "5. Was ist im kompilierten JavaScript?"
docker-compose exec backend cat /app/dist/services/signal.js | grep -A3 "qrcodelink"

echo ""
echo "6. Git Status:"
git status --short

echo ""
echo "7. Docker-Compose Volumes für Backend:"
docker-compose config | grep -A10 "backend:" | grep -A5 "volumes:"

echo ""
echo "=========================================="
echo "Diagnose abgeschlossen"
echo "=========================================="
