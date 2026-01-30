import { useEffect, useState } from 'react';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, Program } from '../engine/types';
import { assignRanks } from '../lib/scoring';

export function useDailyPuzzle() {
  const { dailyChallenge, isLoadingDaily, loadDailyChallenge } = usePuzzleStore();
  const { user, progress, updateProgress } = useAuthStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);

  // Load daily challenge on mount
  useEffect(() => {
    loadDailyChallenge();
  }, [loadDailyChallenge]);

  // Check if user has completed today's challenge
  useEffect(() => {
    if (dailyChallenge && progress) {
      const completed = progress.dailySolved.includes(dailyChallenge.date);
      setHasCompleted(completed);
    }
  }, [dailyChallenge, progress]);

  // Load leaderboard
  useEffect(() => {
    if (!dailyChallenge) return;

    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('daily_leaderboard')
        .select('*, profiles(username)')
        .eq('date', dailyChallenge.date)
        .order('instructions_used', { ascending: true })
        .order('steps', { ascending: true })
        .order('completed_at', { ascending: true })
        .limit(100);

      if (!error && data) {
        const entries = data.map(d => ({
          username: d.profiles?.username || 'Anonymous',
          instructionsUsed: d.instructions_used,
          steps: d.steps,
          completedAt: new Date(d.completed_at),
          rank: 0,
          points: 0,
        }));

        const rankedEntries = assignRanks(entries);
        setLeaderboard(rankedEntries);

        // Find user's rank
        if (user) {
          const userEntry = rankedEntries.find(e => e.username === user.username);
          setUserRank(userEntry?.rank || null);
        }
      }
    };

    fetchLeaderboard();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel('daily_leaderboard')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_leaderboard',
        filter: `date=eq.${dailyChallenge.date}`,
      }, () => {
        fetchLeaderboard();
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [dailyChallenge, user]);

  // Submit solution
  const submitSolution = async (program: Program, steps: number, instructionsUsed: number) => {
    if (!user || !dailyChallenge || hasCompleted) return;

    const date = dailyChallenge.date;

    // Save solution
    await supabase.from('solutions').insert({
      user_id: user.id,
      puzzle_id: dailyChallenge.puzzleId,
      program,
      steps,
      instructions_used: instructionsUsed,
    });

    // Add to leaderboard
    await supabase.from('daily_leaderboard').insert({
      user_id: user.id,
      date,
      instructions_used: instructionsUsed,
      steps,
      points: 10, // Will be recalculated
      completed_at: new Date().toISOString(),
    });

    // Update user progress
    await updateProgress({
      dailySolved: [...(progress?.dailySolved || []), date],
    });

    setHasCompleted(true);
  };

  return {
    dailyChallenge,
    isLoadingDaily,
    leaderboard,
    userRank,
    hasCompleted,
    submitSolution,
  };
}
