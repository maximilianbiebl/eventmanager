# Event Manager - Kirchliche Freizeiten

Eine vollständige Aufgabenverwaltungs-App für kirchliche Freizeiten und Events, optimiert für Synology NAS.

## Features

### Für Administratoren:
- **Veranstaltungen verwalten**: Events mit mehreren Durchführungen anlegen
- **Aufgaben erstellen**: Tagesweise Aufgaben mit Zeitangaben definieren
- **Programm planen**: Programmablauf für jeden Tag festlegen
- **Mitarbeiter verwalten**: Team-Mitglieder anlegen und zuweisen
- **Aufgaben zuordnen**: Aufgaben an Mitarbeiter verteilen (auch mehrere pro Aufgabe)
- **Übersicht**: Status aller Aufgaben einsehen

### Für Mitarbeiter:
- **Aufgabenübersicht**: Eigene Aufgaben tagesweise oder nach Event sortiert
- **Programm einsehen**: Vollständigen Programmablauf ansehen
- **Aufgaben abhaken**: Erledigte Aufgaben markieren
- **Push-Benachrichtigungen**: Automatische Erinnerung 15 Min. vor Aufgaben
- **Offline-Fähig**: Als Progressive Web App (PWA) installierbar

## Technologie-Stack

- **Frontend**: React + TypeScript + Vite
- **Backend**: Node.js + Express + TypeScript
- **Datenbank**: PostgreSQL
- **Benachrichtigungen**: Web Push Notifications
- **Deployment**: Docker + Docker Compose

## Installation auf Synology NAS

### Voraussetzungen
- Synology NAS mit DSM 7.0 oder höher
- Docker und Docker Compose installiert (über Paket-Zentrum)
- SSH-Zugriff auf die NAS

### Schritt 1: Repository klonen

```bash
# SSH-Verbindung zur NAS
ssh admin@your-nas-ip

# In gewünschtes Verzeichnis wechseln (z.B. /volume1/docker)
cd /volume1/docker

# Repository klonen
git clone <your-repo-url> eventmanager
cd eventmanager
```

### Schritt 2: Konfiguration anpassen

```bash
# Kopiere die Beispiel-Konfiguration
cp config.json config.production.json

# Bearbeite die Konfiguration
nano config.production.json
```

Wichtige Einstellungen:
- **Ports**: Standardmäßig Frontend:3000, Backend:3001, DB:5432
- **Datenbank-Passwort**: Ändere `database.password`
- **JWT-Secret**: Ändere `jwt.secret` zu einem langen, zufälligen String

### Schritt 3: VAPID Keys generieren

Für Web Push Notifications benötigst du VAPID Keys:

```bash
# Im Backend-Verzeichnis
cd backend
npm install
npx web-push generate-vapid-keys
```

Kopiere die generierten Keys in `config.production.json` unter `vapid`.

### Schritt 4: Docker starten

```bash
# Zurück zum Hauptverzeichnis
cd /volume1/docker/eventmanager

# Umgebungsvariablen setzen
export CONFIG_PATH=/app/config.production.json
export DB_PASSWORD=your_secure_password

# Docker Container bauen und starten
docker-compose up -d
```

### Schritt 5: Datenbank initialisieren

```bash
# Migrations ausführen
docker-compose exec backend npm run migrate
```

### Schritt 6: Admin-Benutzer erstellen

```bash
# In Backend Container einloggen
docker-compose exec backend sh

# Node REPL starten
node

# Admin-Benutzer erstellen (im Node REPL)
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',
  database: 'eventmanager',
  user: 'eventmanager',
  password: 'your_secure_password',
});

bcrypt.hash('admin123', 10).then(hash => {
  pool.query(
    'INSERT INTO users (name, password_hash, role) VALUES ($1, $2, $3)',
    ['admin', hash, 'admin']
  ).then(() => {
    console.log('Admin created!');
    process.exit(0);
  });
});
```

### Schritt 7: App öffnen

Öffne deinen Browser und navigiere zu:
```
http://your-nas-ip:3000
```

Login mit:
- **Benutzername**: admin
- **Passwort**: admin123

**WICHTIG**: Ändere das Admin-Passwort nach dem ersten Login!

## Port-Konfiguration

