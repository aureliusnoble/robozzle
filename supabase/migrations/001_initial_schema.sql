-- RoboZZle Initial Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles table (extends auth.users)
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  puzzles_solved INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  longest_streak INTEGER DEFAULT 0,
  total_points INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  CONSTRAINT username_length CHECK (char_length(username) >= 3 AND char_length(username) <= 20)
);

-- Puzzles table
CREATE TABLE public.puzzles (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  grid JSONB NOT NULL,
  robot_start JSONB NOT NULL,
  function_lengths JSONB NOT NULL,
  allowed_instructions TEXT[] NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('daily', 'tutorial', 'classic')),
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert')),
  min_instructions INTEGER,
  min_steps INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Solutions table
CREATE TABLE public.solutions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  puzzle_id TEXT REFERENCES public.puzzles(id) ON DELETE CASCADE NOT NULL,
  program JSONB NOT NULL,
  steps INTEGER NOT NULL,
  instructions_used INTEGER NOT NULL,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily challenges table
CREATE TABLE public.daily_challenges (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  puzzle_id TEXT REFERENCES public.puzzles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Daily leaderboard table
CREATE TABLE public.daily_leaderboard (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  instructions_used INTEGER NOT NULL,
  steps INTEGER NOT NULL,
  points INTEGER DEFAULT 10,
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, date)
);

-- User progress table
CREATE TABLE public.user_progress (
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE PRIMARY KEY,
  tutorial_completed INTEGER[] DEFAULT '{}',
  classic_solved TEXT[] DEFAULT '{}',
  daily_solved DATE[] DEFAULT '{}',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_solutions_user_id ON public.solutions(user_id);
CREATE INDEX idx_solutions_puzzle_id ON public.solutions(puzzle_id);
CREATE INDEX idx_daily_leaderboard_date ON public.daily_leaderboard(date);
CREATE INDEX idx_daily_leaderboard_ranking ON public.daily_leaderboard(date, instructions_used, steps, completed_at);
CREATE INDEX idx_puzzles_category ON public.puzzles(category);
CREATE INDEX idx_puzzles_difficulty ON public.puzzles(difficulty);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', 'user_' || substr(NEW.id::text, 1, 8))
  );

  INSERT INTO public.user_progress (user_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_user_progress_updated_at
  BEFORE UPDATE ON public.user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Row Level Security (RLS)

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.solutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_leaderboard ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_progress ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Puzzles policies (public read)
CREATE POLICY "Puzzles are viewable by everyone"
  ON public.puzzles FOR SELECT
  USING (true);

-- Solutions policies
CREATE POLICY "Users can view own solutions"
  ON public.solutions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own solutions"
  ON public.solutions FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Daily challenges policies (public read)
CREATE POLICY "Daily challenges are viewable by everyone"
  ON public.daily_challenges FOR SELECT
  USING (true);

-- Daily leaderboard policies
CREATE POLICY "Leaderboard is viewable by everyone"
  ON public.daily_leaderboard FOR SELECT
  USING (true);

CREATE POLICY "Users can insert own leaderboard entries"
  ON public.daily_leaderboard FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- User progress policies
CREATE POLICY "Users can view own progress"
  ON public.user_progress FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own progress"
  ON public.user_progress FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own progress"
  ON public.user_progress FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Materialized view for all-time leaderboard (refresh daily via cron)
CREATE MATERIALIZED VIEW public.all_time_leaderboard AS
SELECT
  p.id,
  p.username,
  p.total_points,
  p.puzzles_solved,
  p.current_streak,
  p.longest_streak,
  ROW_NUMBER() OVER (ORDER BY p.total_points DESC, p.puzzles_solved DESC) as rank
FROM public.profiles p
WHERE p.total_points > 0
ORDER BY p.total_points DESC
LIMIT 1000;

-- Index on materialized view
CREATE UNIQUE INDEX idx_all_time_leaderboard_id ON public.all_time_leaderboard(id);

-- Function to refresh materialized view
CREATE OR REPLACE FUNCTION public.refresh_all_time_leaderboard()
RETURNS void AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.all_time_leaderboard;
END;
$$ LANGUAGE plpgsql;
