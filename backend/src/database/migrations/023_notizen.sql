-- Migration: Notizen fuer Veranstaltung, Aufgabengruppe und Aufgabe
-- Wiederholbar: ja
--
-- Kurze Zurufe fuer die Leitung: "Filter der Maschine ist hin", "Schluessel
-- liegt beim Hausmeister". Sie stehen NUR in der Verwaltung; im
-- Mitarbeiterbereich tauchen sie nirgends auf. Deshalb auch bewusst kein
-- zweites Beschreibungsfeld - die Beschreibung sehen die Eingeteilten.
--
-- Getrennte Spalte statt Anhaengsel an description: nur so laesst sich die
-- Notiz aus den Abfragen des Mitarbeiterbereichs heraushalten und beim
-- Kopieren gezielt weglassen.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/023_notizen.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:023:prod
--
--   Lokal mit ts-node:  npm run migrate:023

ALTER TABLE events        ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE program_items ADD COLUMN IF NOT EXISTS note TEXT;
ALTER TABLE tasks         ADD COLUMN IF NOT EXISTS note TEXT;

COMMENT ON COLUMN events.note IS
  'Interne Notiz der Leitung. Nur in der Verwaltung sichtbar, nie im Mitarbeiterbereich.';
COMMENT ON COLUMN program_items.note IS
  'Interne Notiz der Leitung. Nur in der Verwaltung sichtbar.';
COMMENT ON COLUMN tasks.note IS
  'Interne Notiz der Leitung. Nur in der Verwaltung sichtbar.';
