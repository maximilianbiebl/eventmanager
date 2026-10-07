#!/bin/bash
#
# Signal-Dienst (signal-cli) aktualisieren - mit Pruefung und Rueckfall.
#
# Signal laesst veraltete Programme nach einigen Monaten nicht mehr zu; dann
# klappen Koppeln und Versand nicht mehr. "docker-compose build" erneuert
# den Signal-Dienst NICHT (er ist ein fertiges Abbild von Docker Hub,
# bbernhard/signal-cli-rest-api) - das tut nur "docker-compose pull".
#
# Ablauf eines Updates:
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
# Aufruf:  ./signal-update.sh --einrichten   Zeitplan einrichten oder aendern
#          ./signal-update.sh --status       Zeitplan, naechster Lauf, letzte Ergebnisse
#          ./signal-update.sh                jetzt aktualisieren
#          ./signal-update.sh --jetzt        jetzt, auch waehrend einer Veranstaltung
#
# Nach Zeitplan laeuft das Skript im Dienst "signal-updater"
# (docker-compose.yml, Ordner signal-updater/).
#
# Rueckgabe: 0 = alles gut (aktualisiert, schon aktuell oder bewusst
# uebersprungen), 1 = Problem - siehe signal-update.log.

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
# Im Update-Dienst wird signal-cli ueber das Docker-Netz erreicht.
API="${SIGNAL_API:-http://localhost:${SIGNAL_PORT}}"

if docker compose version >/dev/null 2>&1; then DC="docker compose"; else DC="docker-compose"; fi

JETZT=0
[ "${1:-}" = "--jetzt" ] && JETZT=1

KONF="signal-update.conf"
TAGNAMEN=(Sonntag Montag Dienstag Mittwoch Donnerstag Freitag Samstag)

lies_konf() {
  AKTIV=ja; TAG=1; UHRZEIT=04:30; WAEHREND_VERANSTALTUNG=nein; EINGERICHTET=0
  if [ -f "$KONF" ]; then
    # shellcheck disable=SC1090
    . "./$KONF"; EINGERICHTET=1
  fi
}

plan_text() {
  if [ "$AKTIV" != "ja" ]; then echo "ausgeschaltet"; return; fi
  local wann
  if [ "$TAG" = "*" ]; then wann="täglich"; else wann="jeden ${TAGNAMEN[$TAG]}"; fi
  echo "$wann um $UHRZEIT Uhr$([ "$WAEHREND_VERANSTALTUNG" = "ja" ] && echo ", auch während Veranstaltungen" || echo ", nicht während Veranstaltungen")"
}

# Naechster Termin nach dem Plan, als lesbarer Text.
naechster_lauf() {
  [ "$AKTIV" = "ja" ] || return
  local i t
  for i in $(seq 0 7); do
    t=$(date -d "today +$i day $UHRZEIT" +%s 2>/dev/null) || return
    [ "$t" -le "$(date +%s)" ] && continue
    if [ "$TAG" = "*" ] || [ "$(date -d "@$t" +%w)" = "$TAG" ]; then
      echo "${TAGNAMEN[$(date -d "@$t" +%w)]}, $(date -d "@$t" '+%d.%m.%Y um %H:%M') Uhr"
      return
    fi
  done
}

dienst_laeuft() { docker ps --filter name=eventmanager-signal-updater --filter status=running -q 2>/dev/null | grep -q .; }

zeige_status() {
  lies_konf
  echo "Automatische Signal-Updates"
  echo "  Zeitplan:        $(plan_text)$([ "$EINGERICHTET" = 0 ] && echo "  (Standard - noch nicht eingerichtet)")"
  if dienst_laeuft; then
    echo "  Update-Dienst:   läuft"
    local n; n=$(naechster_lauf); [ -n "$n" ] && echo "  Nächster Lauf:   $n"
  else
    echo "  Update-Dienst:   läuft NICHT - einrichten mit: ./signal-update.sh --einrichten"
  fi
  if [ -f "$LOG" ]; then
    echo
    echo "Letzte Ergebnisse (aus $LOG):"
    grep -E "Update erfolgreich|ist aktuell|uebersprungen|FEHLER|fehlgeschlagen" "$LOG" | tail -5 | sed 's/^/  /'
  fi
}

# Frage mit Vorgabe; Enter uebernimmt die Vorgabe.
frage() { local antwort; read -r -p "$1 [$2]: " antwort; echo "${antwort:-$2}"; }

