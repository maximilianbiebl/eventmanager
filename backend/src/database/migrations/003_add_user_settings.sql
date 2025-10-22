-- Migration 003: User Settings für Benachrichtigungen

-- Füge default_reminder_minutes zu users Tabelle hinzu
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS default_reminder_minutes INTEGER DEFAULT 15;

-- Füge push_enabled zu users Tabelle hinzu
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN users.default_reminder_minutes IS 'Standard-Erinnerungszeit in Minuten vor Aufgabe';
COMMENT ON COLUMN users.push_enabled IS 'Push-Benachrichtigungen aktiviert/deaktiviert';
