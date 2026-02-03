import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { LeaderboardEntry } from '../engine/types';
import { assignRanks } from '../lib/scoring';

export function useDailyLeaderboards() {
  const [easyLeaderboard, setEasyLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [challengeLeaderboard, setChallengeLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];

    const fetchLeaderboard = async (challengeType: 'easy' | 'challenge') => {
      const { data, error } = await supabase
        .from('daily_leaderboard')
        .select('*, profiles(username)')
        .eq('date', today)
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
        }));

        return assignRanks(entries);
      }

      return [];
    };

    const fetchBoth = async () => {
      setIsLoading(true);

      const [easy, challenge] = await Promise.all([
        fetchLeaderboard('easy'),
        fetchLeaderboard('challenge'),
      ]);

      setEasyLeaderboard(easy);
      setChallengeLeaderboard(challenge);
      setIsLoading(false);
    };

    fetchBoth();

    // Subscribe to real-time updates for both leaderboards
    const easySubscription = supabase
      .channel('daily_leaderboard_easy_home')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_leaderboard',
        filter: `date=eq.${today}`,
      }, async () => {
        const easy = await fetchLeaderboard('easy');
        setEasyLeaderboard(easy);
      })
      .subscribe();

    const challengeSubscription = supabase
      .channel('daily_leaderboard_challenge_home')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'daily_leaderboard',
        filter: `date=eq.${today}`,
      }, async () => {
        const challenge = await fetchLeaderboard('challenge');
        setChallengeLeaderboard(challenge);
      })
      .subscribe();

    return () => {
      easySubscription.unsubscribe();
      challengeSubscription.unsubscribe();
    };
  }, []);

  return {
    easyLeaderboard,
    challengeLeaderboard,
    isLoading,
  };
}
