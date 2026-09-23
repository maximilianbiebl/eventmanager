#!/bin/bash
#
# Offene Migrationen zeigen und nach Rueckfrage ausfuehren.
#
# Der Server holt offene Migrationen beim Start von selbst nach. Dieses
# Skript ist fuer den Fall, dass man vorher sehen will, was passiert -
# oder nachsehen, ob wirklich alles durch ist.
#
#   ./migrieren.sh            zeigen, fragen, ausfuehren
#   ./migrieren.sh --liste    nur zeigen, nichts aendern
#   ./migrieren.sh --ja       ohne Rueckfrage (fuer Skripte)
#

set -e

cd "$(dirname "$0")"

if ! docker-compose ps backend | grep -q "Up"; then
  echo "Der Backend-Container laeuft nicht."
  echo "Zuerst starten mit:  docker-compose up -d backend"
  exit 1
fi

# Ohne -T, damit die Rueckfrage ein Terminal hat.
docker-compose exec backend npm run --silent migrationen:prod -- "$@"
