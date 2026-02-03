import { useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';

const LOCAL_STREAK_KEY = 'robozzle-streak';

interface LocalStreak {
  currentStreak: number;
  longestStreak: number;
  lastDailyDate: string | null;
}

// Get local streak data
function getLocalStreak(): LocalStreak {
  try {
    const stored = localStorage.getItem(LOCAL_STREAK_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch {
    // Ignore parse errors
  }
  return {
    currentStreak: 0,
    longestStreak: 0,
    lastDailyDate: null,
  };
}

// Save local streak data
function setLocalStreak(streak: LocalStreak): void {
  localStorage.setItem(LOCAL_STREAK_KEY, JSON.stringify(streak));
}

// Get yesterday's date string in YYYY-MM-DD format
function getYesterday(): string {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Get today's date string in YYYY-MM-DD format
function getToday(): string {
  return new Date().toISOString().split('T')[0];
}

export function useStreakTracker() {
  const { user } = useAuthStore();

  // Check and update streak on daily completion
  const updateStreak = useCallback(async (completedDate: string) => {
    const today = getToday();
    const yesterday = getYesterday();

    // Get current streak data
    let currentStreak = user?.currentStreak || 0;
    let longestStreak = user?.longestStreak || 0;
    const lastDailyDate = user?.lastDailyDate;

    // Determine new streak value
    if (completedDate === today) {
      if (lastDailyDate === yesterday) {
        // Continue streak
        currentStreak += 1;
      } else if (lastDailyDate !== today) {
        // Start new streak (or first completion today)
        currentStreak = 1;
      }
      // If lastDailyDate === today, streak already counted for today
    }

    // Update longest streak if necessary
    if (currentStreak > longestStreak) {
      longestStreak = currentStreak;
    }

    // Save locally
    setLocalStreak({
      currentStreak,
      longestStreak,
      lastDailyDate: today,
    });

    // If authenticated, update in Supabase
    if (user) {
      try {
        await supabase
          .from('profiles')
          .update({
            current_streak: currentStreak,
            longest_streak: longestStreak,
            last_daily_date: today,
          })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Failed to update streak in Supabase:', err);
      }
    }

    return { currentStreak, longestStreak };
  }, [user]);

  // Check streak validity on app load (reset if day was missed)
  const checkStreak = useCallback(async () => {
    if (!user) return;

    const today = getToday();
    const yesterday = getYesterday();
    const lastDailyDate = user.lastDailyDate;

    // If last daily was before yesterday, streak is broken
    if (lastDailyDate && lastDailyDate !== today && lastDailyDate !== yesterday) {
      // Reset current streak but keep longest
      const localStreak = getLocalStreak();

      // Save reset streak locally
      setLocalStreak({
        ...localStreak,
        currentStreak: 0,
        lastDailyDate,
      });

      // Update in Supabase
      try {
        await supabase
          .from('profiles')
          .update({
            current_streak: 0,
          })
          .eq('id', user.id);
      } catch (err) {
        console.warn('Failed to reset streak in Supabase:', err);
      }
    }
  }, [user]);

  // Merge local and Supabase streaks on login
  const mergeStreaks = useCallback(async () => {
    if (!user) return;

    const localStreak = getLocalStreak();
    const supabaseStreak = {
      currentStreak: user.currentStreak || 0,
      longestStreak: user.longestStreak || 0,
      lastDailyDate: user.lastDailyDate,
    };

    // Take the higher longest streak
    const mergedLongestStreak = Math.max(
      localStreak.longestStreak,
      supabaseStreak.longestStreak
    );

    // For current streak, use the one with the more recent lastDailyDate
    let mergedCurrentStreak = supabaseStreak.currentStreak;
    let mergedLastDailyDate = supabaseStreak.lastDailyDate;

    if (localStreak.lastDailyDate) {
      if (!supabaseStreak.lastDailyDate || localStreak.lastDailyDate > supabaseStreak.lastDailyDate) {
        mergedCurrentStreak = localStreak.currentStreak;
        mergedLastDailyDate = localStreak.lastDailyDate;
      }
    }

    // Update both local and Supabase with merged values
    setLocalStreak({
      currentStreak: mergedCurrentStreak,
      longestStreak: mergedLongestStreak,
      lastDailyDate: mergedLastDailyDate,
    });

    try {
      await supabase
        .from('profiles')
        .update({
          current_streak: mergedCurrentStreak,
          longest_streak: mergedLongestStreak,
          last_daily_date: mergedLastDailyDate,
        })
        .eq('id', user.id);
    } catch (err) {
      console.warn('Failed to merge streaks in Supabase:', err);
    }
  }, [user]);

  // Check streak on mount
  useEffect(() => {
    if (user) {
      checkStreak();
    }
  }, [user, checkStreak]);

  return {
    updateStreak,
    checkStreak,
    mergeStreaks,
  };
}