einrichten() {
  if [ ! -t 0 ]; then echo "Der Assistent braucht ein Terminal."; exit 1; fi
  lies_konf
  echo "Automatische Signal-Updates einrichten"
  echo "--------------------------------------"
  if [ "$EINGERICHTET" = 1 ]; then echo "Bisher: $(plan_text)"; else echo "Noch nicht eingerichtet."; fi
  echo "Enter übernimmt den Wert in Klammern."
  echo

  local ja_nein
  ja_nein=$(frage "Signal automatisch aktuell halten? (j/n)" "$([ "$AKTIV" = "ja" ] && echo j || echo n)")
  case "$ja_nein" in [nN]*) AKTIV=nein ;; *) AKTIV=ja ;; esac

  if [ "$AKTIV" = "ja" ]; then
    echo
    echo "Wie oft? Einmal pro Woche reicht: signal-cli erscheint etwa monatlich neu,"
    echo "und Signal sperrt alte Fassungen erst nach Monaten."
    echo "  1 Montag  2 Dienstag  3 Mittwoch  4 Donnerstag  5 Freitag  6 Samstag  7 Sonntag"
    echo "  t täglich"
    local vorgabe wahl
    if [ "$TAG" = "*" ]; then vorgabe=t; elif [ "$TAG" = 0 ]; then vorgabe=7; else vorgabe=$TAG; fi
    while true; do
      wahl=$(frage "Tag" "$vorgabe")
      case "$wahl" in
        [tT]*) TAG='*'; break ;;
        [1-6]) TAG=$wahl; break ;;
        7) TAG=0; break ;;
        *) echo "  Bitte 1-7 oder t." ;;
      esac
    done
    while true; do
      wahl=$(frage "Uhrzeit (HH:MM) - am besten nachts" "$UHRZEIT")
      if [[ "$wahl" =~ ^([01]?[0-9]|2[0-3]):([0-5][0-9])$ ]]; then
        UHRZEIT=$(printf '%02d:%s' "$((10#${BASH_REMATCH[1]}))" "${BASH_REMATCH[2]}"); break
      fi
      echo "  Bitte als Uhrzeit, z. B. 04:30."
    done
    echo
    echo "Während einer laufenden Veranstaltung wird normalerweise nicht aktualisiert -"
    echo "damit mitten in der Freizeit nichts kaputtgehen kann."
    ja_nein=$(frage "Trotzdem auch während Veranstaltungen aktualisieren? (j/n)" "$([ "$WAEHREND_VERANSTALTUNG" = "ja" ] && echo j || echo n)")
    case "$ja_nein" in [jJ]*) WAEHREND_VERANSTALTUNG=ja ;; *) WAEHREND_VERANSTALTUNG=nein ;; esac
  fi

  cat > "$KONF" <<KONFIG
# Zeitplan fuer automatische Signal-Updates.
# Geschrieben von ./signal-update.sh --einrichten - am besten dort aendern.
AKTIV=$AKTIV
TAG='$TAG'        # 0=So, 1=Mo ... 6=Sa, * = taeglich
UHRZEIT=$UHRZEIT
WAEHREND_VERANSTALTUNG=$WAEHREND_VERANSTALTUNG
KONFIG

  echo
  echo "Gespeichert: $(plan_text)"
  echo "Update-Dienst wird gestartet bzw. neu gestartet ..."
  if ! $DC up -d --build signal-updater >>"$LOG" 2>&1 || ! $DC restart signal-updater >>"$LOG" 2>&1; then
    echo "FEHLER: Der Update-Dienst liess sich nicht starten - Details in $LOG."
    echo "Laufen die anderen Dienste? (docker-compose up -d)"
    exit 1
  fi
  sleep 2
  if ! dienst_laeuft; then
    echo "FEHLER: Der Update-Dienst laeuft nicht. Ausgabe:"
    docker logs --tail 20 eventmanager-signal-updater 2>&1 | sed 's/^/  /'
    exit 1
  fi
  echo "Fertig."
  [ "$AKTIV" = "ja" ] && echo "Nächster Lauf: $(naechster_lauf)"
  echo

  if [ "$AKTIV" = "ja" ]; then
    ja_nein=$(frage "Jetzt einmal prüfen, ob ein Update da ist? (j/n)" "n")
    case "$ja_nein" in
      [jJ]*) echo; $DC exec -T signal-updater signal-update-lauf ;;
    esac
  fi
  echo
  echo "Ändern: nochmal ./signal-update.sh --einrichten  ·  Stand: ./signal-update.sh --status"
}

case "${1:-}" in
  --einrichten|--aendern) einrichten; exit 0 ;;
  --status) zeige_status; exit 0 ;;
esac

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') $*" | tee -a "$LOG"; }

# Telefonnummern aus der Antwort von /v1/accounts - ohne jq, das fehlt oft.
nummern() { grep -o '"+[0-9]*"' | tr -d '"' | sort; }

bild_id() { docker image inspect -f '{{.Id}}' "$1" 2>/dev/null; }

# signal-cli mit der aktuell markierten Fassung neu anlegen.
#
# Erst stoppen und entfernen, dann neu anlegen - nicht "up" allein. Das
# benennt den alten Container waehrend des Austauschs kurz in
# "<id>_eventmanager-signal" um, und die Synology (Container Manager) zeigte
# danach noch diesen Namen, mit "No such container" beim Oeffnen. Die
# Unterbrechung ist dieselbe; die Daten liegen im Volume signal_data.
neu_anlegen() {
  $DC stop signal-cli >>"$LOG" 2>&1
  $DC rm -f signal-cli >>"$LOG" 2>&1
  $DC up -d --no-deps signal-cli >>"$LOG" 2>&1
}

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
neu_anlegen

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
neu_anlegen
if pruefe "$KONTEN_VORHER"; then
  log "Bisherige Fassung laeuft wieder. Update beim naechsten Mal erneut versuchen."
else
  log "FEHLER: auch die bisherige Fassung antwortet nicht - bitte von Hand nachsehen."
fi
exit 1
