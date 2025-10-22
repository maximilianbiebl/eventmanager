-- Migration: Erweitere tasks Tabelle
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS start_time TIME,
  ADD COLUMN IF NOT EXISTS end_time TIME,
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'not_started';

-- Migration: task_assignments erweitern für individuellen Status
ALTER TABLE task_assignments
  ADD COLUMN IF NOT EXISTS reminder_minutes INTEGER DEFAULT 15;

-- Neue Tabelle: Event-Mitarbeiter-Pool (vorausgewählte Mitarbeiter)
CREATE TABLE IF NOT EXISTS event_staff (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

-- Index für Performance
CREATE INDEX IF NOT EXISTS idx_event_staff_event_id ON event_staff(event_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);

-- Kommentar: Status-Werte
COMMENT ON COLUMN tasks.status IS 'not_started, in_progress, completed, overdue';
