import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

interface AllTimeEntry {
  rank: number;
  username: string;
  totalPoints: number;
  puzzlesSolved: number;
  currentStreak: number;
}

export function useLeaderboard() {
  const [allTimeLeaderboard, setAllTimeLeaderboard] = useState<AllTimeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLeaderboard = async () => {
      setIsLoading(true);

      const { data, error } = await supabase
        .from('profiles')
        .select('username, total_points, puzzles_solved, current_streak')
        .order('total_points', { ascending: false })
        .limit(100);

      if (!error && data) {
        const entries = data.map((d, index) => ({
          rank: index + 1,
          username: d.username,
          totalPoints: d.total_points,
          puzzlesSolved: d.puzzles_solved,
          currentStreak: d.current_streak,
        }));
        setAllTimeLeaderboard(entries);
      }

      setIsLoading(false);
    };

    fetchLeaderboard();
  }, []);

  return {
    allTimeLeaderboard,
    isLoading,
  };
}

// Hook for getting user's personal stats
export function useUserStats(userId: string | null) {
  const [stats, setStats] = useState<{
    totalSolutions: number;
    averageInstructions: number;
    averageSteps: number;
    bestRank: number;
  } | null>(null);

  useEffect(() => {
    if (!userId) return;

    const fetchStats = async () => {
      // Get all user solutions
      const { data: solutions } = await supabase
        .from('solutions')
        .select('instructions_used, steps')
        .eq('user_id', userId);

      // Get best daily rank
      const { data: ranks } = await supabase
        .from('daily_leaderboard')
        .select('points')
        .eq('user_id', userId)
        .order('points', { ascending: false })
        .limit(1);

      if (solutions && solutions.length > 0) {
        const totalSolutions = solutions.length;
        const avgInstructions = solutions.reduce((a, s) => a + s.instructions_used, 0) / totalSolutions;
        const avgSteps = solutions.reduce((a, s) => a + s.steps, 0) / totalSolutions;

        setStats({
          totalSolutions,
          averageInstructions: Math.round(avgInstructions * 10) / 10,
          averageSteps: Math.round(avgSteps * 10) / 10,
          bestRank: ranks?.[0]?.points || 0,
        });
      }
    };

    fetchStats();
  }, [userId]);

  return stats;
}
