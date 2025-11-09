# SCHNELLHILFE: Signal-CLI 404 Fehler beheben

## Problem
```
POST /v1/qrcodelink 404 page not found
Signal setup error: Error: Failed to register Signal account
```

## Ursache
Der Signal-CLI Container läuft im **json-rpc** Mode statt im **normal** REST API Mode.

## Lösung (3 Schritte)

### 1. Container neu starten mit korrektem MODE

```bash
# Container stoppen
docker-compose down signal-cli

# Container mit neuem MODE starten
docker-compose up -d signal-cli
```

### 2. Warten bis Container bereit ist

```bash
# Logs beobachten - warten auf "Started Signal Messenger REST API"
docker-compose logs -f signal-cli
```

Drücken Sie `Ctrl+C` wenn Sie diese Zeile sehen:
```
level=info msg="Started Signal Messenger REST API"
```

### 3. Erneut versuchen

1. Öffnen Sie das Web-Interface
2. **Menü** → **⚙️ Einstellungen** → **💬 Signal Setup**
3. Klicken Sie auf **🔗 Signal einrichten**
4. Der QR-Code sollte jetzt angezeigt werden!

## Prüfung

Nach dem Neustart sollten die Logs zeigen:
```
[GIN] ... | 200 | POST "/v1/qrcodelink?account=..."
```

Statt:
```
[GIN] ... | 404 | POST "/v1/qrcodelink?account=..."
```

## Was wurde geändert?

In `docker-compose.yml` wurde geändert:
```yaml
signal-cli:
  environment:
    MODE: normal  # Vorher: json-rpc
```

## Weitere Hilfe

Siehe `SIGNAL_SETUP.md` für die vollständige Dokumentation.
