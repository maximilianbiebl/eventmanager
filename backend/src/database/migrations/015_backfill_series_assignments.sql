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
-- ON CONFLICT / NOT EXISTS: bereits vorhandene Zuweisungen bleiben unberuehrt,
-- die Migration ist damit mehrfach ausfuehrbar.

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
