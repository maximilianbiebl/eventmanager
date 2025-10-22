# Architektur-Übersicht

## Projektstruktur

```
eventmanager/
├── backend/                  # Node.js + Express Backend
│   ├── src/
│   │   ├── config/          # Konfiguration laden
│   │   ├── database/        # DB-Verbindung und Migrations
│   │   ├── middleware/      # Auth-Middleware
│   │   ├── routes/          # API-Endpunkte
│   │   │   ├── auth.ts      # Login, Register
│   │   │   ├── events.ts    # Veranstaltungen
│   │   │   ├── tasks.ts     # Aufgaben
│   │   │   ├── program.ts   # Programmpunkte
│   │   │   ├── users.ts     # Benutzerverwaltung
│   │   │   └── notifications.ts  # Push-Benachrichtigungen
│   │   ├── services/
│   │   │   └── notificationScheduler.ts  # Cron-Job für Reminder
│   │   ├── types/           # TypeScript Interfaces
│   │   └── index.ts         # App-Einstiegspunkt
│   ├── package.json
│   ├── tsconfig.json
│   └── Dockerfile
│
├── frontend/                # React + TypeScript Frontend
│   ├── public/
│   │   ├── manifest.json    # PWA Manifest
│   │   └── sw.js            # Service Worker für Push
│   ├── src/
│   │   ├── api/             # API-Client
│   │   │   ├── client.ts    # Axios-Konfiguration
│   │   │   ├── auth.ts
│   │   │   ├── events.ts
│   │   │   ├── tasks.ts
│   │   │   ├── users.ts
│   │   │   ├── program.ts
│   │   │   └── notifications.ts
│   │   ├── components/
│   │   │   ├── Login.tsx
│   │   │   ├── StaffDashboard.tsx
│   │   │   └── admin/       # Admin-Komponenten
│   │   │       ├── AdminDashboard.tsx
│   │   │       ├── EventsList.tsx
│   │   │       ├── EventDetail.tsx
│   │   │       ├── CreateEventModal.tsx
│   │   │       └── UsersList.tsx
│   │   ├── context/
│   │   │   └── AuthContext.tsx  # Globaler Auth-State
│   │   ├── hooks/
│   │   │   └── useNotifications.ts  # Push-Hook
│   │   ├── App.tsx          # Routing
│   │   ├── main.tsx         # App-Einstiegspunkt
│   │   └── index.css
│   ├── package.json
│   ├── tsconfig.json
│   ├── vite.config.ts
│   ├── nginx.conf           # Nginx für Production
│   └── Dockerfile
│
├── config.json              # Zentrale Konfiguration
├── docker-compose.yml       # Container-Orchestrierung
├── setup.sh                 # Setup-Script
├── .gitignore
├── .dockerignore
├── .env.example
└── README.md
```

## Datenbank-Schema

### Haupttabellen

1. **users** - Benutzer (Admin & Staff)
2. **events** - Veranstaltungen (Basis-Template)
3. **event_instances** - Konkrete Durchführungen
4. **program_items** - Programmpunkte pro Tag
5. **tasks** - Aufgaben (Template für Event)
6. **task_assignments** - Aufgaben-Zuweisungen (User + Instance)
7. **event_instance_staff** - Mitarbeiter pro Durchführung
8. **push_subscriptions** - Web Push Subscriptions
9. **notifications_log** - Benachrichtigungs-Historie

### Beziehungen

```
events (1) -> (N) event_instances
events (1) -> (N) program_items
events (1) -> (N) tasks

event_instances (1) -> (N) event_instance_staff (N) <- (1) users
event_instances (1) -> (N) task_assignments (N) <- (1) tasks
task_assignments (N) -> (1) users

users (1) -> (N) push_subscriptions
```

## API-Endpunkte

### Authentication
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Benutzer anlegen

### Events
- `GET /api/events` - Alle Events
- `GET /api/events/:id` - Event mit Details
- `POST /api/events` - Event erstellen (Admin)
- `PUT /api/events/:id` - Event aktualisieren (Admin)
- `DELETE /api/events/:id` - Event löschen (Admin)

