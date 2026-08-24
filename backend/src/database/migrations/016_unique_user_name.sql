-- Migration: Benutzernamen eindeutig machen
--
-- users.name ist der Anmeldename, hatte aber keine Eindeutigkeits-Zusicherung.
-- Import und Anlegen pruefen von Hand auf vorhandene Namen, die Tabelle selbst
-- erlaubte Doppelte. Der Login macht "WHERE name = $1" und nimmt die erste
-- Zeile - bei zwei gleichnamigen Konten waere also unbestimmt, in welches man
-- kommt.
--
-- Diese Migration bricht bewusst mit einer Fehlermeldung ab, wenn es bereits
-- Doppelte gibt, statt sie umzubenennen: ein umbenanntes Konto koennte sich
-- nicht mehr anmelden, und welches der beiden das "richtige" ist, kann nur ein
-- Mensch entscheiden.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/016_unique_user_name.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:016:prod
--
--   Lokal mit ts-node:  npm run migrate:016

DO $$
DECLARE
  doppelte text;
BEGIN
  SELECT string_agg(format('%s (%s Konten)', name, anzahl), ', ')
    INTO doppelte
    FROM (
      SELECT name, COUNT(*) AS anzahl
      FROM users
      GROUP BY name
      HAVING COUNT(*) > 1
    ) d;

  IF doppelte IS NOT NULL THEN
    RAISE EXCEPTION
      'Es gibt mehrfach vergebene Benutzernamen: %. Bitte zuerst umbenennen oder loeschen, dann diese Migration erneut ausfuehren.',
      doppelte;
  END IF;
END
$$;

-- Gross-/Kleinschreibung wird unterschieden, genau wie beim Login
-- ("WHERE name = $1"). "Max" und "max" bleiben damit zwei verschiedene Konten.
CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique ON users (name);
