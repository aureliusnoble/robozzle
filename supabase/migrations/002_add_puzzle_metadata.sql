-- Add author and difficulty metadata columns to puzzles table

-- Add new columns
ALTER TABLE public.puzzles
ADD COLUMN IF NOT EXISTS author TEXT,
ADD COLUMN IF NOT EXISTS stars INTEGER CHECK (stars >= 1 AND stars <= 20),
ADD COLUMN IF NOT EXISTS community_difficulty NUMERIC(4, 2);

-- Update difficulty constraint to include 'impossible'
ALTER TABLE public.puzzles
DROP CONSTRAINT IF EXISTS puzzles_difficulty_check;

ALTER TABLE public.puzzles
ADD CONSTRAINT puzzles_difficulty_check
CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'impossible'));

-- Add index on stars for filtering
CREATE INDEX IF NOT EXISTS idx_puzzles_stars ON public.puzzles(stars);
