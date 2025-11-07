-- Migration: Add template suggestion functionality
-- This migration adds:
-- 1. is_template_suggestion field to events
-- 2. Makes start_date nullable for templates

-- Add is_template_suggestion column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_template_suggestion BOOLEAN DEFAULT FALSE;

-- Make start_date nullable (templates don't need a start date)
ALTER TABLE events
ALTER COLUMN start_date DROP NOT NULL;

COMMENT ON COLUMN events.is_template_suggestion IS 'Indicates if event is suggested as template by Teamleiter for Admin approval';
COMMENT ON COLUMN events.start_date IS 'Start date for events, NULL for templates';
