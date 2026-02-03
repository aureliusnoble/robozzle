-- Leaderboards Feature Migration
-- Adds puzzle-specific leaderboards, save/load system, enhanced rankings, and streak tracking

-- ============================================================================
-- 1. PUZZLE LEADERBOARD TABLE
-- ============================================================================

CREATE TABLE public.puzzle_leaderboard (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL,
  instructions_used INT NOT NULL,
  steps INT NOT NULL,
  program JSONB NOT NULL,
  submitted_at TIMESTAMPTZ DEFAULT NOW(),
  is_late BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, puzzle_id)
);

-- Index for fetching leaderboard by puzzle
CREATE INDEX idx_puzzle_leaderboard_puzzle_id ON public.puzzle_leaderboard(puzzle_id);
CREATE INDEX idx_puzzle_leaderboard_ranking ON public.puzzle_leaderboard(puzzle_id, instructions_used, steps, submitted_at);

-- Enable RLS
ALTER TABLE public.puzzle_leaderboard ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Puzzle leaderboard is viewable by everyone"
  ON public.puzzle_leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own puzzle leaderboard entries"
  ON public.puzzle_leaderboard FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- 2. SAVED PROGRAMS TABLE
-- ============================================================================

CREATE TABLE public.saved_programs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  puzzle_id TEXT NOT NULL,
  slot INT NOT NULL,  -- 0 = latest (auto-save), 1-3 = user slots
  program JSONB NOT NULL,
  instructions_used INT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, puzzle_id, slot),
  CHECK (slot >= 0 AND slot <= 3)
);

-- Index for fetching saved programs
CREATE INDEX idx_saved_programs_user_puzzle ON public.saved_programs(user_id, puzzle_id);

-- Enable RLS
ALTER TABLE public.saved_programs ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own saved programs"
  ON public.saved_programs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own saved programs"
  ON public.saved_programs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own saved programs"
  ON public.saved_programs FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own saved programs"
  ON public.saved_programs FOR DELETE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 3. CLASSIC RANKINGS TABLE
-- ============================================================================

CREATE TABLE public.classic_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  score DECIMAL NOT NULL DEFAULT 0,
  prev_week_rank INT,  -- For weekly movement arrows
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for ranking queries
CREATE INDEX idx_classic_rankings_score ON public.classic_rankings(score DESC);

-- Enable RLS
ALTER TABLE public.classic_rankings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Classic rankings are viewable by everyone"
  ON public.classic_rankings FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own classic ranking"
  ON public.classic_rankings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own classic ranking"
  ON public.classic_rankings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 4. MONTHLY DAILY RANKINGS TABLE
-- ============================================================================

CREATE TABLE public.monthly_daily_rankings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  month TEXT NOT NULL,  -- 'YYYY-MM' format
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('easy', 'challenge')),
  total_points INT DEFAULT 0,
  completions INT DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, month, challenge_type)
);

-- Index for monthly rankings
CREATE INDEX idx_monthly_daily_rankings_month ON public.monthly_daily_rankings(month, challenge_type, total_points DESC);

-- Enable RLS
ALTER TABLE public.monthly_daily_rankings ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Monthly daily rankings are viewable by everyone"
  ON public.monthly_daily_rankings FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own monthly daily ranking"
  ON public.monthly_daily_rankings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own monthly daily ranking"
  ON public.monthly_daily_rankings FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================================
-- 5. CLASSIC RANK HISTORY TABLE (for weekly movement)
-- ============================================================================

CREATE TABLE public.classic_rank_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  score DECIMAL NOT NULL,
  rank INT NOT NULL,
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, snapshot_date)
);

-- Index for history lookups
CREATE INDEX idx_classic_rank_history_date ON public.classic_rank_history(snapshot_date);
CREATE INDEX idx_classic_rank_history_user ON public.classic_rank_history(user_id, snapshot_date);

-- Enable RLS
ALTER TABLE public.classic_rank_history ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Classic rank history is viewable by everyone"
  ON public.classic_rank_history FOR SELECT
  USING (true);

-- ============================================================================
-- 6. PROFILE ALTERATIONS
-- ============================================================================

-- Add new columns to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS classic_stars INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS hardest_puzzle_stars INT DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS best_daily_easy_rank INT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS best_daily_challenge_rank INT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_daily_date TEXT;

-- ============================================================================
-- 7. ADD is_late COLUMN TO DAILY_LEADERBOARD
-- ============================================================================

