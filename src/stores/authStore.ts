import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserProgress } from '../engine/types';
import { calculateClassicScore, buildPuzzlesByStarsMap } from '../lib/classicScoring';
import { useOnboardingStore } from './onboardingStore';
import { getUserLocalDate, getBrowserTimezone, daysBetween } from '../lib/dateUtils';

interface AuthStore {
  user: UserProfile | null;
  progress: UserProgress | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  needsUsername: boolean; // True when Google user needs to set username
  devModeEnabled: boolean; // When false, devs see the site as regular users
  pendingStarAnimation: number | null; // Number of stars to animate flying to header
  starsAnimatedSoFar: number; // Counter for stars that have landed during animation
  pendingStreakAnimation: boolean; // Whether to show streak fire animation
  lastClassicStarsDate: string | null; // Date when user last earned classic stars (YYYY-MM-DD)

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  fetchProgress: () => Promise<void>;
  updateProgress: (progress: Partial<UserProgress>) => Promise<void>;
  setUsername: (username: string) => Promise<{ error?: string }>;
  addClassicStars: (stars: number, animate?: boolean) => Promise<void>;
  updateHardestPuzzle: (stars: number) => Promise<void>;
  updateClassicRanking: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error?: string }>;
  toggleDevMode: () => void;
  isDevUser: () => boolean; // Returns true if user has dev/admin role AND devModeEnabled is true
  triggerStarAnimation: (stars: number) => void;
  incrementAnimatedStars: () => void;
  clearStarAnimation: () => void;
  triggerStreakAnimation: () => void;
  clearStreakAnimation: () => void;
  updateStreakFromDaily: (date: string) => Promise<{ isNewStreakDay: boolean; newStreak: number }>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      progress: null,
      isLoading: true,
      isAuthenticated: false,
      needsUsername: false,
      devModeEnabled: true, // Default to enabled for devs
      pendingStarAnimation: null,
      starsAnimatedSoFar: 0,
      pendingStreakAnimation: false,
      lastClassicStarsDate: null,

      signIn: async (email: string, password: string) => {
        try {
          const { error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });

          if (error) {
            return { error: error.message };
          }

          await get().fetchProfile();
          await get().fetchProgress();
          return {};
        } catch {
          return { error: 'An unexpected error occurred' };
        }
      },

      signUp: async (email: string, password: string, username: string) => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { username },
            },
          });

          if (error) {
            return { error: error.message };
          }

          if (data.user) {
            // Profile will be created by database trigger
            await get().fetchProfile();
          }

          return {};
        } catch {
          return { error: 'An unexpected error occurred' };
        }
      },

      signInWithGoogle: async () => {
        try {
          // Use the full URL including path (e.g., /robozzle/ for GitHub Pages)
          const baseUrl = window.location.origin + window.location.pathname;
          // Remove trailing hash or query params, ensure it ends with /
          const redirectUrl = baseUrl.split('#')[0].split('?')[0].replace(/\/$/, '') + '/';

          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: redirectUrl,
            },
          });

          if (error) {
            return { error: error.message };
          }

          return {};
        } catch {
          return { error: 'An unexpected error occurred' };
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, progress: null, isAuthenticated: false, needsUsername: false });
      },

      resetPassword: async (email: string) => {
        try {
          const baseUrl = window.location.origin + window.location.pathname;
          const redirectUrl = baseUrl.split('#')[0].split('?')[0].replace(/\/$/, '') + '/';

          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl,
          });

          if (error) {
            return { error: error.message };
          }

          return {};
        } catch {
          return { error: 'An unexpected error occurred' };
        }
      },

      fetchProfile: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) {
            set({ user: null, isAuthenticated: false, isLoading: false, needsUsername: false });
            return;
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .maybeSingle();

          if (profile) {
            // Check if this is a Google user without a proper username
            // Google users get auto-generated usernames like "user_abc123" from the trigger
            const isAutoGeneratedUsername = profile.username?.startsWith('user_') || !profile.username;
            const isGoogleUser = user.app_metadata?.provider === 'google';

            if (isGoogleUser && isAutoGeneratedUsername) {
              // User needs to set a username
              set({
                user: null,
                isAuthenticated: false,
                isLoading: false,
                needsUsername: true,
              });
            } else {
              // Merge local and remote lastClassicStarsDate (take the more recent)
              const localDate = get().lastClassicStarsDate;
              const remoteDate = profile.last_classic_stars_date;
              const mergedLastClassicStarsDate = localDate && remoteDate
                ? (localDate > remoteDate ? localDate : remoteDate)
                : localDate || remoteDate || null;

              // Get user's browser timezone and check if we need to update it
              const browserTimezone = getBrowserTimezone();
              const profileTimezone = profile.timezone || 'UTC';

              set({
                user: {
                  id: profile.id,
                  username: profile.username,
                  email: user.email || '',
                  role: profile.role || null,
                  puzzlesSolved: profile.puzzles_solved,
                  currentStreak: profile.current_streak,
                  longestStreak: profile.longest_streak,
                  totalPoints: profile.total_points,
                  classicStars: profile.classic_stars || 0,
                  hardestPuzzleStars: profile.hardest_puzzle_stars || 0,
                  bestDailyEasyRank: profile.best_daily_easy_rank,
                  bestDailyChallengeRank: profile.best_daily_challenge_rank,
                  lastDailyDate: profile.last_daily_date,
                  lastClassicStarsDate: mergedLastClassicStarsDate,
                  timezone: browserTimezone, // Always use browser timezone
                  createdAt: new Date(profile.created_at),
                },
                lastClassicStarsDate: mergedLastClassicStarsDate,
                isAuthenticated: true,
                isLoading: false,
                needsUsername: false,
              });

              // Bidirectional sync of hard puzzle completion flag
              if ((profile.hardest_puzzle_stars || 0) >= 5) {
                localStorage.setItem('robozzle-completed-hard-puzzle', 'true');
              }
              const localHardFlag = localStorage.getItem('robozzle-completed-hard-puzzle') === 'true';
              if (localHardFlag && (profile.hardest_puzzle_stars || 0) < 5) {
                supabase
                  .from('profiles')
                  .update({ hardest_puzzle_stars: 5 })
                  .eq('id', profile.id)
                  .then(() => {});
              }

              // Update Supabase if timezone changed or last classic stars date needs sync
              const needsTimezoneUpdate = profileTimezone !== browserTimezone;
              const needsDateUpdate = localDate && (!remoteDate || localDate > remoteDate);

              if (needsTimezoneUpdate || needsDateUpdate) {
                const updateData: Record<string, string> = {};
                if (needsTimezoneUpdate) updateData.timezone = browserTimezone;
                if (needsDateUpdate) updateData.last_classic_stars_date = localDate;

                supabase
                  .from('profiles')
                  .update(updateData)
                  .eq('id', profile.id)
                  .then(() => {});
              }
            }
          } else {
            // No profile yet - if Google user, they need to create username
            const isGoogleUser = user.app_metadata?.provider === 'google';
            set({
              isLoading: false,
              needsUsername: isGoogleUser,
            });
          }
        } catch (err) {
          console.error('Error fetching profile:', err);
          set({ isLoading: false });
        }
      },

      fetchProgress: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) return;

          const { data: remoteProgress } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user.id)
            .maybeSingle();

          // Get current local progress
          const localProgress = get().progress;

          // Merge local and remote progress (union of arrays, keeping unique values)
          const mergeArrays = <T>(local: T[] | undefined, remote: T[] | undefined): T[] => {
            const combined = [...(local || []), ...(remote || [])];
            return [...new Set(combined)];
          };

          const remoteTutorialCompleted = remoteProgress?.tutorial_completed || [];
          const remoteClassicSolved = remoteProgress?.classic_solved || [];
          const remoteDailySolved = remoteProgress?.daily_solved || [];

          const mergedProgress: UserProgress = {
            tutorialCompleted: mergeArrays(localProgress?.tutorialCompleted, remoteTutorialCompleted),
            classicSolved: mergeArrays(localProgress?.classicSolved, remoteClassicSolved),
            dailySolved: mergeArrays(localProgress?.dailySolved, remoteDailySolved),
          };

          // Update local state with merged progress
          set({ progress: mergedProgress });

          // Sync onboarding store with merged tutorial progress
          useOnboardingStore.getState().syncWithProgress(mergedProgress.tutorialCompleted);

          // Check if local had data that remote didn't - if so, push merged data back to Supabase
          const hasNewTutorials = localProgress?.tutorialCompleted?.some(t => !remoteTutorialCompleted.includes(t));
          const hasNewClassic = localProgress?.classicSolved?.some(c => !remoteClassicSolved.includes(c));
          const hasNewDaily = localProgress?.dailySolved?.some(d => !remoteDailySolved.includes(d));

          if (hasNewTutorials || hasNewClassic || hasNewDaily) {
            await supabase
              .from('user_progress')
              .upsert({
                user_id: user.id,
                tutorial_completed: mergedProgress.tutorialCompleted,
                classic_solved: mergedProgress.classicSolved,
                daily_solved: mergedProgress.dailySolved,
              }, { onConflict: 'user_id' });
          }
        } catch (err) {
          console.error('Error fetching progress:', err);
        }
      },

      setUsername: async (username: string) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) {
            return { error: 'Not authenticated' };
          }

          // Check if username is already taken
          const { data: existing } = await supabase
            .from('profiles')
            .select('id')
            .eq('username', username)
            .neq('id', user.id)
            .maybeSingle();

          if (existing) {
            return { error: 'Username is already taken' };
          }

          // Try to update the profile first (should exist from signup trigger)
          const { error: updateError, count } = await supabase
            .from('profiles')
            .update({ username: username })
            .eq('id', user.id)
            .select();

          // If update didn't affect any rows, the profile might not exist - create it
          if (updateError || count === 0) {
            const { error: insertError } = await supabase
              .from('profiles')
              .insert({
                id: user.id,
                username: username,
              });

            if (insertError) {
              // If insert also fails, return the original update error or insert error
              return { error: insertError.message || updateError?.message || 'Failed to save username' };
            }
          }

          // Fetch the updated profile
          set({ needsUsername: false });
          await get().fetchProfile();
          await get().fetchProgress();

          return {};
        } catch (err) {
          console.error('Error setting username:', err);
          return { error: 'An unexpected error occurred' };
        }
      },

      updateProgress: async (newProgress: Partial<UserProgress>) => {
        try {
          const { progress } = get();

          // Merge new progress with existing progress
          const mergedProgress: UserProgress = {
            tutorialCompleted: newProgress.tutorialCompleted || progress?.tutorialCompleted || [],
            classicSolved: newProgress.classicSolved || progress?.classicSolved || [],
            dailySolved: newProgress.dailySolved || progress?.dailySolved || [],
          };

          // Always update local state (this gets persisted via zustand persist)
          set({ progress: mergedProgress });

          // If authenticated, also save to Supabase
          const { data: { user } } = await supabase.auth.getUser();
          if (user) {
            await supabase
              .from('user_progress')
              .upsert({
                user_id: user.id,
                tutorial_completed: mergedProgress.tutorialCompleted,
                classic_solved: mergedProgress.classicSolved,
                daily_solved: mergedProgress.dailySolved,
              }, { onConflict: 'user_id' });
          }
        } catch (err) {
          console.error('Error updating progress:', err);
        }
      },

      addClassicStars: async (stars: number, animate = true) => {
        try {
          const { user } = get();
          if (!user) return;

          // Trigger animation if requested
          if (animate) {
            set({ pendingStarAnimation: stars });
          }

          const newStars = (user.classicStars || 0) + stars;
          const today = new Date().toISOString().split('T')[0];

          // Update local state
          set({
            user: {
              ...user,
              classicStars: newStars,
              lastClassicStarsDate: today,
            },
            lastClassicStarsDate: today,
          });

          // Update in Supabase
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            await supabase
              .from('profiles')
              .update({ classic_stars: newStars, last_classic_stars_date: today })
              .eq('id', authUser.id);
          }
        } catch (err) {
          console.error('Error updating classic stars:', err);
        }
      },

      updateHardestPuzzle: async (stars: number) => {
        try {
          const { user } = get();
          if (!user) return;

          // Only update if this puzzle is harder than previous hardest
          if (stars <= (user.hardestPuzzleStars || 0)) return;

          // Update local state
          set({
            user: {
              ...user,
              hardestPuzzleStars: stars,
            },
          });

          // Update in Supabase
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            await supabase
              .from('profiles')
              .update({ hardest_puzzle_stars: stars })
              .eq('id', authUser.id);
          }
        } catch (err) {
          console.error('Error updating hardest puzzle:', err);
        }
      },

      updateClassicRanking: async () => {
        try {
          const { user, progress } = get();
          if (!user || !progress) return;

          const solvedPuzzles = progress.classicSolved || [];
          if (solvedPuzzles.length === 0) return;

          // Fetch star ratings for all solved puzzles
          const { data: puzzlesData, error: puzzlesError } = await supabase
            .from('puzzles')
            .select('id, stars')
            .in('id', solvedPuzzles);

          if (puzzlesError || !puzzlesData) {
            console.error('Error fetching puzzle stars:', puzzlesError);
            return;
          }

          // Build star map
          const puzzleStarsMap = new Map<string, number>();
          for (const p of puzzlesData) {
            if (p.stars) {
              puzzleStarsMap.set(p.id, p.stars);
            }
          }

          // Calculate score
          const puzzlesByStars = buildPuzzlesByStarsMap(solvedPuzzles, puzzleStarsMap);
          const score = calculateClassicScore(puzzlesByStars);

          // Upsert to classic_rankings
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            await supabase
              .from('classic_rankings')
              .upsert({
                user_id: authUser.id,
                score: score,
              }, { onConflict: 'user_id' });
          }
        } catch (err) {
          console.error('Error updating classic ranking:', err);
        }
      },

      toggleDevMode: () => {
        set((state) => ({ devModeEnabled: !state.devModeEnabled }));
      },

      isDevUser: () => {
        const { user, devModeEnabled } = get();
        const hasDevRole = user?.role === 'admin' || user?.role === 'dev';
        return hasDevRole && devModeEnabled;
      },

      triggerStarAnimation: (stars: number) => {
        set({ pendingStarAnimation: stars, starsAnimatedSoFar: 0 });
      },

      incrementAnimatedStars: () => {
        set((state) => ({ starsAnimatedSoFar: state.starsAnimatedSoFar + 1 }));
      },

      clearStarAnimation: () => {
        set({ pendingStarAnimation: null, starsAnimatedSoFar: 0 });
      },

      triggerStreakAnimation: () => {
        set({ pendingStreakAnimation: true });
      },

      clearStreakAnimation: () => {
        set({ pendingStreakAnimation: false });
      },

      updateStreakFromDaily: async (date: string) => {
        const { user } = get();
        if (!user) return { isNewStreakDay: false, newStreak: 0 };

        // Use user's timezone for all date calculations
        const userTimezone = user.timezone || 'UTC';
        const today = getUserLocalDate(userTimezone);

        // Only count as a new streak day if:
        // 1. This is today's puzzle (not an archive puzzle)
        // 2. User hasn't already completed a daily today
        if (date !== today || user.lastDailyDate === today) {
          return { isNewStreakDay: false, newStreak: user.currentStreak };
        }

        // Calculate new streak using timezone-aware date comparison
        let newStreak = 1;
        if (user.lastDailyDate) {
          const diffDays = daysBetween(user.lastDailyDate, today);

          if (diffDays === 1) {
            // Continue streak
            newStreak = user.currentStreak + 1;
          }
          // If diffDays > 1, streak resets to 1
        }

        const newLongestStreak = Math.max(user.longestStreak, newStreak);

        // Update local state immediately for instant UI feedback
        set({
          user: {
            ...user,
            currentStreak: newStreak,
            longestStreak: newLongestStreak,
            lastDailyDate: today,
          },
        });

        // Update Supabase in background
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (authUser) {
            await supabase
              .from('profiles')
              .update({
                current_streak: newStreak,
                longest_streak: newLongestStreak,
                last_daily_date: today,
              })
              .eq('id', authUser.id);
          }
        } catch (err) {
          console.error('Error updating streak in Supabase:', err);
        }

        return { isNewStreakDay: true, newStreak };
      },
    }),
    {
      name: 'robozzle-auth',
      partialize: (state) => ({
        // Only persist these fields
        user: state.user,
        progress: state.progress,
        lastClassicStarsDate: state.lastClassicStarsDate,
      }),
    }
  )
);

// Initialize auth state listener
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    useAuthStore.getState().fetchProfile();
    useAuthStore.getState().fetchProgress();
  } else if (event === 'SIGNED_OUT') {
    useAuthStore.setState({ user: null, progress: null, isAuthenticated: false });
  }
});
