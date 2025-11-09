# Backend Update Anleitung

## Problem: Änderungen werden nicht übernommen

Wenn Sie Code-Änderungen gepullt haben, aber das Backend immer noch den alten Code verwendet.

## Lösung: Force Rebuild

### Schritt-für-Schritt auf Ihrem Server:

```bash
# 1. Zum Projekt-Verzeichnis wechseln
cd /pfad/zum/eventmanager

# 2. Neueste Änderungen holen
git pull origin claude/fix-docker-nginx-connectivity-011CUwSugaXQvds6QtJL7RxR

# 3. Backend OHNE Cache neu bauen
./force-rebuild-backend.sh
```

### Oder manuell:

```bash
# 1. Git pull
git pull origin claude/fix-docker-nginx-connectivity-011CUwSugaXQvds6QtJL7RxR

# 2. Backend stoppen
docker-compose stop backend

# 3. Container entfernen
docker-compose rm -f backend

# 4. Neu bauen OHNE CACHE
docker-compose build --no-cache backend

# 5. Starten
docker-compose up -d backend

# 6. Logs prüfen
docker-compose logs -f backend
```

## Überprüfung ob neuer Code läuft

### Test 1: Grep nach axios.get in kompiliertem Code
```bash
docker-compose exec backend grep "axios.get" /app/dist/services/signal.js
```

Sollte zeigen:
```javascript
const response = await axios_1.default.get(...)
```

### Test 2: Signal Setup im Browser
1. Menü → ⚙️ Einstellungen → 💬 Signal Setup
2. Auf "🔗 Signal einrichten" klicken
3. Backend-Logs beobachten:

```bash
docker-compose logs -f backend
```

Sollte zeigen:
```
Attempting to register Signal account: +temp...
```

Und **NICHT mehr**:
```
Signal register error: 404 page not found
```

### Test 3: Signal-CLI Logs prüfen
```bash
docker-compose logs signal-cli | tail -20
```

Sollte zeigen:
```
[GIN] ... | 200 | GET "/v1/qrcodelink?device_name=..."
```

Statt:
```
[GIN] ... | 404 | POST "/v1/qrcodelink?..."
```

## Warum ist das nötig?

1. **TypeScript muss kompiliert werden**
   - Änderungen in `backend/src/*.ts`
   - Müssen zu `backend/dist/*.js` kompiliert werden

2. **Docker Build-Cache**
   - Docker verwendet Cache für schnellere Builds
   - `--no-cache` erzwingt kompletten Neuaufbau

3. **Code-Reload im Container**
   - Container verwendet kompilierten Code aus Build-Zeit
   - Restart allein lädt keinen neuen Code
   - Rebuild ist erforderlich

## Häufige Fehler

### "Immer noch POST statt GET"
→ Code wurde nicht neu gebaut, Cache verwenden
→ Lösung: `--no-cache` verwenden

### "git pull sagt 'Already up to date'"
→ Sie sind nicht auf dem richtigen Branch
→ Lösung: `git checkout claude/fix-docker-nginx-connectivity-011CUwSugaXQvds6QtJL7RxR`

### "Container startet nicht"
→ Build-Fehler oder Port belegt
→ Lösung: Logs prüfen mit `docker-compose logs backend`

## Schnelltest

Nach dem Rebuild:

```bash
# Zeigt ob axios.get verwendet wird
docker-compose exec backend cat /app/dist/services/signal.js | grep -A5 "registerAccount"
```

Sollte axios.get zeigen, nicht axios.post!