ALTER TABLE public.daily_leaderboard ADD COLUMN IF NOT EXISTS is_late BOOLEAN DEFAULT FALSE;

-- ============================================================================
-- 8. HELPER FUNCTIONS
-- ============================================================================

-- Function to calculate daily points based on final ranking
-- Called when daily is archived (typically at midnight)
CREATE OR REPLACE FUNCTION public.calculate_daily_points(p_rank INT)
RETURNS INT AS $$
BEGIN
  -- Points based on placement: 1st=100, 2nd=75, 3rd=60, 4th=50, 5th=45, 6th-10th=40-36, etc.
  RETURN CASE
    WHEN p_rank = 1 THEN 100
    WHEN p_rank = 2 THEN 75
    WHEN p_rank = 3 THEN 60
    WHEN p_rank = 4 THEN 50
    WHEN p_rank = 5 THEN 45
    WHEN p_rank <= 10 THEN 46 - p_rank
    WHEN p_rank <= 20 THEN 30
    WHEN p_rank <= 50 THEN 20
    WHEN p_rank <= 100 THEN 10
    ELSE 5
  END;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update monthly rankings when daily is finalized
CREATE OR REPLACE FUNCTION public.finalize_daily_rankings(p_date DATE, p_challenge_type TEXT)
RETURNS void AS $$
DECLARE
  r RECORD;
  v_rank INT := 0;
  v_prev_instructions INT := -1;
  v_prev_steps INT := -1;
  v_actual_rank INT := 0;
  v_month TEXT;
BEGIN
  v_month := TO_CHAR(p_date, 'YYYY-MM');

  -- Process each entry in rank order
  FOR r IN
    SELECT id, user_id, instructions_used, steps
    FROM public.daily_leaderboard
    WHERE date = p_date
      AND challenge_type = p_challenge_type
      AND is_late = FALSE
    ORDER BY instructions_used ASC, steps ASC, completed_at ASC
  LOOP
    v_actual_rank := v_actual_rank + 1;

    -- Handle ties - same rank for same score
    IF r.instructions_used != v_prev_instructions OR r.steps != v_prev_steps THEN
      v_rank := v_actual_rank;
    END IF;

    -- Update points in daily_leaderboard
    UPDATE public.daily_leaderboard
    SET points = calculate_daily_points(v_rank)
    WHERE id = r.id;

    -- Update monthly rankings
    INSERT INTO public.monthly_daily_rankings (user_id, month, challenge_type, total_points, completions)
    VALUES (r.user_id, v_month, p_challenge_type, calculate_daily_points(v_rank), 1)
    ON CONFLICT (user_id, month, challenge_type)
    DO UPDATE SET
      total_points = monthly_daily_rankings.total_points + calculate_daily_points(v_rank),
      completions = monthly_daily_rankings.completions + 1,
      updated_at = NOW();

    -- Update best rank in profiles
    IF p_challenge_type = 'easy' THEN
      UPDATE public.profiles
      SET best_daily_easy_rank = LEAST(COALESCE(best_daily_easy_rank, v_rank), v_rank)
      WHERE id = r.user_id;
    ELSE
      UPDATE public.profiles
      SET best_daily_challenge_rank = LEAST(COALESCE(best_daily_challenge_rank, v_rank), v_rank)
      WHERE id = r.user_id;
    END IF;

    v_prev_instructions := r.instructions_used;
    v_prev_steps := r.steps;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to take weekly snapshot of classic rankings
CREATE OR REPLACE FUNCTION public.snapshot_classic_rankings()
RETURNS void AS $$
DECLARE
  v_rank INT := 0;
  r RECORD;
BEGIN
  FOR r IN
    SELECT user_id, score
    FROM public.classic_rankings
    ORDER BY score DESC
  LOOP
    v_rank := v_rank + 1;

    INSERT INTO public.classic_rank_history (user_id, score, rank, snapshot_date)
    VALUES (r.user_id, r.score, v_rank, CURRENT_DATE)
    ON CONFLICT (user_id, snapshot_date)
    DO UPDATE SET score = r.score, rank = v_rank;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update saved_programs timestamp
CREATE TRIGGER update_saved_programs_updated_at
  BEFORE UPDATE ON public.saved_programs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger to update classic_rankings timestamp
CREATE TRIGGER update_classic_rankings_updated_at
  BEFORE UPDATE ON public.classic_rankings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Trigger to update monthly_daily_rankings timestamp
CREATE TRIGGER update_monthly_daily_rankings_updated_at
  BEFORE UPDATE ON public.monthly_daily_rankings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
