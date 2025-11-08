# Signal Benachrichtigungen Integration

## Überblick

Diese Integration ermöglicht es Mitarbeitern, Benachrichtigungen via Signal zu erhalten. Teamleiter und Admins können ihre Signal-Accounts verknüpfen und Benachrichtigungen an ihre Mitarbeiter senden.

## Features

### Für Mitarbeiter (Staff)
- Auswahl zwischen Web Push und/oder Signal Benachrichtigungen
- Eingabe der Telefonnummer für Signal-Benachrichtigungen
- Einstellungen im persönlichen Settings-Menü

### Für Teamleiter/Admin
- Eigenen Signal-Account via QR-Code verknüpfen
- Automatischer Versand von Benachrichtigungen an Mitarbeiter
- Persistente Geräte-Kopplung (bleibt aktiv)
- Möglichkeit zur erneuten Kopplung bei Trennung

## Setup

### 1. Docker Services starten

```bash
docker-compose up -d
```

Dies startet:
- PostgreSQL Datenbank
- Backend
- Frontend
- **Signal-CLI REST API** (Port 8080)

### 2. Datenbank Migration ausführen

```bash
cd backend
npm run migrate:011
```

### 3. Konfiguration

Die Signal-CLI API ist bereits in `docker-compose.yml` und `config.json` konfiguriert:

```json
{
  "signal": {
    "apiUrl": "http://signal-cli:8080",
    "enabled": true
  }
}
```

## Verwendung

### Als Teamleiter/Admin:

1. **Einstellungen öffnen**
2. **"Signal einrichten" Button** klicken
3. **QR-Code scannen** mit Signal-App (Verknüpftes Gerät hinzufügen)
4. Nach erfolgreicher Kopplung: **Status wird automatisch aktualisiert**
5. Mitarbeiter erhalten Benachrichtigungen von deinem Signal-Account

### Als Mitarbeiter:

1. **Einstellungen öffnen**
2. **Signal-Benachrichtigungen aktivieren** (Checkbox)
3. **Telefonnummer eingeben** (im internationalen Format, z.B. +4917...)
4. Benachrichtigungen werden ab sofort auch via Signal empfangen

## API Endpoints

### Signal Account Management (Teamleiter/Admin)

- `POST /api/signal/setup` - QR-Code für Linking generieren
- `GET /api/signal/check-link` - Prüfe ob Account gelinkt ist
- `GET /api/signal/status` - Aktuellen Status abrufen
- `POST /api/signal/unlink` - Verbindung trennen
- `POST /api/signal/test` - Test-Nachricht senden

### Benachrichtigungs-Einstellungen (Alle User)

- `GET /api/signal/settings` - Einstellungen abrufen
- `PUT /api/signal/settings` - Einstellungen aktualisieren

## Datenbank-Schema

Neue Felder in `users` Tabelle:

```sql
-- Für alle User
signal_enabled BOOLEAN DEFAULT FALSE
signal_phone_number VARCHAR(20)
web_push_enabled BOOLEAN DEFAULT TRUE

-- Für Teamleiter/Admin
signal_account_number VARCHAR(20)
signal_device_id VARCHAR(255)
signal_linked BOOLEAN DEFAULT FALSE
signal_linked_at TIMESTAMP
```

## Technische Details

### Signal-CLI REST API

Die Integration nutzt [bbernhard/signal-cli-rest-api](https://github.com/bbernhard/signal-cli-rest-api):
- Docker Image: `bbernhard/signal-cli-rest-api:latest`
- Mode: `json-rpc`
- Persistente Daten in Docker Volume `signal_data`

### Benachrichtigungs-Flow

1. **Notification Scheduler** prüft Tasks jede Minute
2. Für jeden betroffenen User:
   - **Web Push**: Wenn `web_push_enabled = true` ✅
   - **Signal**: Wenn `signal_enabled = true` UND `signal_phone_number` gesetzt ✅
3. Signal-Nachricht wird vom **Teamleiter/Admin Signal-Account** gesendet
4. Mitarbeiter empfängt Nachricht von seinem Teamleiter

### Sicherheit

- Nur Teamleiter/Admin können Signal-Accounts verknüpfen
- Telefonnummern sind privat und nur für Benachrichtigungen
- Geräte-Kopplung bleibt bestehen (kein automatisches Unlink)

## Troubleshooting

### Signal-CLI Container startet nicht
```bash
docker-compose logs signal-cli
```

### QR-Code wird nicht angezeigt
- Backend-Logs prüfen
- Signal-CLI API erreichbar? `curl http://localhost:8080/v1/about`

### Benachrichtigungen kommen nicht an
- Signal-Account des Teamleiters gelinkt?
- Mitarbeiter hat korrekte Telefonnummer eingetragen?
- Backend-Logs für Fehlermeldungen prüfen

## Dependencies

**Backend:**
- `axios` - HTTP Client für Signal-CLI API
- `qrcode` - QR-Code Generierung

**Docker:**
- `bbernhard/signal-cli-rest-api:latest`
