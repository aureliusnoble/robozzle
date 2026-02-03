-- Table for user-saved simulation configurations
CREATE TABLE saved_simulation_configs (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  saved_at BIGINT NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster user lookups
CREATE INDEX idx_saved_simulation_configs_user_id ON saved_simulation_configs(user_id);

-- RLS policies
ALTER TABLE saved_simulation_configs ENABLE ROW LEVEL SECURITY;

-- Users can only view their own configs
CREATE POLICY "Users can view own configs"
  ON saved_simulation_configs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own configs
CREATE POLICY "Users can insert own configs"
  ON saved_simulation_configs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own configs
CREATE POLICY "Users can update own configs"
  ON saved_simulation_configs FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own configs
CREATE POLICY "Users can delete own configs"
  ON saved_simulation_configs FOR DELETE
  USING (auth.uid() = user_id);

-- Trigger to update updated_at
CREATE TRIGGER update_saved_simulation_configs_updated_at
  BEFORE UPDATE ON saved_simulation_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
