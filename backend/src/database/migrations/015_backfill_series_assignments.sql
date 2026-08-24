-- Migration: Serien-Mitgliedschaften in echte Zuweisungen uebersetzen
--
-- Eine Serie hielt ihre Mitglieder nur in task_series_members. /my-tasks
-- liest aber aus task_assignments - wer nur ueber eine Serie zugewiesen war,
-- sah seine Aufgaben im Mitarbeiterbereich deshalb gar nicht und konnte sie
-- auch nicht als erledigt melden.
--
-- Ab jetzt zieht der Server die Zuweisungen bei jeder Aenderung an einer
-- Serie automatisch nach. Diese Migration holt das einmalig fuer den
-- bestehenden Datenbestand nach.
--
-- NOT EXISTS: bereits vorhandene Zuweisungen bleiben unberuehrt, die
-- Migration ist damit gefahrlos mehrfach ausfuehrbar.
--
-- AUSFUEHREN
--   Im Docker-Betrieb gibt es im Backend-Image kein ts-node (nur die
--   kompilierten JS-Dateien, devDependencies sind entfernt). Deshalb aus dem
--   Projektverzeichnis heraus direkt in die Datenbank leiten:
--
--     docker-compose exec -T postgres psql -U eventmanager -d eventmanager \
--       < backend/src/database/migrations/015_backfill_series_assignments.sql
--
--   Ab dem naechsten Image-Neubau geht auch:
--     docker-compose exec backend npm run migrate:015:prod
--
--   Lokal mit ts-node:  npm run migrate:015

INSERT INTO task_assignments (task_id, event_instance_id, user_id, reminder_minutes)
SELECT
  t.id,
  ei.id,
  tsm.user_id,
  COALESCE(t.reminder_minutes, 15)
FROM task_series_members tsm
JOIN tasks t ON t.series_id = tsm.series_id
JOIN event_instances ei ON ei.event_id = t.event_id
WHERE NOT EXISTS (
  SELECT 1 FROM task_assignments ta
  WHERE ta.task_id = t.id
    AND ta.event_instance_id = ei.id
    AND ta.user_id = tsm.user_id
);
