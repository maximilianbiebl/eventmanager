#!/bin/bash
#
# Signal-Dienst (signal-cli) aktualisieren - mit Pruefung und Rueckfall.
#
# Signal laesst veraltete Programme nach einigen Monaten nicht mehr zu; dann
# klappen Koppeln und Versand nicht mehr. "docker-compose build" erneuert
# den Signal-Dienst NICHT (er ist ein fertiges Abbild von Docker Hub,
# bbernhard/signal-cli-rest-api) - das tut nur "docker-compose pull".
#
# Ablauf:
#   1. Laeuft gerade eine Veranstaltung, wird nichts angefasst - mitten in
#      der Freizeit soll kein Update etwas kaputt machen. (--jetzt erzwingt.)
#   2. Neue Fassung holen. Docker prueft dabei die Pruefsummen jeder Schicht;
#      eine beschaedigte oder veraenderte Datei wird nicht angenommen.
#      Ist es dieselbe Fassung wie bisher: fertig.
#   3. Die bisherige Fassung als Sicherung aufheben, dann neu starten.
#   4. Pruefen: antwortet der Dienst? Sind alle vorher gekoppelten Konten
#      noch da?
#   5. Wenn nicht: zurueck zur gesicherten Fassung, Fehler melden.
#
# Aufruf:  ./signal-update.sh            normal (fuer den Zeitplan)
#          ./signal-update.sh --jetzt    auch waehrend einer Veranstaltung
#
# Rueckgabe: 0 = alles gut (aktualisiert, schon aktuell oder bewusst
# uebersprungen), 1 = Problem - siehe signal-update.log.
#
# Einrichten auf der Synology: siehe README, "Signal-Dienst aktuell halten".

set -u
cd "$(dirname "$0")"

# Im Zeitplan der Synology fehlen diese Pfade sonst.
export PATH="$PATH:/usr/local/bin:/usr/bin:/bin"

LOG="signal-update.log"
BILD="bbernhard/signal-cli-rest-api:latest"
SICHERUNG="eventmanager/signal-cli:vorher"

# Port wie in docker-compose.yml (aus .env, sonst 8080)
SIGNAL_PORT=8080
if [ -f .env ]; then
  WERT=$(grep -E '^SIGNAL_PORT=' .env | tail -1 | cut -d= -f2 | tr -d '"'"'"' ')
  [ -n "${WERT:-}" ] && SIGNAL_PORT="$WERT"
fi
API="http://localhost:${SIGNAL_PORT}"

if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

JETZT=0
[ "${1:-}" = "--jetzt" ] && JETZT=1

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# Telefonnummern aus der Antwort von /v1/accounts - ohne jq, das fehlt oft.
nummern() { grep -o '"+[0-9]*"' | tr -d '"' | sort; }

bild_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null; }

# Antwortet der Dienst - und sind alle Konten aus $1 (eine Nummer je Zeile) da?
pruefe() {
  local erwartet="$1" i about konten fehlt
  for i in $(seq 1 36); do              # bis zu 3 Minuten - der Start dauert
    about=$(curl -fsS --max-time 10 "$API/v1/about" 2>/dev/null) && break
    sleep "${PRUEF_PAUSE:-5}"
  done
  if [ -z "${about:-}" ]; then
    log "Pruefung: Dienst antwortet nicht."
    return 1
  fi
  log "Pruefung: Dienst antwortet - $(echo "$about" | grep -o '"version":"[^"]*"' | head -1)"

  konten=$(curl -fsS --max-time 90 "$API/v1/accounts" 2>/dev/null | nummern) || konten=""
  fehlt=$(comm -23 <(echo "$erwartet" | sed '/^$/d') <(echo "$konten" | sed '/^$/d'))
  if [ -n "$fehlt" ]; then
    log "Pruefung: Kopplung(en) fehlen nach dem Update: $(echo $fehlt)"
    return 1
  fi
  log "Pruefung: alle $(echo "$erwartet" | sed '/^$/d' | wc -l | tr -d ' ') gekoppelten Konten vorhanden."
  return 0
}

# --- 1. Laeuft gerade eine Veranstaltung? -----------------------------------
LAUFEND=$($DC exec -T postgres psql -U eventmanager -d eventmanager -tAc \
  "SELECT count(*) FROM events WHERE is_template = false AND start_date IS NOT NULL
     AND start_date <= CURRENT_DATE AND start_date + days > CURRENT_DATE" 2>/dev/null | tr -d '[:space:]')
if [ -z "$LAUFEND" ]; then
  log "Datenbank nicht erreichbar - Update uebersprungen."
  exit 1
fi
if [ "$LAUFEND" != "0" ] && [ "$JETZT" = "0" ]; then
  log "Es laeuft gerade eine Veranstaltung - Update uebersprungen (mit --jetzt erzwingen)."
  exit 0
fi

# --- 2. Neue Fassung holen ---------------------------------------------------
ALT=$(bild_id "$BILD")
KONTEN_VORHER=$(curl -fsS --max-time 90 "$API/v1/accounts" 2>/dev/null | nummern)

if ! $DC pull signal-cli >>"$LOG" 2>&1; then
  log "Herunterladen fehlgeschlagen - nichts geaendert."
  exit 1
fi
NEU=$(bild_id "$BILD")

if [ -n "$ALT" ] && [ "$ALT" = "$NEU" ]; then
  log "Signal-Dienst ist aktuell."
  exit 0
fi

# --- 3. Sichern und neu starten ---------------------------------------------
[ -n "$ALT" ] && docker image tag "$ALT" "$SICHERUNG"
log "Neue Fassung ${NEU:7:12} (bisher ${ALT:7:12}) - starte neu."
$DC up -d signal-cli >>"$LOG" 2>&1

# --- 4. Pruefen -------------------------------------------------------------
if pruefe "$KONTEN_VORHER"; then
  log "Update erfolgreich."
  exit 0
fi

# --- 5. Rueckfall -----------------------------------------------------------
if [ -z "$ALT" ]; then
  log "FEHLER: neue Fassung funktioniert nicht, und es gibt keine alte zum Zurueckgehen."
  exit 1
fi
log "FEHLER: neue Fassung besteht die Pruefung nicht - zurueck zur bisherigen."
docker image tag "$SICHERUNG" "$BILD"
$DC up -d --force-recreate signal-cli >>"$LOG" 2>&1
if pruefe "$KONTEN_VORHER"; then
  log "Bisherige Fassung laeuft wieder. Update beim naechsten Mal erneut versuchen."
else
  log "FEHLER: auch die bisherige Fassung antwortet nicht - bitte von Hand nachsehen."
fi
exit 1
