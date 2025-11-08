-- Migration: Make event_instances.start_date nullable for templates
-- Templates need event_instances to display tasks in frontend,
-- but don't have a concrete start_date yet

ALTER TABLE event_instances
ALTER COLUMN start_date DROP NOT NULL;

COMMENT ON COLUMN event_instances.start_date IS 'Start date for event instances, NULL for template instances';
