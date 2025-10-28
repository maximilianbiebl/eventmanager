-- Add notification_type column to notifications_log table
ALTER TABLE notifications_log
ADD COLUMN IF NOT EXISTS notification_type VARCHAR(50) DEFAULT 'reminder';

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_notifications_log_type
ON notifications_log(notification_type);
