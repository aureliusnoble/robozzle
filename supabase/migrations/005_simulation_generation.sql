-- Migration for simulation-based daily puzzle generation
-- Changes: Easy + Challenge puzzles per day, generated solution storage, generation configs

-- ============================================
-- 1. Add generated_solution column to puzzles table
-- Stores the solution program as JSONB for preview/verification
-- ============================================
ALTER TABLE public.puzzles
ADD COLUMN IF NOT EXISTS generated_solution JSONB;

-- ============================================
-- 2. Add profile_name column to puzzles table
-- Stores the generation profile name used (e.g., 'easy', 'challenge')
-- ============================================
ALTER TABLE public.puzzles
ADD COLUMN IF NOT EXISTS profile_name TEXT;

-- ============================================
-- 3. Update mechanic_category CHECK constraint
-- Change from old categories to new 'easy'/'challenge' system
-- ============================================

-- First, drop the existing constraint on puzzles table
ALTER TABLE public.puzzles
DROP CONSTRAINT IF EXISTS puzzles_mechanic_category_check;

-- Add new constraint with easy/challenge categories
ALTER TABLE public.puzzles
ADD CONSTRAINT puzzles_mechanic_category_check
CHECK (mechanic_category IS NULL OR mechanic_category IN ('easy', 'challenge'));

-- Update existing mechanic_category values to map to new system
-- Old categories map to 'challenge' since they were more complex
UPDATE public.puzzles
SET mechanic_category = 'challenge'
WHERE mechanic_category IN ('conditionals', 'recursion', 'painting', 'multi-func', 'loop');

-- ============================================
-- 4. Update generated_puzzle_pool mechanic_category
-- ============================================

-- Drop existing constraint on generated_puzzle_pool
ALTER TABLE public.generated_puzzle_pool
DROP CONSTRAINT IF EXISTS generated_puzzle_pool_mechanic_category_check;

-- Add new constraint
ALTER TABLE public.generated_puzzle_pool
ADD CONSTRAINT generated_puzzle_pool_mechanic_category_check
CHECK (mechanic_category IN ('easy', 'challenge'));

-- Update existing values
UPDATE public.generated_puzzle_pool
SET mechanic_category = 'challenge'
WHERE mechanic_category IN ('conditionals', 'recursion', 'painting', 'multi-func', 'loop');

-- ============================================
-- 5. Add challenge_type column to daily_challenges
-- ============================================
ALTER TABLE public.daily_challenges
ADD COLUMN IF NOT EXISTS challenge_type TEXT DEFAULT 'challenge'
CHECK (challenge_type IN ('easy', 'challenge'));

-- ============================================
-- 6. Update daily_challenges unique constraint
-- Drop old unique on date only, add compound unique on (date, challenge_type)
-- ============================================

-- Drop old unique constraint
ALTER TABLE public.daily_challenges
DROP CONSTRAINT IF EXISTS daily_challenges_date_key;

-- Add new compound unique constraint
ALTER TABLE public.daily_challenges
ADD CONSTRAINT daily_challenges_date_challenge_type_key UNIQUE (date, challenge_type);

-- ============================================
-- 7. Update daily_leaderboard to support challenge_type
-- ============================================
ALTER TABLE public.daily_leaderboard
ADD COLUMN IF NOT EXISTS challenge_type TEXT DEFAULT 'challenge'
CHECK (challenge_type IN ('easy', 'challenge'));

-- Drop old unique constraint
ALTER TABLE public.daily_leaderboard
DROP CONSTRAINT IF EXISTS daily_leaderboard_user_id_date_key;

-- Add new compound unique constraint
ALTER TABLE public.daily_leaderboard
ADD CONSTRAINT daily_leaderboard_user_date_challenge_type_key
UNIQUE (user_id, date, challenge_type);

-- Update the leaderboard index for the new schema
DROP INDEX IF EXISTS idx_daily_leaderboard_ranking;
CREATE INDEX idx_daily_leaderboard_ranking
ON public.daily_leaderboard(date, challenge_type, instructions_used, steps, completed_at);

-- ============================================
-- 8. Create generation_configs table
-- Stores simulation configs for Easy/Challenge generation
-- ============================================
CREATE TABLE IF NOT EXISTS public.generation_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN ('easy', 'challenge')),
  config JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.generation_configs ENABLE ROW LEVEL SECURITY;

-- Configs are readable by authenticated users
CREATE POLICY "Generation configs readable by authenticated users"
ON public.generation_configs FOR SELECT
TO authenticated
USING (true);

-- Only dev/admin can modify configs (via service role or check role)
CREATE POLICY "Generation configs modifiable by dev/admin"
ON public.generation_configs FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('dev', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('dev', 'admin')
  )
);

-- Service role has full access
CREATE POLICY "Generation configs full access for service role"
ON public.generation_configs FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_generation_configs_updated_at
  BEFORE UPDATE ON public.generation_configs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================
