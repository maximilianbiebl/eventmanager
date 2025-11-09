# Signal Integration Setup

## Übersicht

Der Event Manager unterstützt Signal-Benachrichtigungen durch Integration mit [signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api). Dieses Dokument beschreibt, wie Sie Signal einrichten und verwenden.

## Voraussetzungen

- Docker und Docker Compose installiert
- Ein Signal-Account auf Ihrem Smartphone
- Die Event Manager Anwendung läuft

## 1. Signal-CLI Container starten

Der Signal-CLI Container ist bereits in `docker-compose.yml` konfiguriert.

### Container starten:

```bash
docker-compose up -d signal-cli
```

### Container-Status prüfen:

```bash
docker-compose ps signal-cli
```

Sollte zeigen:
```
NAME                   STATUS    PORTS
eventmanager-signal    Up        0.0.0.0:8080->8080/tcp
```

### Logs ansehen (bei Problemen):

```bash
docker-compose logs -f signal-cli
```

## 2. Signal in config.json aktivieren

Die Datei `config.json` sollte bereits folgende Einstellungen enthalten:

```json
{
  "signal": {
    "apiUrl": "http://signal-cli:8080",
    "enabled": true
  }
}
```

**Hinweis:** Wenn Sie Signal deaktivieren möchten, setzen Sie `enabled: false`.

## 3. Datenbank-Migration ausführen

Stellen Sie sicher, dass Migration 011 ausgeführt wurde:

```bash
cd backend
npm run migrate:011
```

**Oder nutzen Sie das Hilfsskript:**

```bash
./run-signal-migration.sh
```

## 4. Backend neu starten

Nach Konfigurationsänderungen oder Migration:

```bash
docker-compose restart backend
```

## 5. Signal-Account einrichten (Teamleiter/Admin)

### Im Web-Interface:

1. **Anmelden** als Teamleiter oder Admin
2. **Menü** → **⚙️ Einstellungen** öffnen
3. Zum Tab **💬 Signal Setup** wechseln
4. Auf **🔗 Signal einrichten** klicken
5. **QR-Code scannen** mit Signal auf dem Handy:
   - Signal öffnen
   - Einstellungen → Verknüpfte Geräte
   - "Gerät hinzufügen" antippen
   - QR-Code scannen

Das System prüft automatisch alle 3 Sekunden, ob die Verbindung hergestellt wurde.

### Test-Nachricht senden:

Nach erfolgreicher Verbindung können Sie eine Test-Nachricht senden:

1. Telefonnummer im internationalen Format eingeben (z.B. `+491234567890`)
2. Auf **📤 Test senden** klicken

## 6. Mitarbeiter-Benachrichtigungen aktivieren

### Für normale Mitarbeiter:

1. **Anmelden** als Staff-Benutzer
2. **⚙️ Einstellungen** öffnen
3. **💬 Signal Benachrichtigungen** aktivieren
4. **Telefonnummer** eingeben (internationales Format: +49...)
5. **Speichern**

Mitarbeiter erhalten nun Signal-Nachrichten für:
- Erinnerungen vor Aufgaben-Start
- Aufgaben-Start Benachrichtigungen
- Neue Aufgaben-Zuweisungen

## Fehlerbehebung

### Problem: "Signal-CLI service is not reachable"

**Ursache:** Der signal-cli Container läuft nicht oder ist nicht erreichbar.

**Lösung:**

```bash
# Container-Status prüfen
docker-compose ps signal-cli

# Container neu starten
docker-compose restart signal-cli

# Container-Logs prüfen
docker-compose logs signal-cli

# Falls Container nicht existiert:
docker-compose up -d signal-cli
```

### Problem: "Signal setup failed: Network error"

**Ursache:** Docker-Netzwerk-Problem oder Container-Konnektivität.

**Lösung:**

```bash
# Alle Container neu starten
docker-compose down
docker-compose up -d

# Netzwerk prüfen
docker network ls
docker network inspect eventmanager_eventmanager-network
```

### Problem: 500 Error bei /api/signal/setup

**Ursache:** Migration 011 wurde nicht ausgeführt.

**Lösung:**

```bash
cd backend
npm run migrate:011

# Backend neu starten
docker-compose restart backend
```

### Problem: QR-Code wird nicht angezeigt

**Ursache:** Frontend kann Backend nicht erreichen oder API-Fehler.

**Lösung:**

1. **Browser-Konsole öffnen** (F12) und Fehler prüfen
2. **Backend-Logs prüfen:**
   ```bash
   docker-compose logs backend | grep -i signal
   ```
3. **Signal-Health prüfen:**
   ```bash
   # Im Backend-Container:
   curl http://signal-cli:8080/v1/health
   ```

### Problem: Signal-Nachricht kommt nicht an

**Ursache:** Telefonnummer falsch formatiert oder Signal-Account nicht verknüpft.

**Lösung:**

1. **Telefonnummer prüfen:**
   - Muss mit `+` beginnen
   - Ländercode verwenden (z.B. +49 für Deutschland)
   - Keine Leerzeichen oder Bindestriche
   - Beispiel: `+491234567890`

2. **Signal-Account Status prüfen:**
   - Einstellungen → Signal Setup
   - Status sollte "Signal verbunden" zeigen

## Architektur

```
┌─────────────────┐
│   Frontend      │
│  (React/TS)     │
└────────┬────────┘
         │
         │ HTTP/REST
         │
┌────────▼────────┐
│   Backend       │
│   (Node/TS)     │
└────────┬────────┘
         │
         │ HTTP/REST
         │
┌────────▼────────┐
│  signal-cli     │
│  REST API       │
│  (Container)    │
└────────┬────────┘
         │
         │ Signal Protocol
         │
┌────────▼────────┐
│  Signal Server  │
│  (Signal.org)   │
└─────────────────┘
```

## API-Endpunkte

### Health Check
```
GET /api/signal/health
Authorization: Bearer <token>

Response:
{
  "available": true,
  "message": "Signal-CLI is available"
}
```

### Setup (Teamleiter/Admin)
```
POST /api/signal/setup
Authorization: Bearer <token>

Response:
{
  "qrCode": "data:image/png;base64,...",
  "linkUri": "sgnl://linkdevice?uuid=...",
  "accountNumber": "+temp81234567890",
  "message": "Scannen Sie den QR-Code..."
}
```

### Status (Teamleiter/Admin)
```
GET /api/signal/status
Authorization: Bearer <token>

Response:
{
  "linked": true,
  "accountNumber": "+temp81234567890",
  "linkedAt": "2025-11-09T02:00:00.000Z"
}
```

### Settings (Alle User)
```
GET /api/signal/settings
Authorization: Bearer <token>

Response:
{
  "signal_enabled": true,
  "signal_phone_number": "+491234567890",
  "web_push_enabled": true
}
```

## Sicherheitshinweise

1. **Telefonnummern sind sensible Daten** - Werden verschlüsselt in der Datenbank gespeichert
2. **Signal-Account Trennung** - Immer trennen, wenn das Gerät nicht mehr verwendet wird
3. **Verknüpfte Geräte** - Regelmäßig in Signal-Einstellungen prüfen
4. **Produktions-Deployment** - Verwenden Sie HTTPS für alle API-Aufrufe

## Weitere Informationen

- [Signal-CLI REST API Dokumentation](https://github.com/bbernhard/signal-cli-rest-api)
- [Signal Protocol Dokumentation](https://signal.org/docs/)
- Event Manager SIGNAL_FIX.md für Migration-Details
