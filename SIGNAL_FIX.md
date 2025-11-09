# Fix für Signal Settings 500 Error

## Problem

Beim Aufruf von `/api/signal/settings` tritt ein 500 Internal Server Error auf:
```
Status Code: 500 Internal Server Error
```

Außerdem scheint das Einstellungsmenü für Teamleiter/Admins zur Signal-Kopplung zu fehlen.

## Ursache

Die Datenbank-Migration für Signal-Benachrichtigungen (Migration 011) wurde noch nicht ausgeführt. Dadurch fehlen folgende Spalten in der `users` Tabelle:
- `signal_enabled`
- `signal_phone_number`
- `web_push_enabled`
- `signal_account_number`
- `signal_device_id`
- `signal_linked`
- `signal_linked_at`

Wenn die Backend-API versucht, diese Spalten abzufragen, schlägt die SQL-Query fehl und gibt einen 500-Fehler zurück.

## Hinweis zum UI

Das Einstellungsmenü für Teamleiter/Admins **existiert bereits**!

In der `StaffSettings` Komponente gibt es zwei Tabs:
1. ⚙️ **Allgemein** - Normale Einstellungen für alle Benutzer
2. 💬 **Signal Setup** - Nur für Teamleiter/Admin sichtbar

Das Problem ist, dass durch den API-Fehler die Einstellungen nicht geladen werden können und somit die Anzeige fehlschlägt.

## Lösung

### Schritt 1: Migration ausführen

Führen Sie die Datenbank-Migration aus, um die fehlenden Spalten hinzuzufügen:

```bash
cd backend
npm run migrate:011
```

Das Script wird folgendes ausführen:
- Fügt `signal_enabled`, `signal_phone_number`, `web_push_enabled` zur `users` Tabelle hinzu
- Fügt `signal_account_number`, `signal_device_id`, `signal_linked`, `signal_linked_at` hinzu

### Schritt 2: Backend neu starten (falls läuft)

Wenn das Backend bereits läuft, starten Sie es neu:

```bash
# Development
npm run dev

# Production (mit Docker)
docker-compose restart backend
```

### Schritt 3: Testen

1. Melden Sie sich als **Teamleiter** oder **Admin** an
2. Öffnen Sie die **Einstellungen** (Zahnrad-Icon)
3. Sie sollten jetzt **zwei Tabs** sehen:
   - ⚙️ Allgemein
   - 💬 Signal Setup
4. Klicken Sie auf den **"Signal Setup"** Tab
5. Sie können nun Ihren Signal-Account einrichten:
   - Klicken Sie auf "🔗 Signal einrichten"
   - Scannen Sie den QR-Code mit Signal auf Ihrem Handy
   - Das System erkennt automatisch, wenn die Verbindung hergestellt wurde

## Erwartetes Verhalten nach dem Fix

### Für alle Benutzer (Staff, Teamleiter, Admin):
- Können in den Einstellungen Signal-Benachrichtigungen aktivieren
- Können ihre Telefonnummer für Signal-Benachrichtigungen hinterlegen
- Können Web-Push-Benachrichtigungen ein-/ausschalten

### Zusätzlich für Teamleiter/Admin:
- Tab "Signal Setup" ist sichtbar
- Können ihren Signal-Account via QR-Code verknüpfen
- Können Test-Nachrichten an Telefonnummern senden
- Können die Verbindung trennen und neu verbinden

## Technische Details

### Backend-Endpoint `/api/signal/settings`

**GET Request** (Zeile 180-202 in `backend/src/routes/signal.ts`):
```typescript
SELECT signal_enabled, signal_phone_number, web_push_enabled
FROM users
WHERE id = $1
```

**PUT Request** (Zeile 151-175):
```typescript
UPDATE users
SET signal_enabled = $1,
    signal_phone_number = $2,
    web_push_enabled = $3
WHERE id = $4
```

### Frontend-Komponenten

1. **StaffSettings.tsx** (Hauptkomponente)
   - Zeigt Tabs für Teamleiter/Admin (Zeile 137-154)
   - Lädt Signal-Einstellungen beim Start (Zeile 46-48)

2. **SignalSetup.tsx** (Signal-Einrichtung für Teamleiter/Admin)
   - QR-Code Anzeige
   - Status-Überprüfung
   - Test-Nachrichten
   - Verbindung trennen

3. **NotificationSettings.tsx** (Benachrichtigungseinstellungen für alle)
   - Signal aktivieren/deaktivieren
   - Telefonnummer eingeben
   - Web-Push ein-/ausschalten

## Überprüfung ob Migration erfolgreich war

Verbinden Sie sich mit der PostgreSQL-Datenbank:

```bash
# Docker
docker exec -it eventmanager-db psql -U eventmanager -d eventmanager

# Lokal
psql -U eventmanager -d eventmanager
```

Prüfen Sie die Spalten:
```sql
\d users

-- Oder spezifischer:
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users'
  AND column_name LIKE 'signal%'
   OR column_name = 'web_push_enabled';
```

Erwartete Ausgabe:
```
         column_name        |     data_type
----------------------------+-------------------
 signal_enabled             | boolean
 signal_phone_number        | character varying
 web_push_enabled           | boolean
 signal_account_number      | character varying
 signal_device_id           | character varying
 signal_linked              | boolean
 signal_linked_at           | timestamp without time zone
```

## Troubleshooting

### Problem: Migration schlägt fehl

**Fehler:** "relation does not exist" oder ähnlich

**Lösung:** Stellen Sie sicher, dass die Hauptmigration zuerst ausgeführt wurde:
```bash
npm run migrate
```

### Problem: 500 Error bleibt bestehen

1. Überprüfen Sie die Backend-Logs:
   ```bash
   docker-compose logs backend
   ```

2. Prüfen Sie die Datenbankverbindung:
   ```bash
   docker-compose ps
   ```

3. Stellen Sie sicher, dass das Backend die richtige Datenbank verwendet:
   - Überprüfen Sie `config.json` oder Umgebungsvariablen
   - `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`

### Problem: Signal Setup Tab wird nicht angezeigt

1. Überprüfen Sie Ihre Benutzerrolle:
   - Nur `teamleiter` oder `admin` sehen diesen Tab
   - `staff` Benutzer sehen nur den "Allgemein" Tab

2. Überprüfen Sie die Browser-Konsole auf JavaScript-Fehler

## Weitere Informationen

- Migration-Datei: `backend/src/database/migrations/011_add_signal_notifications.sql`
- API-Routen: `backend/src/routes/signal.ts`
- Frontend-API: `frontend/src/api/signal.ts`
- Hauptkomponente: `frontend/src/components/StaffSettings.tsx`
- Signal-Setup UI: `frontend/src/components/settings/SignalSetup.tsx`
