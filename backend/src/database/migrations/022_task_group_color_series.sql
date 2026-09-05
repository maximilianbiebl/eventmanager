-- Migration: Aufgabengruppen bekommen Farbe und Serie
--
-- FARBE
--   Gespeichert wird ein NAME ('gelb'), kein Hexwert. Die Oberflaeche
--   uebersetzt ihn in Farbtoken - nur so kann das dunkle Thema eigene Werte
--   setzen. Eine frei gewaehlte Farbe waere dort entweder unsichtbar oder
--   grell. NULL heisst: keine Farbe, so wie bisher.
--
--   Erlaubt sind: blau, gruen, gelb, rot, violett, tuerkis, braun, grau.
--   Geprueft wird das in der Route - eine Datenbankpruefung waere hier nur
--   im Weg, wenn spaeter eine Farbe dazukommt.
--
-- SERIE
--   Eine Gruppe kann zu einer Serie gehoeren. Wer der Serie ein Team
--   zuweist, deckt damit alle Aufgaben der Gruppe ab, auch spaeter
--   hinzugefuegte. Steht an einer Aufgabe eine EIGENE Serie, gewinnt die
--   Aufgabe - die Abfragen sind entsprechend geschrieben.
--
--   ON DELETE SET NULL: wird die Serie geloescht, bleibt die Gruppe.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/022_task_group_color_series.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:022:prod
--
--   Lokal mit ts-node:  npm run migrate:022

ALTER TABLE program_items ADD COLUMN IF NOT EXISTS color VARCHAR(16);
ALTER TABLE program_items ADD COLUMN IF NOT EXISTS series_id INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'program_items_series_id_fkey'
  ) THEN
    ALTER TABLE program_items
      ADD CONSTRAINT program_items_series_id_fkey
      FOREIGN KEY (series_id) REFERENCES task_series(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_program_items_series_id ON program_items (series_id);

COMMENT ON COLUMN program_items.color IS
  'Farbname der Gruppe (blau, gruen, gelb, rot, violett, tuerkis, braun, grau) oder NULL.';
COMMENT ON COLUMN program_items.series_id IS
  'Serie der Gruppe. Eine eigene Serie an der Aufgabe geht vor.';
