-- Migration for generated puzzle system
-- Adds role column to profiles, generation metadata to puzzles, and puzzle pool table

-- ============================================
-- 1. Add role column to profiles for dev mode access
-- ============================================
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user'
CHECK (role IN ('user', 'dev', 'admin'));

-- Index for quick role lookups
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- ============================================
-- 2. Add generation metadata to puzzles table
-- ============================================
ALTER TABLE public.puzzles
ADD COLUMN IF NOT EXISTS generation_source TEXT DEFAULT 'classic'
  CHECK (generation_source IN ('classic', 'generated', 'user')),
ADD COLUMN IF NOT EXISTS solver_difficulty_score NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS quality_score NUMERIC(5, 2),
ADD COLUMN IF NOT EXISTS solution_instruction_count INTEGER,
ADD COLUMN IF NOT EXISTS solution_step_count INTEGER,
ADD COLUMN IF NOT EXISTS mechanic_category TEXT
  CHECK (mechanic_category IS NULL OR mechanic_category IN
    ('conditionals', 'recursion', 'painting', 'multi-func', 'loop'));

-- Index for filtering by generation source
CREATE INDEX IF NOT EXISTS idx_puzzles_generation_source ON public.puzzles(generation_source);

-- Index for filtering by mechanic category
CREATE INDEX IF NOT EXISTS idx_puzzles_mechanic_category ON public.puzzles(mechanic_category);

-- ============================================
-- 3. Generated puzzle pool table
-- ============================================
CREATE TABLE IF NOT EXISTS public.generated_puzzle_pool (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  puzzle_id TEXT NOT NULL REFERENCES public.puzzles(id) ON DELETE CASCADE,
  mechanic_category TEXT NOT NULL CHECK (mechanic_category IN
    ('conditionals', 'recursion', 'painting', 'multi-func', 'loop')),
  used_for_daily DATE,
  quality_score NUMERIC(5, 2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure each puzzle is only in pool once
  UNIQUE(puzzle_id)
);

-- Index for finding unused puzzles by category (for daily rotation)
CREATE INDEX IF NOT EXISTS idx_pool_unused_mechanic
ON public.generated_puzzle_pool(mechanic_category, quality_score DESC)
WHERE used_for_daily IS NULL;

-- Index for finding puzzles used on specific dates
CREATE INDEX IF NOT EXISTS idx_pool_used_date
ON public.generated_puzzle_pool(used_for_daily)
WHERE used_for_daily IS NOT NULL;

-- Enable RLS
ALTER TABLE public.generated_puzzle_pool ENABLE ROW LEVEL SECURITY;

-- Pool is readable by all authenticated users
CREATE POLICY "Pool readable by authenticated users"
ON public.generated_puzzle_pool FOR SELECT
TO authenticated
USING (true);

-- Only service role can modify pool
CREATE POLICY "Pool modifiable by service role"
ON public.generated_puzzle_pool FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================
-- 4. Function to select next daily puzzle
-- Rotates through mechanic categories for variety
-- ============================================
CREATE OR REPLACE FUNCTION select_next_daily_puzzle()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  selected_puzzle_id TEXT;
  last_category TEXT;
  next_category TEXT;
  category_order TEXT[] := ARRAY['conditionals', 'recursion', 'painting', 'multi-func', 'loop'];
  last_idx INTEGER;
BEGIN
  -- Get the mechanic category of the most recent daily puzzle
  SELECT gpp.mechanic_category INTO last_category
  FROM public.daily_challenges dc
  JOIN public.generated_puzzle_pool gpp ON dc.puzzle_id = gpp.puzzle_id
  WHERE dc.date < CURRENT_DATE
  ORDER BY dc.date DESC
  LIMIT 1;

  -- Determine next category (rotate through categories)
  IF last_category IS NULL THEN
    next_category := category_order[1];
  ELSE
    last_idx := array_position(category_order, last_category);
    IF last_idx IS NULL OR last_idx >= array_length(category_order, 1) THEN
      next_category := category_order[1];
    ELSE
      next_category := category_order[last_idx + 1];
    END IF;
  END IF;

  -- Select an unused puzzle from the next category
  -- Fall back to any category if preferred is empty
  SELECT puzzle_id INTO selected_puzzle_id
  FROM public.generated_puzzle_pool
  WHERE used_for_daily IS NULL
    AND mechanic_category = next_category
  ORDER BY quality_score DESC, RANDOM()
  LIMIT 1;

  -- If no puzzle found in preferred category, try any category
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
-- 5. Function to create daily challenge
-- Called by pg_cron at midnight UTC
-- ============================================
CREATE OR REPLACE FUNCTION create_daily_challenge()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  today DATE := CURRENT_DATE;
  puzzle_id TEXT;
BEGIN
  -- Check if today's challenge already exists
  IF EXISTS (SELECT 1 FROM public.daily_challenges WHERE date = today) THEN
    RETURN;
  END IF;

  -- Select next puzzle from pool
  puzzle_id := select_next_daily_puzzle();

  -- If we have a generated puzzle, use it
  IF puzzle_id IS NOT NULL THEN
    -- Insert daily challenge
    INSERT INTO public.daily_challenges (date, puzzle_id)
    VALUES (today, puzzle_id);

    -- Mark puzzle as used
    UPDATE public.generated_puzzle_pool
    SET used_for_daily = today
    WHERE generated_puzzle_pool.puzzle_id = create_daily_challenge.puzzle_id;
  ELSE
    -- Fallback: select a random classic puzzle
    SELECT p.id INTO puzzle_id
    FROM public.puzzles p
    WHERE p.category = 'classic'
      AND p.id NOT IN (SELECT dc.puzzle_id FROM public.daily_challenges dc)
    ORDER BY RANDOM()
    LIMIT 1;

    IF puzzle_id IS NOT NULL THEN
      INSERT INTO public.daily_challenges (date, puzzle_id)
      VALUES (today, puzzle_id);
    END IF;
  END IF;
END;
$$;

-- ============================================
-- 6. View for dev mode puzzle management
-- ============================================
CREATE OR REPLACE VIEW public.generated_puzzles_view AS
SELECT
  p.id,
  p.title,
  p.difficulty,
  p.generation_source,
  p.mechanic_category,
  p.solver_difficulty_score,
  p.quality_score,
  p.solution_instruction_count,
  p.solution_step_count,
  p.created_at,
  gpp.used_for_daily,
  gpp.id as pool_id
FROM public.puzzles p
LEFT JOIN public.generated_puzzle_pool gpp ON p.id = gpp.puzzle_id
WHERE p.generation_source = 'generated';

-- ============================================
-- 7. Grant permissions
-- ============================================
GRANT SELECT ON public.generated_puzzles_view TO authenticated;
GRANT EXECUTE ON FUNCTION select_next_daily_puzzle() TO service_role;
GRANT EXECUTE ON FUNCTION create_daily_challenge() TO service_role;
