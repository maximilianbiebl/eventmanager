-- Migration 006: Add is_active field to tasks table

-- Add is_active column to tasks table
ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN tasks.is_active IS 'Gibt an, ob die Aufgabe aktiv (sichtbar) oder deaktiviert (archiviert) ist';
