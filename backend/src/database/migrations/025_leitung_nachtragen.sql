-- Migration: Fehlende Leitung bei duplizierten und importierten Veranstaltungen nachtragen
-- Wiederholbar: ja
--
-- Beim Duplizieren und beim CSV-Import wurde der Ersteller nicht als
-- Leitung eingetragen und nicht in den Mitarbeiter-Pool gesetzt. Die
-- Veranstaltung hatte damit keine Hauptleitung; der Ersteller konnte sich
-- nur noch als Co-Leitung nachtragen (loeschen konnte er sie trotzdem).
--
-- Fuer jede Veranstaltung ohne Hauptleitung wird der Ersteller zur
-- Hauptleitung - auch wenn er sich schon als Co-Leitung nachgetragen hat -
-- und in den Pool gesetzt. Vorlagen bleiben aussen vor.
--
-- Nur Veranstaltungen OHNE Hauptleitung werden angefasst. Wer sich bei
-- einer regulaer angelegten Veranstaltung bewusst aus dem Pool genommen
-- hat, wird nicht wieder hineingesetzt. Ein zweiter Lauf findet nichts mehr.

WITH ohne_leitung AS (
  SELECT e.id, e.created_by
  FROM events e
  WHERE e.is_template = false
    AND e.created_by IS NOT NULL
    AND EXISTS (SELECT 1 FROM users u WHERE u.id = e.created_by)
    AND NOT EXISTS (
      SELECT 1 FROM event_teamleiter et
      WHERE et.event_id = e.id AND et.is_primary = true
    )
),
leitung AS (
  INSERT INTO event_teamleiter (event_id, user_id, is_primary)
  SELECT id, created_by, true FROM ohne_leitung
  ON CONFLICT (event_id, user_id) DO UPDATE SET is_primary = true
  RETURNING event_id
)
INSERT INTO event_staff (event_id, user_id)
SELECT id, created_by FROM ohne_leitung
ON CONFLICT (event_id, user_id) DO NOTHING;
