-- Migration: Add Teamleiter role and template functionality
-- This migration adds:
-- 1. 'teamleiter' role to users
-- 2. is_template field to events

-- Add is_template column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_template BOOLEAN DEFAULT FALSE;

-- Note: PostgreSQL does not support direct ALTER TYPE for enum-like constraints
-- The role column is a VARCHAR(50), so no schema change is needed
-- The application will handle validation of the 'teamleiter' role value

-- Add comment to document allowed role values
COMMENT ON COLUMN users.role IS 'Allowed values: admin, teamleiter, staff';
COMMENT ON COLUMN events.is_template IS 'Indicates if event is a template that can be copied by Teamleiter';