-- 9. Update select_next_daily_puzzle function
-- Now accepts challenge_type parameter
-- ============================================
CREATE OR REPLACE FUNCTION select_next_daily_puzzle(p_challenge_type TEXT DEFAULT 'challenge')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  selected_puzzle_id TEXT;
BEGIN
  -- Validate challenge_type
  IF p_challenge_type NOT IN ('easy', 'challenge') THEN
    RAISE EXCEPTION 'Invalid challenge_type: %', p_challenge_type;
  END IF;

  -- Select an unused puzzle matching the challenge type
  -- Prioritize by quality score, with some randomness
  SELECT puzzle_id INTO selected_puzzle_id
  FROM public.generated_puzzle_pool
  WHERE used_for_daily IS NULL
    AND mechanic_category = p_challenge_type
  ORDER BY quality_score DESC, RANDOM()
  LIMIT 1;

  -- If no puzzle found, try any unused puzzle
  IF selected_puzzle_id IS NULL THEN
    SELECT puzzle_id INTO selected_puzzle_id
    FROM public.generated_puzzle_pool
    WHERE used_for_daily IS NULL
    ORDER BY quality_score DESC, RANDOM()
    LIMIT 1;
  END IF;

  RETURN selected_puzzle_id;
END;
$$;

-- ============================================
-- 10. Update create_daily_challenges function (plural)
-- Creates both easy and challenge puzzles for the day
-- ============================================
CREATE OR REPLACE FUNCTION create_daily_challenges()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  easy_puzzle_id TEXT;
  challenge_puzzle_id TEXT;
BEGIN
  -- Create easy challenge if not exists
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenges
    WHERE date = today AND challenge_type = 'easy'
  ) THEN
    -- Select easy puzzle
    easy_puzzle_id := select_next_daily_puzzle('easy');

    IF easy_puzzle_id IS NOT NULL THEN
      INSERT INTO public.daily_challenges (date, puzzle_id, challenge_type)
      VALUES (today, easy_puzzle_id, 'easy');

      UPDATE public.generated_puzzle_pool
      SET used_for_daily = today
      WHERE puzzle_id = easy_puzzle_id;
    ELSE
      -- Fallback: select a random easy classic puzzle
      SELECT p.id INTO easy_puzzle_id
      FROM public.puzzles p
      WHERE p.category = 'classic'
        AND p.difficulty = 'easy'
        AND p.id NOT IN (SELECT dc.puzzle_id FROM public.daily_challenges dc)
      ORDER BY RANDOM()
      LIMIT 1;

      IF easy_puzzle_id IS NOT NULL THEN
        INSERT INTO public.daily_challenges (date, puzzle_id, challenge_type)
        VALUES (today, easy_puzzle_id, 'easy');
      END IF;
    END IF;
  END IF;

  -- Create challenge if not exists
  IF NOT EXISTS (
    SELECT 1 FROM public.daily_challenges
    WHERE date = today AND challenge_type = 'challenge'
  ) THEN
    -- Select challenge puzzle
    challenge_puzzle_id := select_next_daily_puzzle('challenge');

    IF challenge_puzzle_id IS NOT NULL THEN
      INSERT INTO public.daily_challenges (date, puzzle_id, challenge_type)
      VALUES (today, challenge_puzzle_id, 'challenge');

      UPDATE public.generated_puzzle_pool
      SET used_for_daily = today
      WHERE puzzle_id = challenge_puzzle_id;
    ELSE
      -- Fallback: select a random hard classic puzzle
      SELECT p.id INTO challenge_puzzle_id
      FROM public.puzzles p
      WHERE p.category = 'classic'
        AND p.difficulty IN ('hard', 'expert')
        AND p.id NOT IN (SELECT dc.puzzle_id FROM public.daily_challenges dc)
      ORDER BY RANDOM()
      LIMIT 1;

      IF challenge_puzzle_id IS NOT NULL THEN
        INSERT INTO public.daily_challenges (date, puzzle_id, challenge_type)
        VALUES (today, challenge_puzzle_id, 'challenge');
      END IF;
    END IF;
  END IF;
END;
$$;

-- Keep old function name as alias for backwards compatibility
CREATE OR REPLACE FUNCTION create_daily_challenge()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM create_daily_challenges();
END;
$$;

-- ============================================
-- 11. Update generated_puzzles_view
-- ============================================
DROP VIEW IF EXISTS public.generated_puzzles_view;
CREATE VIEW public.generated_puzzles_view AS
SELECT
  p.id,
  p.title,
  p.difficulty,
  p.generation_source,
  p.mechanic_category,
  p.profile_name,
  p.solver_difficulty_score,
  p.quality_score,
  p.solution_instruction_count,
  p.solution_step_count,
  p.generated_solution,
  p.created_at,
  gpp.used_for_daily,
  gpp.id as pool_id
FROM public.puzzles p
LEFT JOIN public.generated_puzzle_pool gpp ON p.id = gpp.puzzle_id
WHERE p.generation_source = 'generated';

-- ============================================
-- 12. Grant permissions
-- ============================================
GRANT SELECT ON public.generation_configs TO authenticated;
GRANT EXECUTE ON FUNCTION select_next_daily_puzzle(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION create_daily_challenges() TO service_role;
