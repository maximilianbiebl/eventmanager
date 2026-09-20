-- Migration: Eigene Erinnerung je Zuweisung - zu einem festen Zeitpunkt
--
-- Bisher gab es nur "X Minuten vorher" (task_assignments.reminder_minutes),
-- und das auch nur fuer Aufgaben MIT Uhrzeit. Eine Aufgabe ohne Zeit liess
-- sich gar nicht erinnern.
--
-- reminder_at ist ein fester Zeitpunkt und deckt beide neuen Faelle ab:
--   "in 20 Minuten"  -> jetzt + 20 Minuten
--   "um 09:30 Uhr"   -> der gewaehlte Tag um 09:30
-- Beide sind EINMALIG: nach dem Verschicken wird das Feld geleert, und es
-- gilt wieder, was an der Aufgabe steht.
--
-- Ohne Zeitzone gespeichert - wie alle anderen Zeitangaben hier. Server
-- und Veranstaltung stehen in derselben Zone.
--
-- AUSFUEHREN
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/024_eigene_erinnerung.sql
--
--   Ab dem naechsten Image-Neubau auch:
--     docker-compose exec backend npm run migrate:024:prod
--
--   Lokal mit ts-node:  npm run migrate:024

ALTER TABLE task_assignments ADD COLUMN IF NOT EXISTS reminder_at TIMESTAMP;

COMMENT ON COLUMN task_assignments.reminder_at IS
  'Einmalige eigene Erinnerung zu einem festen Zeitpunkt. Nach dem Verschicken wieder NULL.';

-- Der Wecker fragt jede Minute danach: nur die wenigen gesetzten Zeitpunkte
-- sind interessant, deshalb ein Teilindex.
CREATE INDEX IF NOT EXISTS idx_task_assignments_reminder_at
  ON task_assignments (reminder_at)
  WHERE reminder_at IS NOT NULL;
