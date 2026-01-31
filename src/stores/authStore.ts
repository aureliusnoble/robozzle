import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { UserProfile, UserProgress } from '../engine/types';

interface AuthStore {
  user: UserProfile | null;
  progress: UserProgress | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error?: string }>;
  signInWithGoogle: () => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  fetchProgress: () => Promise<void>;
  updateProgress: (progress: Partial<UserProgress>) => Promise<void>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      user: null,
      progress: null,
      isLoading: true,
      isAuthenticated: false,

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
        } catch (e) {
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
        } catch (e) {
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
        } catch (e) {
          return { error: 'An unexpected error occurred' };
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, progress: null, isAuthenticated: false });
      },

      fetchProfile: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) {
            set({ user: null, isAuthenticated: false, isLoading: false });
            return;
          }

          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

          if (profile) {
            set({
              user: {
                id: profile.id,
                username: profile.username,
                email: user.email || '',
                puzzlesSolved: profile.puzzles_solved,
                currentStreak: profile.current_streak,
                longestStreak: profile.longest_streak,
                totalPoints: profile.total_points,
                createdAt: new Date(profile.created_at),
              },
              isAuthenticated: true,
              isLoading: false,
            });
          } else {
            set({ isLoading: false });
          }
        } catch (e) {
          console.error('Error fetching profile:', e);
          set({ isLoading: false });
        }
      },

      fetchProgress: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();

          if (!user) return;

          const { data: progress } = await supabase
            .from('user_progress')
            .select('*')
            .eq('user_id', user.id)
            .single();

          if (progress) {
            set({
              progress: {
                tutorialCompleted: progress.tutorial_completed || [],
                classicSolved: progress.classic_solved || [],
                dailySolved: progress.daily_solved || [],
              },
            });
          }
        } catch (e) {
          console.error('Error fetching progress:', e);
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
              });
          }
        } catch (e) {
          console.error('Error updating progress:', e);
        }
      },
    }),
    {
      name: 'robozzle-auth',
      partialize: (state) => ({
        // Only persist these fields
        user: state.user,
        progress: state.progress,
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
