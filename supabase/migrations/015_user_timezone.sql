-- Add timezone to profiles for timezone-aware streak tracking
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- Create index for timezone-based queries (used by notification cron)
CREATE INDEX IF NOT EXISTS idx_profiles_timezone ON profiles(timezone);
