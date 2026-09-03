-- Migration: Personalbedarf je Aufgabe
--
-- An einer Aufgabe soll stehen, wie viele Leute es dafuer braucht - damit
-- man beim Einteilen sieht, ob es reicht. Optional getrennt nach weiblich
-- und maennlich, weil manche Aufgaben das erfordern (Schlafraum-Aufsicht,
-- Umkleide, Nachtwache).
--
-- WICHTIG: Das ist eine Angabe AN DER AUFGABE, kein Merkmal an Personen.
-- In users wird bewusst kein Geschlecht gefuehrt und soll auch keines
-- gefuehrt werden. Der Server kann deshalb gar nicht pruefen, ob die
-- Aufteilung erfuellt ist - er zaehlt nur Koepfe. Die Angabe ist ein
-- Anhaltspunkt fuer den Menschen, der einteilt, keine Bedingung: mehr oder
-- weniger Leute sind ausdruecklich erlaubt, nichts wird blockiert.
--
-- Alle drei Spalten sind NULL, wenn nichts angegeben wurde - "kein Bedarf
-- hinterlegt" ist etwas anderes als "null Personen noetig".
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/018_task_staffing.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:018:prod
--
--   Lokal mit ts-node:  npm run migrate:018

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needed_staff   INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needed_female  INTEGER;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS needed_male    INTEGER;

-- Negative Angaben ergeben keinen Sinn. Nach oben wird nicht begrenzt.
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_needed_nonnegative;
ALTER TABLE tasks ADD CONSTRAINT tasks_needed_nonnegative CHECK (
  (needed_staff  IS NULL OR needed_staff  >= 0) AND
  (needed_female IS NULL OR needed_female >= 0) AND
  (needed_male   IS NULL OR needed_male   >= 0)
);

COMMENT ON COLUMN tasks.needed_staff  IS 'Benoetigte Personen insgesamt, NULL = keine Angabe. Unverbindlich.';
COMMENT ON COLUMN tasks.needed_female IS 'Davon weiblich, NULL = keine Angabe. Unverbindlich.';
COMMENT ON COLUMN tasks.needed_male   IS 'Davon maennlich, NULL = keine Angabe. Unverbindlich.';
