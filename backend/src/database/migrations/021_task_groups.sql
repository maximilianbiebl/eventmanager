-- Migration: Aufgabengruppen
--
-- Eine Gruppe fasst Aufgaben zusammen, die zum selben Zeitpunkt oder Anlass
-- gehoeren: "Fruehstueck" mit "Essensausgabe" und "Tische wischen", je mit
-- eigenen Leuten. In den Ansichten steht sie als Zwischenueberschrift ueber
-- ihren Aufgaben.
--
-- Dafuer wird die vorhandene Tabelle program_items benutzt statt einer
-- zweiten daneben: sie hat bereits Veranstaltung, Tag, Titel und Zeit, und
-- tasks.program_item_id zeigt schon darauf. Angelegt wurde sie nie - es gab
-- keine Oberflaeche und keine einzige Zeile darin. In der Oberflaeche heisst
-- sie jetzt "Aufgabengruppe".
--
-- Zwei Aenderungen sind dafuer noetig:
--
--   1. time wird optional. Eine reine Zwischenueberschrift ("Kueche") hat
--      keine Uhrzeit; NOT NULL haette sie erzwungen.
--   2. sort_order kommt dazu. Ohne Uhrzeit gaebe es sonst keine Reihenfolge
--      ausser der zufaelligen Vergabe der Nummern.
--
-- Beim Loeschen einer Gruppe bleiben ihre Aufgaben bestehen und stehen
-- wieder ungruppiert da - eine Gruppe ist eine Ueberschrift, kein Behaelter.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/021_task_groups.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:021:prod
--
--   Lokal mit ts-node:  npm run migrate:021

ALTER TABLE program_items ALTER COLUMN time DROP NOT NULL;
ALTER TABLE program_items ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Aufgaben ueberleben das Loeschen ihrer Gruppe: der Verweis wird geleert,
-- die Aufgabe bleibt. Ohne diese Regel verhinderte der Fremdschluessel das
-- Loeschen ueberhaupt.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_program_item_id_fkey;
ALTER TABLE tasks ADD CONSTRAINT tasks_program_item_id_fkey
  FOREIGN KEY (program_item_id) REFERENCES program_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_program_item_id ON tasks (program_item_id);

COMMENT ON TABLE program_items IS
  'Aufgabengruppen - Zwischenueberschriften ueber zusammengehoerenden Aufgaben. Zeit ist optional.';
