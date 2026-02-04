-- User skins table for storing purchased robot skins
CREATE TABLE user_skins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  purchased_skins TEXT[] DEFAULT ARRAY['green'],
  stars_spent INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Enable RLS
ALTER TABLE user_skins ENABLE ROW LEVEL SECURITY;

-- Users can read their own skins
CREATE POLICY "Users can read own skins"
  ON user_skins FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own skins record
CREATE POLICY "Users can insert own skins"
  ON user_skins FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own skins
CREATE POLICY "Users can update own skins"
  ON user_skins FOR UPDATE
  USING (auth.uid() = user_id);

-- Create index for faster lookups
CREATE INDEX idx_user_skins_user_id ON user_skins(user_id);

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_skins_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER user_skins_updated_at
  BEFORE UPDATE ON user_skins
  FOR EACH ROW
  EXECUTE FUNCTION update_user_skins_updated_at();