Alle Ports werden zentral in `config.json` verwaltet:

```json
{
  "ports": {
    "frontend": 3000,
    "backend": 3001,
    "database": 5432
  }
}
```

Um andere Ports zu verwenden:
1. Bearbeite `config.json` oder `config.production.json`
2. Aktualisiere auch `docker-compose.yml` entsprechend
3. Starte die Container neu: `docker-compose restart`

## Verwendung

### Admin-Funktionen

#### 1. Veranstaltung erstellen
1. Klicke auf "+ Neue Veranstaltung"
2. Gebe Name, Beschreibung, Startdatum ein
3. Wähle Anzahl Tage (z.B. 4 für 4-tägiges Camp)
4. Wähle Anzahl Durchführungen (z.B. 3 für 3x hintereinander)
5. System erstellt automatisch 3 Instanzen mit aufeinanderfolgenden Daten

#### 2. Aufgaben erstellen
1. Öffne Event-Details
2. Klicke "+ Neue Aufgabe"
3. Gebe Titel, Tag und optional Zeit ein
4. Aufgabe ist nun für alle Instanzen verfügbar

#### 3. Mitarbeiter zuweisen
1. Erstelle Mitarbeiter unter "Mitarbeiter"-Tab
2. In Event-Details: Wähle Durchführung
3. Bei Aufgabe auf "Zuweisen" klicken
4. Mitarbeiter-IDs eingeben (kommagetrennt)

#### 4. Status überwachen
- In Event-Details siehst du alle Aufgaben
- Erledigte Aufgaben werden markiert
- Pro Durchführung separate Übersicht

### Mitarbeiter-Funktionen

#### 1. Aufgaben ansehen
- Nach Login siehst du automatisch deine Aufgaben
- Sortierung: Nach Tag oder nach Event
- Mit Zeitangaben und Event-Details

#### 2. Benachrichtigungen aktivieren
1. Klicke auf "Benachrichtigungen aktivieren"
2. Erlaube Browser-Benachrichtigungen
3. Du wirst nun 15 Min. vor Aufgaben benachrichtigt

#### 3. Aufgaben erledigen
- Klicke "Als erledigt markieren"
- Admin sieht den Status sofort
- Erledigte Aufgaben werden ausgegraut

## Updates

```bash
cd /volume1/docker/eventmanager
git pull
docker-compose down
docker-compose build
docker-compose up -d
```

## Backup

### Datenbank sichern
```bash
docker-compose exec postgres pg_dump -U eventmanager eventmanager > backup.sql
```

### Datenbank wiederherstellen
```bash
cat backup.sql | docker-compose exec -T postgres psql -U eventmanager eventmanager
```

## Troubleshooting

### Container starten nicht
```bash
# Logs anschauen
docker-compose logs -f

# Einzelne Container prüfen
docker-compose ps
```

### Datenbank-Verbindungsfehler
- Prüfe ob PostgreSQL Container läuft: `docker-compose ps`
- Prüfe Passwort in config.json
- Warte 10-20 Sekunden nach Start für DB-Initialisierung

### Push-Benachrichtigungen funktionieren nicht
- VAPID Keys korrekt in config.json?
- HTTPS erforderlich für Production (außer localhost)
- Browser-Berechtigungen erteilt?

### Port bereits belegt
- Ändere Ports in config.json
- Aktualisiere docker-compose.yml
- `docker-compose restart`

## Entwicklung

### Lokale Entwicklung

```bash
# Backend
cd backend
npm install
npm run dev

# Frontend
cd frontend
npm install
npm run dev
```

### VAPID Keys für Entwicklung generieren

```bash
cd backend
npm install
npx web-push generate-vapid-keys
```

## Sicherheit

### Produktions-Checkliste
- [ ] config.json Passwörter ändern
- [ ] JWT Secret ändern (lange, zufällige Zeichenkette)
- [ ] VAPID Keys neu generieren
- [ ] Admin-Passwort nach erstem Login ändern
- [ ] Firewall-Regeln für Ports einrichten
- [ ] Regelmäßige Backups einrichten
- [ ] HTTPS mit Reverse Proxy (z.B. nginx)

## Lizenz

MIT

## Support

Bei Fragen oder Problemen öffne ein Issue im Repository.
