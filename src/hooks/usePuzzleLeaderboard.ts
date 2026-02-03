import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { PuzzleLeaderboardEntry, Program } from '../engine/types';
import { useAuthStore } from '../stores/authStore';

const ANON_SUBMISSIONS_KEY = 'robozzle-anon-submissions';

// Get anonymous submissions from localStorage
function getAnonSubmissions(): string[] {
  try {
    const stored = localStorage.getItem(ANON_SUBMISSIONS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

// Add anonymous submission to localStorage
function addAnonSubmission(puzzleId: string): void {
  const submissions = getAnonSubmissions();
  if (!submissions.includes(puzzleId)) {
    submissions.push(puzzleId);
    localStorage.setItem(ANON_SUBMISSIONS_KEY, JSON.stringify(submissions));
  }
}

// Assign ranks to leaderboard entries
function assignPuzzleRanks(
  entries: Omit<PuzzleLeaderboardEntry, 'rank'>[]
): PuzzleLeaderboardEntry[] {
  // Sort by solution quality: fewer instructions, then fewer steps, then earlier submission
  const sorted = [...entries].sort((a, b) => {
    if (a.instructionsUsed !== b.instructionsUsed) {
      return a.instructionsUsed - b.instructionsUsed;
    }
    if (a.steps !== b.steps) {
      return a.steps - b.steps;
    }
    return a.submittedAt.getTime() - b.submittedAt.getTime();
  });

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
  }));
}

export function usePuzzleLeaderboard(puzzleId: string | undefined) {
  const [leaderboard, setLeaderboard] = useState<PuzzleLeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();

  // Check if current user has submitted
  const checkSubmission = useCallback(async () => {
    if (!puzzleId) return false;

    // Check anonymous submissions first
    const anonSubmissions = getAnonSubmissions();
    if (anonSubmissions.includes(puzzleId)) {
      return true;
    }

    // Check authenticated user's submissions
    if (user) {
      const { data } = await supabase
        .from('puzzle_leaderboard')
        .select('id')
        .eq('puzzle_id', puzzleId)
        .eq('user_id', user.id)
        .single();

      return !!data;
    }

    return false;
  }, [puzzleId, user]);

  // Fetch leaderboard data
  const fetchLeaderboard = useCallback(async () => {
    if (!puzzleId) {
      setLeaderboard([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { data, error: fetchError } = await supabase
        .from('puzzle_leaderboard')
        .select('*, profiles(username)')
        .eq('puzzle_id', puzzleId)
        .order('instructions_used', { ascending: true })
        .order('steps', { ascending: true })
        .order('submitted_at', { ascending: true })
        .limit(100);

      if (fetchError) {
        setError(fetchError.message);
        setLeaderboard([]);
      } else if (data) {
        const entries = data.map((d) => ({
          userId: d.user_id,
          username: d.profiles?.username || 'Anonymous',
          instructionsUsed: d.instructions_used,
          steps: d.steps,
          submittedAt: new Date(d.submitted_at),
          isLate: d.is_late,
        }));

        setLeaderboard(assignPuzzleRanks(entries));
      }

      // Check if user has submitted
      const submitted = await checkSubmission();
      setHasSubmitted(submitted);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch leaderboard');
      setLeaderboard([]);
    } finally {
      setIsLoading(false);
    }
  }, [puzzleId, checkSubmission]);

  // Submit solution to leaderboard
  const submitSolution = useCallback(
    async (
      program: Program,
      steps: number,
      instructionsUsed: number,
      isLate = false
    ): Promise<{ success: boolean; error?: string }> => {
      if (!puzzleId) {
        return { success: false, error: 'No puzzle selected' };
      }

      // Check if already submitted
      const alreadySubmitted = await checkSubmission();
      if (alreadySubmitted) {
        return { success: false, error: 'Already submitted to this puzzle' };
      }

      setIsSubmitting(true);
      setError(null);

      try {
        const { error: insertError } = await supabase
          .from('puzzle_leaderboard')
          .insert({
            user_id: user?.id || null,
            puzzle_id: puzzleId,
            instructions_used: instructionsUsed,
            steps: steps,
            program: program as unknown as Record<string, unknown>,
            is_late: isLate,
          });

        if (insertError) {
          setError(insertError.message);
          return { success: false, error: insertError.message };
        }

        // Track anonymous submission
        if (!user) {
          addAnonSubmission(puzzleId);
        }

        setHasSubmitted(true);

        // Refresh leaderboard
        await fetchLeaderboard();

        return { success: true };
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : 'Failed to submit';
        setError(errorMsg);
        return { success: false, error: errorMsg };
      } finally {
        setIsSubmitting(false);
      }
    },
    [puzzleId, user, checkSubmission, fetchLeaderboard]
  );

  // Load another user's solution (only if current user has submitted)
  const loadSolution = useCallback(
    async (userId: string | null): Promise<Program | null> => {
      if (!puzzleId || !hasSubmitted) {
        return null;
      }

      try {
        const { data, error: fetchError } = await supabase
          .from('puzzle_leaderboard')
          .select('program')
          .eq('puzzle_id', puzzleId)
          .eq('user_id', userId)
          .single();

        if (fetchError || !data) {
          return null;
        }

        return data.program as unknown as Program;
      } catch {
        return null;
      }
    },
    [puzzleId, hasSubmitted]
  );

  // Initial fetch and real-time subscription
  useEffect(() => {
    if (!puzzleId) {
      setLeaderboard([]);
      setHasSubmitted(false);
      setIsLoading(false);
      return;
    }

    fetchLeaderboard();

    // Subscribe to real-time updates
    const subscription = supabase
      .channel(`puzzle_leaderboard_${puzzleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'puzzle_leaderboard',
          filter: `puzzle_id=eq.${puzzleId}`,
        },
        () => {
          fetchLeaderboard();
        }
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [puzzleId, fetchLeaderboard]);

  return {
    leaderboard,
    isLoading,
    hasSubmitted,
    isSubmitting,
    error,
    submitSolution,
    loadSolution,
    refresh: fetchLeaderboard,
  };
}
