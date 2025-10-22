# Port-Konfiguration

Es gibt **zwei Stellen**, wo Ports konfiguriert werden müssen:

## 1. `.env` Datei (für Docker Port-Mapping)

```bash
# .env Datei erstellen
cp .env.example .env

# Ports definieren
FRONTEND_PORT=3000
BACKEND_PORT=3001
DB_PORT=5432
```

Diese Ports definieren, auf welchen Ports **außerhalb** der Docker-Container die Services erreichbar sind.

## 2. `config.json` (für Anwendungslogik)

```json
{
  "ports": {
    "frontend": 3000,
    "backend": 3001,
    "database": 5432
  }
}
```

Diese Ports müssen **identisch** mit der `.env` Datei sein!

## Warum zwei Konfigurationen?

- **`.env`**: Docker Compose nutzt diese für Port-Mappings (HOST:CONTAINER)
- **`config.json`**: Die Anwendung nutzt diese für interne Verweise und Proxys

## Ports ändern - Schritt für Schritt

### Beispiel: Frontend auf Port 8080

1. **`.env` bearbeiten:**
   ```bash
   FRONTEND_PORT=8080
   ```

2. **`config.json` bearbeiten:**
   ```json
   {
     "ports": {
       "frontend": 8080,
       ...
     }
   }
   ```

3. **Container neu starten:**
   ```bash
   docker-compose down
   docker-compose up -d
   ```

4. **App ist nun erreichbar unter:**
   ```
   http://your-nas-ip:8080
   ```

## Standard-Ports

| Service    | Standard-Port | Kann geändert werden? |
|------------|---------------|----------------------|
| Frontend   | 3000         | ✅ Ja                |
| Backend    | 3001         | ✅ Ja                |
| PostgreSQL | 5432         | ✅ Ja                |

## Wichtig: Ports synchron halten!

**Die Ports in `.env` und `config.json` MÜSSEN identisch sein!**

### ❌ Falsch:
```bash
# .env
FRONTEND_PORT=8080
```
```json
// config.json
{"ports": {"frontend": 3000}}  // ← Falsch!
```

### ✅ Richtig:
```bash
# .env
FRONTEND_PORT=8080
```
```json
// config.json
{"ports": {"frontend": 8080}}  // ← Richtig!
```

## Port-Konflikte vermeiden

Wenn ein Port bereits belegt ist:

```bash
# Prüfen welcher Prozess Port 3000 nutzt
sudo netstat -tulpn | grep 3000

# Oder mit lsof
lsof -i :3000
```

Dann entweder:
- Anderen Prozess stoppen
- Oder anderen Port in `.env` UND `config.json` wählen

## Synology-spezifische Hinweise

Auf Synology NAS sind einige Ports standardmäßig belegt:

| Port | Verwendet von        |
|------|---------------------|
| 80   | HTTP Web Interface  |
| 443  | HTTPS Web Interface |
| 5000 | DSM Web Interface   |
| 5001 | DSM HTTPS          |

Vermeiden Sie diese Ports!

## Automatische Synchronisation (Zukunft)

Aktuell müssen beide Dateien manuell synchron gehalten werden. Eine mögliche Verbesserung wäre ein Script:

```bash
#!/bin/bash
# sync-ports.sh - Liest config.json und schreibt .env

FRONTEND_PORT=$(jq -r '.ports.frontend' config.json)
BACKEND_PORT=$(jq -r '.ports.backend' config.json)
DB_PORT=$(jq -r '.ports.database' config.json)

cat > .env << EOF
FRONTEND_PORT=$FRONTEND_PORT
BACKEND_PORT=$BACKEND_PORT
DB_PORT=$DB_PORT
EOF
```
