import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';

interface PreferencesStore {
  // Preferences
  speed: number; // ms per step (25, 100, 500, 1000)

  // Actions
  setSpeed: (speed: number) => void;
  syncFromSupabase: () => Promise<void>;
  syncToSupabase: () => Promise<void>;
}

// Valid speed values
export const SPEED_VALUES = {
  SLOW: 1000,    // Turtle
  MEDIUM: 500,   // Dot
  FAST: 100,     // Rabbit
  LIGHTNING: 25, // Lightning (4x faster than rabbit)
} as const;

export const usePreferencesStore = create<PreferencesStore>()(
  persist(
    (set, get) => ({
      speed: SPEED_VALUES.SLOW, // Default to slowest speed for beginners

      setSpeed: (speed: number) => {
        // Clamp to valid range
        const clampedSpeed = Math.max(SPEED_VALUES.LIGHTNING, Math.min(SPEED_VALUES.SLOW, speed));
        set({ speed: clampedSpeed });

        // Async sync to Supabase (fire and forget)
        get().syncToSupabase();
      },

      syncFromSupabase: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { data: progress } = await supabase
            .from('user_progress')
            .select('speed_preference')
            .eq('user_id', user.id)
            .maybeSingle();

          if (progress?.speed_preference !== undefined && progress.speed_preference !== null) {
            set({ speed: progress.speed_preference });
          }
        } catch (err) {
          // Column might not exist yet, gracefully ignore
          console.debug('Could not fetch speed preference from Supabase:', err);
        }
      },

      syncToSupabase: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { speed } = get();

          await supabase
            .from('user_progress')
            .upsert({
              user_id: user.id,
              speed_preference: speed,
            }, {
              onConflict: 'user_id',
            });
        } catch (err) {
          // Column might not exist yet, gracefully ignore
          console.debug('Could not save speed preference to Supabase:', err);
        }
      },
    }),
    {
      name: 'robozzle-preferences',
      partialize: (state) => ({
        speed: state.speed,
      }),
    }
  )
);

// Sync preferences from Supabase when auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    usePreferencesStore.getState().syncFromSupabase();
  }
});
