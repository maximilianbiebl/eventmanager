-- Migration: Aufgaben, die sich selbst abhaken
--
-- Manche Aufgaben sind mit dem Zeitpunkt erledigt, an dem sie stattfinden -
-- "Zimmerkontrolle 22:00", "Nachtruhe", "Bus faehrt". Da muss niemand einen
-- Knopf druecken, und eine Erinnerung dazu ist nur Laerm.
--
-- Ist das Kennzeichen gesetzt, gilt:
--   - Die Aufgabe wird zum Ende ihres Zeitfensters von selbst auf "erledigt"
--     gesetzt (Endzeit, sonst Startzeit, sonst geplante Zeit).
--   - Es geht KEINE Benachrichtigung dazu raus: keine Erinnerung vorher,
--     keine Meldung ueber den Statuswechsel, keine Ueberfaellig-Meldung.
--   - Sie wird auch nicht mehr ueberfaellig - sie ist ja abgehakt.
--
-- Von Hand laesst sie sich weiterhin frueher abhaken oder wieder oeffnen;
-- die Automatik greift dann beim naechsten faelligen Zeitpunkt erneut.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/020_task_auto_complete.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:020:prod
--
--   Lokal mit ts-node:  npm run migrate:020

ALTER TABLE tasks ADD COLUMN IF NOT EXISTS auto_complete BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.auto_complete IS
  'Aufgabe hakt sich zum Ende ihres Zeitfensters selbst ab und loest dabei keine Benachrichtigung aus.';