### Tasks
- `GET /api/tasks/event/:eventId` - Aufgaben für Event
- `GET /api/tasks/my-tasks` - Eigene Aufgaben
- `GET /api/tasks/my-tasks/:instanceId` - Eigene Aufgaben für Instanz
- `POST /api/tasks` - Aufgabe erstellen (Admin)
- `POST /api/tasks/assign` - Aufgabe zuweisen (Admin)
- `PUT /api/tasks/complete/:id` - Aufgabe abhaken
- `GET /api/tasks/status/:instanceId` - Status-Übersicht (Admin)

### Program
- `GET /api/program/event/:eventId` - Programm für Event
- `POST /api/program` - Programmpunkt erstellen (Admin)
- `PUT /api/program/:id` - Programmpunkt bearbeiten (Admin)
- `DELETE /api/program/:id` - Programmpunkt löschen (Admin)

### Users
- `GET /api/users` - Alle Benutzer (Admin)
- `PUT /api/users/:id` - Benutzer bearbeiten (Admin)
- `DELETE /api/users/:id` - Benutzer löschen (Admin)
- `POST /api/users/instance/:instanceId/staff` - Mitarbeiter zuweisen
- `GET /api/users/instance/:instanceId/staff` - Mitarbeiter abrufen
- `DELETE /api/users/instance/:instanceId/staff/:userId` - Mitarbeiter entfernen

### Notifications
- `GET /api/notifications/vapid-public-key` - VAPID Key abrufen
- `POST /api/notifications/subscribe` - Push-Subscription speichern
- `POST /api/notifications/unsubscribe` - Push-Subscription entfernen
- `POST /api/notifications/test` - Test-Benachrichtigung

## Datenfluss

### Event-Erstellung (Admin)
1. Admin erstellt Event mit 3 Durchführungen
2. System legt Event an
3. System erstellt automatisch 3 event_instances mit gestaffelten Daten
4. Admin kann nun Aufgaben für das Event erstellen
5. Aufgaben werden als Template gespeichert

### Aufgaben-Zuweisung (Admin)
1. Admin wählt Event-Instanz aus
2. Admin wählt Aufgabe aus
3. Admin wählt Mitarbeiter aus (können mehrere sein)
4. System erstellt task_assignments für jede Kombination
5. Mitarbeiter sieht Aufgabe in seiner Liste

### Aufgaben-Ansicht (Staff)
1. Staff loggt sich ein
2. System lädt alle task_assignments für den User
3. Zeigt Aufgaben gruppiert nach Tag oder Event
4. Staff kann Aufgaben abhaken

### Benachrichtigungs-System
1. Service Worker registriert sich
2. Frontend fordert Push-Berechtigung an
3. Browser erstellt Push-Subscription
4. Frontend sendet Subscription an Backend
5. Backend speichert in push_subscriptions
6. Cron-Job läuft jede Minute:
   - Prüft alle laufenden Events
   - Berechnet Reminder-Zeiten
   - Sendet Push-Notifications 15 Min. vorher
   - Loggt in notifications_log

## Technologie-Entscheidungen

### Warum PostgreSQL?
- Läuft stabil auf Synology NAS
- Gute Unterstützung für komplexe Relationen
- ACID-Eigenschaften wichtig für Aufgabenstatus
- Gute Performance auch bei vielen Benutzern

### Warum React + TypeScript?
- Typsicherheit verhindert Fehler
- Gute Developer Experience
- Wiederverwendbare Komponenten
- Große Community

### Warum Docker?
- Einfaches Deployment auf Synology
- Isolierte Umgebungen
- Reproduzierbare Builds
- Einfaches Update-Management

### Warum Web Push?
- Native Push-Benachrichtigungen
- Funktioniert auch wenn Browser geschlossen
- Kein zusätzlicher Service nötig
- Standardisiert und gut unterstützt

## Skalierung

### Horizontal
- Mehrere Backend-Instanzen hinter Load Balancer
- Shared PostgreSQL-Instanz
- Redis für Session-Management

### Vertikal
- PostgreSQL Connection Pooling
- React Code-Splitting
- Caching-Layer (Redis)
- CDN für statische Assets

## Sicherheit

### Implementiert
- JWT-basierte Authentifizierung
- Bcrypt für Passwort-Hashing
- CORS-Schutz
- Input-Validierung
- SQL-Injection-Schutz (Parameterized Queries)
- Role-based Access Control (Admin/Staff)

### Empfohlen für Production
- HTTPS via Reverse Proxy
- Rate Limiting
- CSRF-Tokens
- Security Headers
- Regelmäßige Updates
- Audit Logging
