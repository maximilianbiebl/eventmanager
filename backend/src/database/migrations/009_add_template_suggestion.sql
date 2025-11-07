-- Migration: Add template suggestion functionality
-- This migration adds:
-- 1. is_template_suggestion field to events

-- Add is_template_suggestion column to events table
ALTER TABLE events
ADD COLUMN IF NOT EXISTS is_template_suggestion BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN events.is_template_suggestion IS 'Indicates if event is suggested as template by Teamleiter for Admin approval';
