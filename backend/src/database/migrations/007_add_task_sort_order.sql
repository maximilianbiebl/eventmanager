-- Migration 007: Add sort_order field to tasks table

-- Add sort_order column to tasks table
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
WHERE tasks.id = ordered_tasks.id;

-- Make sort_order NOT NULL after setting initial values
ALTER TABLE tasks
  ALTER COLUMN sort_order SET NOT NULL;

-- Set default for new tasks
ALTER TABLE tasks
  ALTER COLUMN sort_order SET DEFAULT 0;

COMMENT ON COLUMN tasks.sort_order IS 'Manuelle Sortierreihenfolge der Aufgabe innerhalb eines Events';
