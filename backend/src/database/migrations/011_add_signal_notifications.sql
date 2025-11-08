-- Migration: Add Signal notification support
-- This migration adds:
-- 1. Signal notification preferences for all users
-- 2. Signal account linking for Teamleiter/Admin

-- Add Signal notification settings for users
ALTER TABLE users
ADD COLUMN IF NOT EXISTS signal_enabled BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS signal_phone_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS web_push_enabled BOOLEAN DEFAULT TRUE;

-- Add Signal account management for Teamleiter/Admin
ALTER TABLE users
ADD COLUMN IF NOT EXISTS signal_account_number VARCHAR(20),
ADD COLUMN IF NOT EXISTS signal_device_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS signal_linked BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS signal_linked_at TIMESTAMP;

COMMENT ON COLUMN users.signal_enabled IS 'Whether user wants to receive Signal notifications';
COMMENT ON COLUMN users.signal_phone_number IS 'User phone number for receiving Signal notifications';
COMMENT ON COLUMN users.web_push_enabled IS 'Whether user wants to receive web push notifications';
COMMENT ON COLUMN users.signal_account_number IS 'Teamleiter/Admin Signal account number (linked device)';
COMMENT ON COLUMN users.signal_device_id IS 'Signal device ID for linked account';
COMMENT ON COLUMN users.signal_linked IS 'Whether Teamleiter/Admin has linked their Signal account';
COMMENT ON COLUMN users.signal_linked_at IS 'When the Signal account was linked';
