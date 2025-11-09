-- Migration: Add teamleiter status notification preference
-- This migration adds a preference for teamleiter/admin to receive notifications
-- when staff members change task status (in_progress, completed, overdue)

-- Add status notification preference for teamleiter/admin
ALTER TABLE users
ADD COLUMN IF NOT EXISTS teamleiter_status_notifications BOOLEAN DEFAULT TRUE;

COMMENT ON COLUMN users.teamleiter_status_notifications IS 'Whether teamleiter/admin wants to receive notifications when staff changes task status';
