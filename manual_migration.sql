-- Manual Migration: Add view preference, notification settings, task active field, and sort order

-- Migration 005: Add default_view column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_view VARCHAR(10) DEFAULT 'cards' CHECK (default_view IN ('cards', 'table'));

-- Migration 005: Add start_notification_enabled column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS start_notification_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.default_view IS 'Standard-Ansicht für Aufgabenliste: cards oder table';
COMMENT ON COLUMN users.start_notification_enabled IS 'Benachrichtigung zur genauen Startzeit aktiviert/deaktiviert';

-- Migration 006: Add is_active field to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN tasks.is_active IS 'Gibt an, ob die Aufgabe aktiv (sichtbar) oder deaktiviert (archiviert) ist';

-- Migration 007: Add sort_order field to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS sort_order INTEGER;

-- Set initial sort_order based on current order (by day_number and scheduled_time)
WITH ordered_tasks AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY event_id
      ORDER BY day_number, COALESCE(start_time, scheduled_time, '23:59'), id
    ) AS row_num
  FROM tasks
)
UPDATE tasks
SET sort_order = ordered_tasks.row_num
FROM ordered_tasks
WHERE tasks.id = ordered_tasks.id
AND tasks.sort_order IS NULL;

-- Make sort_order NOT NULL after setting initial values
ALTER TABLE tasks
  ALTER COLUMN sort_order SET NOT NULL;

-- Set default for new tasks
ALTER TABLE tasks
  ALTER COLUMN sort_order SET DEFAULT 0;

COMMENT ON COLUMN tasks.sort_order IS 'Manuelle Sortierreihenfolge der Aufgabe innerhalb eines Events';
