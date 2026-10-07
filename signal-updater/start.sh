#!/bin/bash
#
# Start des Update-Dienstes: Zeitplan aus /projekt/signal-update.conf lesen,
# daraus die Crontab bauen, cron laufen lassen.
#
# Der Assistent (./signal-update.sh --einrichten) schreibt die Datei und
# startet diesen Dienst neu - so wird ein geaenderter Zeitplan uebernommen.

set -u
KONF=/projekt/signal-update.conf

AKTIV=ja
TAG=1
UHRZEIT=04:30
WAEHREND_VERANSTALTUNG=nein
if [ -f "$KONF" ]; then
  # shellcheck disable=SC1090
  . "$KONF"
else
  echo "[signal-updater] Noch nicht eingerichtet - Standard: montags 04:30 Uhr. Aendern: ./signal-update.sh --einrichten"
fi

# Unter welchem Projektnamen laufen die anderen Dienste? Steht an diesem
# Container selbst - so trifft "docker compose" hier drin dieselben
# Container wie draussen, egal wie der Ordner auf der NAS heisst.
PROJEKT=$(docker inspect -f '{{ index .Config.Labels "com.docker.compose.project" }}' eventmanager-signal-updater 2>/dev/null)
if [ -z "$PROJEKT" ]; then
  echo "[signal-updater] FEHLER: Docker nicht erreichbar (fehlt /var/run/docker.sock?)."
  sleep 300
  exit 1
fi

# Ein Lauf - fuer cron und fuer "jetzt testen" aus dem Assistenten.
cat > /usr/local/bin/signal-update-lauf <<LAUF
#!/bin/bash
export COMPOSE_PROJECT_NAME="$PROJEKT"
export SIGNAL_API="http://signal-cli:8080"
export TZ="${TZ:-Europe/Berlin}"
cd /projekt
if [ "$WAEHREND_VERANSTALTUNG" = "ja" ]; then exec ./signal-update.sh --jetzt "\$@"; fi
exec ./signal-update.sh "\$@"
LAUF
chmod +x /usr/local/bin/signal-update-lauf

STUNDE=$((10#${UHRZEIT%%:*}))
MINUTE=$((10#${UHRZEIT##*:}))
if [ "$AKTIV" = "ja" ]; then
  echo "$MINUTE $STUNDE * * $TAG /usr/local/bin/signal-update-lauf > /proc/1/fd/1 2>&1" > /etc/crontabs/root
  echo "[signal-updater] Zeitplan: $([ "$TAG" = "*" ] && echo taeglich || echo "Wochentag $TAG") um $(printf '%02d:%02d' "$STUNDE" "$MINUTE") Uhr (Projekt $PROJEKT)."
else
  : > /etc/crontabs/root
  echo "[signal-updater] Automatische Updates sind ausgeschaltet."
fi

exec crond -f -l 6
