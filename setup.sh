#!/bin/bash

echo "==================================="
echo "Event Manager - Setup Script"
echo "==================================="
echo ""

# Farben
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Prüfe ob Docker installiert ist
if ! command -v docker &> /dev/null; then
    echo -e "${RED}Docker ist nicht installiert!${NC}"
    echo "Bitte installiere Docker und Docker Compose."
    exit 1
fi

# Prüfe ob Docker Compose installiert ist
if ! command -v docker-compose &> /dev/null; then
    echo -e "${RED}Docker Compose ist nicht installiert!${NC}"
    echo "Bitte installiere Docker Compose."
    exit 1
fi

echo -e "${GREEN}Docker und Docker Compose gefunden!${NC}"
echo ""

# Erstelle Produktions-Konfiguration falls nicht vorhanden
if [ ! -f "config.production.json" ]; then
    echo -e "${YELLOW}Erstelle config.production.json...${NC}"
    cp config.json config.production.json
    echo -e "${GREEN}Bitte bearbeite config.production.json und ändere die Passwörter!${NC}"
    echo ""
fi

# VAPID Keys generieren
echo -e "${YELLOW}Möchtest du neue VAPID Keys für Push-Benachrichtigungen generieren? (j/n)${NC}"
read -r generate_vapid

if [ "$generate_vapid" = "j" ] || [ "$generate_vapid" = "J" ]; then
    echo "Installiere web-push..."
    cd backend && npm install web-push --no-save
    echo ""
    echo -e "${GREEN}Generiere VAPID Keys:${NC}"
    npx web-push generate-vapid-keys
    echo ""
    echo -e "${YELLOW}Bitte kopiere diese Keys in config.production.json unter 'vapid'${NC}"
    cd ..
    echo ""
fi

# Docker Container bauen
echo -e "${YELLOW}Möchtest du die Docker Container jetzt bauen? (j/n)${NC}"
read -r build_docker

if [ "$build_docker" = "j" ] || [ "$build_docker" = "J" ]; then
    echo "Baue Docker Container..."
    docker-compose build
    echo ""
    echo -e "${GREEN}Container erfolgreich gebaut!${NC}"
    echo ""
fi

# Docker Container starten
echo -e "${YELLOW}Möchtest du die Container jetzt starten? (j/n)${NC}"
read -r start_docker

if [ "$start_docker" = "j" ] || [ "$start_docker" = "J" ]; then
    echo "Starte Container..."
    docker-compose up -d
    echo ""
    echo -e "${GREEN}Container gestartet!${NC}"

    echo "Warte 10 Sekunden auf Datenbankstart..."
    sleep 10

    # Datenbank migrieren
    echo "Führe Datenbank-Migration aus..."
    docker-compose exec -T backend npm run migrate
    echo ""
    echo -e "${GREEN}Datenbank initialisiert!${NC}"
    echo ""
fi

# Admin-Benutzer erstellen
echo -e "${YELLOW}Möchtest du einen Admin-Benutzer erstellen? (j/n)${NC}"
read -r create_admin

if [ "$create_admin" = "j" ] || [ "$create_admin" = "J" ]; then
    echo "Benutzername für Admin:"
    read -r admin_name
    echo "Passwort für Admin:"
    read -rs admin_password
    echo ""

    # SQL Command
    docker-compose exec -T postgres psql -U eventmanager -d eventmanager <<EOF
INSERT INTO users (name, password_hash, role)
VALUES ('$admin_name', crypt('$admin_password', gen_salt('bf')), 'admin');
EOF

    echo ""
    echo -e "${GREEN}Admin-Benutzer erstellt!${NC}"
    echo ""
fi

echo ""
echo -e "${GREEN}==================================="
echo "Setup abgeschlossen!"
echo "===================================${NC}"
echo ""
echo "Die App ist nun erreichbar unter:"
echo -e "${GREEN}http://localhost:3000${NC}"
echo ""
echo "Nächste Schritte:"
echo "1. Bearbeite config.production.json und ändere alle Passwörter"
echo "2. Starte die Container neu: docker-compose restart"
echo "3. Öffne die App im Browser"
echo ""
echo "Hilfreiche Befehle:"
echo "  docker-compose logs -f       # Logs anzeigen"
echo "  docker-compose ps            # Status anzeigen"
echo "  docker-compose down          # Container stoppen"
echo "  docker-compose up -d         # Container starten"
echo ""
