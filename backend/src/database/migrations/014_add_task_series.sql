-- Migration: Add task series support for recurring tasks
-- This migration adds support for task series, where multiple tasks can be grouped
-- together as a recurring series with shared team members

-- Create task_series table
CREATE TABLE IF NOT EXISTS task_series (
  id SERIAL PRIMARY KEY,
  event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

COMMENT ON TABLE task_series IS 'Recurring task series that group multiple tasks together';
COMMENT ON COLUMN task_series.event_id IS 'Event this series belongs to';
COMMENT ON COLUMN task_series.name IS 'Name of the task series (e.g., "Setup Team", "Breakdown Team")';

-- Add series_id to tasks table
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS series_id INTEGER REFERENCES task_series(id) ON DELETE SET NULL;

COMMENT ON COLUMN tasks.series_id IS 'Optional reference to task series for recurring tasks';

-- Create junction table for series team members
CREATE TABLE IF NOT EXISTS task_series_members (
  id SERIAL PRIMARY KEY,
  series_id INTEGER NOT NULL REFERENCES task_series(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(series_id, user_id)
);

COMMENT ON TABLE task_series_members IS 'Team members assigned to an entire task series';
COMMENT ON COLUMN task_series_members.series_id IS 'Reference to the task series';
COMMENT ON COLUMN task_series_members.user_id IS 'User assigned to this series';

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tasks_series_id ON tasks(series_id);
CREATE INDEX IF NOT EXISTS idx_task_series_event_id ON task_series(event_id);
CREATE INDEX IF NOT EXISTS idx_task_series_members_series_id ON task_series_members(series_id);
CREATE INDEX IF NOT EXISTS idx_task_series_members_user_id ON task_series_members(user_id);
