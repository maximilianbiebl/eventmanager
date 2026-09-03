-- Migration: Anmeldename ohne Ruecksicht auf Gross-/Kleinschreibung
--
-- Beim Anmelden soll "Max Mustermann" und "max mustermann" dasselbe Konto
-- treffen. Auf dem Handy schreibt die Tastatur den ersten Buchstaben von
-- selbst gross - daran ist bisher jeder gescheitert, der seinen Namen klein
-- eingetragen hatte.
--
-- Damit das eindeutig bleibt, muss auch die Eindeutigkeits-Zusicherung ohne
-- Ruecksicht auf Gross-/Kleinschreibung gelten. Sonst koennte es "Max" und
-- "max" nebeneinander geben und die Anmeldung waere nicht mehr entscheidbar.
--
-- Diese Migration bricht bewusst mit einer Fehlermeldung ab, wenn es solche
-- Paare schon gibt: welches Konto das richtige ist, kann nur ein Mensch
-- entscheiden, und ein umbenanntes Konto koennte sich nicht mehr anmelden.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/019_case_insensitive_user_name.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:019:prod
--
--   Lokal mit ts-node:  npm run migrate:019

DO $$
DECLARE
  doppelte text;
BEGIN
  SELECT string_agg(format('%s (%s Konten)', namen, anzahl), ', ')
    INTO doppelte
    FROM (
      SELECT string_agg(name, ' / ' ORDER BY name) AS namen, COUNT(*) AS anzahl
      FROM users
      GROUP BY LOWER(name)
      HAVING COUNT(*) > 1
    ) d;

  IF doppelte IS NOT NULL THEN
    RAISE EXCEPTION
      'Diese Namen unterscheiden sich nur in der Gross-/Kleinschreibung: %. Bitte zuerst umbenennen oder loeschen, dann diese Migration erneut ausfuehren.',
      doppelte;
  END IF;
END
$$;

-- Der alte, auf Gross-/Kleinschreibung achtende Index wird durch den neuen
-- abgeloest: was ohne Ruecksicht darauf eindeutig ist, ist es mit erst recht.
CREATE UNIQUE INDEX IF NOT EXISTS users_name_unique_ci ON users (LOWER(name));
DROP INDEX IF EXISTS users_name_unique;
