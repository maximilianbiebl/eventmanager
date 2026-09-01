-- Migration: Zeitpunkt der letzten Statusaenderung festhalten
--
-- Hintergrund: Aufgaben lassen sich seit dem Offline-Betrieb ohne Netz
-- umstellen. Die Aenderung geht erst spaeter raus - moeglicherweise Stunden
-- spaeter. Ohne Zeitstempel gewinnt dann der zuletzt ANKOMMENDE Stand, nicht
-- der zuletzt GEWOLLTE: wer morgens offline "In Arbeit" setzt und mittags
-- wieder Empfang hat, ueberschreibt damit ein "Erledigt", das jemand anders
-- um elf gesetzt hat.
--
-- Mit diesem Feld kann der Server eine verspaetete Aenderung erkennen und
-- verwerfen, statt den neueren Stand zu ueberschreiben.
--
-- Bestehende Zeilen bekommen den Zeitpunkt der letzten Aenderung nicht
-- rueckwirkend - NULL heisst "unbekannt" und wird als "aelter als alles"
-- behandelt, sodass die erste echte Aenderung immer durchgeht.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/017_status_changed_at.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:017:prod
--
--   Lokal mit ts-node:  npm run migrate:017

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMP;

COMMENT ON COLUMN tasks.status_changed_at IS
  'Zeitpunkt der letzten Statusaenderung. Dient dem Erkennen verspaeteter Offline-Aenderungen; NULL = unbekannt.';

CREATE INDEX IF NOT EXISTS idx_tasks_status_changed_at ON tasks (status_changed_at);
