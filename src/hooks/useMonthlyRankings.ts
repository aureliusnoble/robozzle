import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { MonthlyDailyRankingEntry, ChallengeType } from '../engine/types';

function getCurrentMonth(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

function getAvailableMonths(): string[] {
  const months: string[] = [];
  const now = new Date();

  // Generate last 12 months
  for (let i = 0; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    months.push(`${year}-${month}`);
  }

  return months;
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split('-');
  const date = new Date(parseInt(year), parseInt(month) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

export function useMonthlyRankings() {
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [easyRankings, setEasyRankings] = useState<MonthlyDailyRankingEntry[]>([]);
  const [challengeRankings, setChallengeRankings] = useState<MonthlyDailyRankingEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchRankings = useCallback(async (month: string, challengeType: ChallengeType) => {
    const { data, error: fetchError } = await supabase
      .from('monthly_daily_rankings')
      .select('*, profiles(username)')
      .eq('month', month)
      .eq('challenge_type', challengeType)
      .order('total_points', { ascending: false })
      .limit(100);

    if (fetchError) {
      throw new Error(fetchError.message);
    }

    if (!data) {
      return [];
    }

    return data.map((d, index) => ({
      rank: index + 1,
      userId: d.user_id,
      username: d.profiles?.username || 'Unknown',
      totalPoints: d.total_points,
      completions: d.completions,
    }));
  }, []);

  const fetchBoth = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const [easy, challenge] = await Promise.all([
        fetchRankings(selectedMonth, 'easy'),
        fetchRankings(selectedMonth, 'challenge'),
      ]);

      setEasyRankings(easy);
      setChallengeRankings(challenge);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rankings');
    } finally {
      setIsLoading(false);
    }
  }, [selectedMonth, fetchRankings]);

  useEffect(() => {
    fetchBoth();
  }, [fetchBoth]);

  return {
    selectedMonth,
    setSelectedMonth,
    easyRankings,
    challengeRankings,
    isLoading,
    error,
    availableMonths: getAvailableMonths(),
    formatMonth,
    refresh: fetchBoth,
  };
}
