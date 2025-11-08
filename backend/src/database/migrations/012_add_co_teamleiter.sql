-- Migration: Add Co-Teamleiter and Event Staff Pool
-- This migration adds:
-- 1. event_teamleiter table for multiple teamleiter per event
-- 2. event_staff table for event-level staff pool
-- 3. Teamleiter are automatically part of their event staff

-- Create event_teamleiter table
-- This allows multiple teamleiter (main + co-teamleiter) per event
CREATE TABLE IF NOT EXISTS event_teamleiter (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_teamleiter_event_id ON event_teamleiter(event_id);
CREATE INDEX idx_event_teamleiter_user_id ON event_teamleiter(user_id);

COMMENT ON TABLE event_teamleiter IS 'Multiple teamleiter (primary + co-teamleiter) per event';
COMMENT ON COLUMN event_teamleiter.is_primary IS 'TRUE for the main/primary teamleiter, FALSE for co-teamleiter';

-- Create event_staff table
-- This defines the staff pool available for an event
-- Teamleiter are automatically added to this pool
CREATE TABLE IF NOT EXISTS event_staff (
    id SERIAL PRIMARY KEY,
    event_id INTEGER REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, user_id)
);

CREATE INDEX idx_event_staff_event_id ON event_staff(event_id);
CREATE INDEX idx_event_staff_user_id ON event_staff(user_id);

COMMENT ON TABLE event_staff IS 'Staff pool for an event (includes teamleiter automatically)';

-- Migrate existing events: Add event creator as primary teamleiter
INSERT INTO event_teamleiter (event_id, user_id, is_primary)
SELECT id, created_by, TRUE
FROM events
WHERE created_by IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Migrate existing events: Add teamleiter to event_staff
INSERT INTO event_staff (event_id, user_id)
SELECT id, created_by
FROM events
WHERE created_by IS NOT NULL
ON CONFLICT (event_id, user_id) DO NOTHING;

-- Migrate existing event_instance_staff to event_staff
-- This consolidates staff at the event level
INSERT INTO event_staff (event_id, user_id)
SELECT DISTINCT ei.event_id, eis.user_id
FROM event_instance_staff eis
JOIN event_instances ei ON eis.event_instance_id = ei.id
ON CONFLICT (event_id, user_id) DO NOTHING;
