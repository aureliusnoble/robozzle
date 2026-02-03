-- Fix puzzle_leaderboard foreign key to profiles for Supabase joins
-- The puzzle_leaderboard needs a FK to profiles for the `profiles(username)` query to work

-- Add foreign key constraint to profiles (profiles.id = auth.users.id)
ALTER TABLE public.puzzle_leaderboard
  ADD CONSTRAINT fk_puzzle_leaderboard_profiles
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Also fix saved_programs to reference profiles for consistency
ALTER TABLE public.saved_programs
  ADD CONSTRAINT fk_saved_programs_profiles
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Fix classic_rankings to reference profiles
ALTER TABLE public.classic_rankings
  ADD CONSTRAINT fk_classic_rankings_profiles
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Fix monthly_daily_rankings to reference profiles
ALTER TABLE public.monthly_daily_rankings
  ADD CONSTRAINT fk_monthly_daily_rankings_profiles
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

-- Fix classic_rank_history to reference profiles
ALTER TABLE public.classic_rank_history
  ADD CONSTRAINT fk_classic_rank_history_profiles
  FOREIGN KEY (user_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;
