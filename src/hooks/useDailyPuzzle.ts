import { useEffect, useState, useCallback } from 'react';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, Program, ChallengeType } from '../engine/types';
import { assignRanks } from '../lib/scoring';

export function useDailyPuzzle(challengeType: ChallengeType = 'challenge') {
  const { dailyChallenge, isLoadingDaily, loadDailyChallenge, loadDailyChallengeForDate } = usePuzzleStore();
  const { user, progress, updateProgress } = useAuthStore();
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [hasCompleted, setHasCompleted] = useState(false);

  // Load daily challenge on mount
  useEffect(() => {
    loadDailyChallenge(challengeType);
  }, [loadDailyChallenge, challengeType]);

  // Load a specific date's challenge
  const loadSpecificDate = useCallback((date: string) => {
    if (loadDailyChallengeForDate) {
      loadDailyChallengeForDate(date, challengeType);
    }
  }, [loadDailyChallengeForDate, challengeType]);

  // Check if user has completed this challenge
  useEffect(() => {
    if (dailyChallenge && progress) {
      // Check if this specific date + challenge type is completed
      // The dailySolved array format: "YYYY-MM-DD" or "YYYY-MM-DD:easy"/"YYYY-MM-DD:challenge"
      const dateKey = `${dailyChallenge.date}:${challengeType}`;
      const legacyKey = dailyChallenge.date; // For backwards compatibility
      const completed = progress.dailySolved.includes(dateKey) ||
        (challengeType === 'challenge' && progress.dailySolved.includes(legacyKey));
      setHasCompleted(completed);
    }
  }, [dailyChallenge, progress, challengeType]);

  // Load leaderboard
  useEffect(() => {
    if (!dailyChallenge) return;

    const fetchLeaderboard = async () => {
      const { data, error } = await supabase
        .from('daily_leaderboard')
        .select('*, profiles(username)')
        .eq('date', dailyChallenge.date)
        .eq('challenge_type', challengeType)
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
      .channel(`daily_leaderboard_${challengeType}`)
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
  }, [dailyChallenge, user, challengeType]);

  // Submit solution
  const submitSolution = async (program: Program, steps: number, instructionsUsed: number) => {
    if (!user || !dailyChallenge || hasCompleted) return;

    const date = dailyChallenge.date;
    const dateKey = `${date}:${challengeType}`;

    try {
      // Save solution (ignore conflict if already exists)
      await supabase.from('solutions').upsert({
        user_id: user.id,
        puzzle_id: dailyChallenge.puzzleId,
        program,
        steps,
        instructions_used: instructionsUsed,
      }, { onConflict: 'user_id,puzzle_id' });

      // Add to leaderboard (ignore conflict if already exists)
      await supabase.from('daily_leaderboard').upsert({
        user_id: user.id,
        date,
        challenge_type: challengeType,
        instructions_used: instructionsUsed,
        steps,
        points: 10, // Will be recalculated
        completed_at: new Date().toISOString(),
      }, { onConflict: 'user_id,date,challenge_type', ignoreDuplicates: true });

      // Update user progress with the date:challengeType format
      await updateProgress({
        dailySolved: [...(progress?.dailySolved || []), dateKey],
      });

      setHasCompleted(true);
    } catch (err) {
      console.error('Error submitting solution:', err);
    }
  };

  return {
    dailyChallenge,
    isLoadingDaily,
    leaderboard,
    userRank,
    hasCompleted,
    submitSolution,
    loadSpecificDate,
    challengeType,
  };
}
