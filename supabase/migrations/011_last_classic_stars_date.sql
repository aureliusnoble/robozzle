-- Add last_classic_stars_date column to profiles table
-- Tracks when the user last earned classic stars (for UI indicator)

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS last_classic_stars_date DATE DEFAULT NULL;
