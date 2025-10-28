-- Manual Migration: Add view preference, notification settings, and task active field

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
