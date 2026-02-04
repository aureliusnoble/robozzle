-- Add selected_skin column to track equipped skin
ALTER TABLE user_skins ADD COLUMN IF NOT EXISTS selected_skin TEXT DEFAULT 'default';
