-- Fix default skin from 'green' to 'default'
ALTER TABLE user_skins ALTER COLUMN purchased_skins SET DEFAULT ARRAY['default'];

-- Add 'default' skin to any existing records that don't have it
UPDATE user_skins
SET purchased_skins = array_append(purchased_skins, 'default')
WHERE NOT ('default' = ANY(purchased_skins));
