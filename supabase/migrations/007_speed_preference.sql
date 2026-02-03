-- Add speed_preference column to user_progress table
-- This stores the user's preferred execution speed (in milliseconds)
-- Valid values: 25 (lightning), 100 (fast), 500 (medium), 1000 (slow)

ALTER TABLE user_progress
ADD COLUMN IF NOT EXISTS speed_preference INTEGER DEFAULT NULL;

-- Add a check constraint to ensure valid speed values
ALTER TABLE user_progress
ADD CONSTRAINT valid_speed_preference
CHECK (speed_preference IS NULL OR speed_preference IN (25, 100, 500, 1000));
