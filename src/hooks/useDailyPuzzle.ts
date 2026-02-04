import { useEffect, useState, useCallback } from 'react';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry, Program, ChallengeType } from '../engine/types';
import { assignRanks } from '../lib/scoring';

// Star values for daily puzzles
export const DAILY_STAR_VALUES = {
  easy: 5,
  challenge: 10,
} as const;

export function useDailyPuzzle(challengeType: ChallengeType = 'challenge') {
  const { dailyChallenge, isLoadingDaily, loadDailyChallenge, loadDailyChallengeForDate } = usePuzzleStore();
  const { user, progress, updateProgress, addClassicStars, updateHardestPuzzle } = useAuthStore();
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
        .select('*, profiles(username), user_skins(selected_skin)')
        .eq('date', dailyChallenge.date)
        .eq('challenge_type', challengeType)
        .order('instructions_used', { ascending: true })
        .order('steps', { ascending: true })
        .order('completed_at', { ascending: true })
        .limit(100);

      if (!error && data) {
        const entries = data.map(d => ({
          userId: d.user_id,
          username: d.profiles?.username || 'Anonymous',
          instructionsUsed: d.instructions_used,
          steps: d.steps,
          completedAt: new Date(d.completed_at),
          rank: 0,
          points: 0,
          selectedSkin: d.user_skins?.selected_skin || 'default',
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

      // Grant stars for first-time completion (5 for easy, 10 for challenge)
      const stars = DAILY_STAR_VALUES[challengeType];
      await addClassicStars(stars);
      await updateHardestPuzzle(stars);

      setHasCompleted(true);
    } catch (err) {
      console.error('Error submitting solution:', err);
    }
  };

  // Load another user's solution
  const loadSolution = useCallback(async (userId: string | null): Promise<{ program: Program; selectedSkin: string } | null> => {
    if (!dailyChallenge || !hasCompleted) {
      return null;
    }

    try {
      const { data, error } = await supabase
        .from('solutions')
        .select('program')
        .eq('puzzle_id', dailyChallenge.puzzleId)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) {
        return null;
      }

      // Fetch the user's skin
      const { data: skinData } = await supabase
        .from('user_skins')
        .select('selected_skin')
        .eq('user_id', userId)
        .maybeSingle();

      return {
        program: data.program as unknown as Program,
        selectedSkin: skinData?.selected_skin || 'default',
      };
    } catch {
      return null;
    }
  }, [dailyChallenge, hasCompleted]);

  return {
    dailyChallenge,
    isLoadingDaily,
    leaderboard,
    userRank,
    hasCompleted,
    submitSolution,
    loadSpecificDate,
    loadSolution,
    challengeType,
  };
}
