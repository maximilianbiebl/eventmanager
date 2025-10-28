-- Migration 005: Add view preference and start notification preference

-- Add default_view column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_view VARCHAR(10) DEFAULT 'cards' CHECK (default_view IN ('cards', 'table'));

-- Add start_notification_enabled column to users table
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS start_notification_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN users.default_view IS 'Standard-Ansicht für Aufgabenliste: cards oder table';
COMMENT ON COLUMN users.start_notification_enabled IS 'Benachrichtigung zur genauen Startzeit aktiviert/deaktiviert';
