import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { ClassicRankingEntry } from '../engine/types';

export function useClassicLeaderboard() {
  const [rankings, setRankings] = useState<ClassicRankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Fetch current rankings
      const { data: currentData, error: currentError } = await supabase
        .from('classic_rankings')
        .select('*, profiles(username)')
        .order('score', { ascending: false })
        .limit(100);

      if (currentError) {
        throw new Error(currentError.message);
      }

      if (!currentData || currentData.length === 0) {
        setRankings([]);
        setIsLoading(false);
        return;
      }

      // Get week-ago date for movement calculation
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const weekAgoStr = weekAgo.toISOString().split('T')[0];

      // Fetch historical rankings for movement calculation
      const userIds = currentData.map((d) => d.user_id);
      const { data: historyData } = await supabase
        .from('classic_rank_history')
        .select('user_id, rank')
        .in('user_id', userIds)
        .eq('snapshot_date', weekAgoStr);

      // Create map of previous ranks
      const prevRankMap = new Map<string, number>();
      if (historyData) {
        for (const h of historyData) {
          prevRankMap.set(h.user_id, h.rank);
        }
      }

      // Build rankings with movement
      const ranked = currentData.map((d, index) => {
        const currentRank = index + 1;
        const prevRank = prevRankMap.get(d.user_id);
        const movement = prevRank !== undefined ? prevRank - currentRank : null;

        return {
          rank: currentRank,
          userId: d.user_id,
          username: d.profiles?.username || 'Unknown',
          score: parseFloat(d.score) || 0,
          weeklyMovement: movement,
        };
      });

      setRankings(ranked);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rankings');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRankings();
  }, [fetchRankings]);

  return {
    rankings,
    isLoading,
    error,
    refresh: fetchRankings,
  };
}
