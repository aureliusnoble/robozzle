import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import { DEFAULT_SKIN_ID, getSkinImageById } from '../data/skins';

interface SkinStore {
  // State
  selectedSkin: string;
  purchasedSkins: string[];
  starsSpent: number;
  isLoading: boolean;

  // Actions
  setSelectedSkin: (skinId: string) => void;
  purchaseSkin: (skinId: string, cost: number) => Promise<boolean>;
  getSkinImage: () => string;
  fetchSkins: () => Promise<void>;
  syncToSupabase: () => Promise<void>;
}

export const useSkinStore = create<SkinStore>()(
  persist(
    (set, get) => ({
      selectedSkin: DEFAULT_SKIN_ID,
      purchasedSkins: [DEFAULT_SKIN_ID],
      starsSpent: 0,
      isLoading: false,

      setSelectedSkin: (skinId: string) => {
        const { purchasedSkins } = get();
        // Only allow selecting purchased skins
        if (!purchasedSkins.includes(skinId)) {
          console.warn(`Cannot select unpurchased skin: ${skinId}`);
          return;
        }

        set({ selectedSkin: skinId });

        // Sync to Supabase (fire and forget)
        get().syncToSupabase();
      },

      purchaseSkin: async (skinId: string, cost: number) => {
        const { purchasedSkins, starsSpent } = get();

        // Already owned
        if (purchasedSkins.includes(skinId)) {
          return false;
        }

        const newPurchased = [...purchasedSkins, skinId];
        const newSpent = starsSpent + cost;

        set({
          purchasedSkins: newPurchased,
          starsSpent: newSpent,
        });

        // Sync to Supabase
        await get().syncToSupabase();

        return true;
      },

      getSkinImage: () => {
        const { selectedSkin } = get();
        return getSkinImageById(selectedSkin);
      },

      fetchSkins: async () => {
        set({ isLoading: true });

        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) {
            set({ isLoading: false });
            return;
          }

          const { data } = await supabase
            .from('user_skins')
            .select('purchased_skins, stars_spent, selected_skin')
            .eq('user_id', user.id)
            .maybeSingle();

          if (data) {
            const localState = get();
            const remoteSkins = data.purchased_skins || [DEFAULT_SKIN_ID];
            const remoteSelected = data.selected_skin || DEFAULT_SKIN_ID;

            // Merge local and remote (union of purchased skins)
            const mergedPurchased = [...new Set([...localState.purchasedSkins, ...remoteSkins])];
            const mergedSpent = Math.max(localState.starsSpent, data.stars_spent || 0);

            // Use remote selected skin if it's purchased, otherwise keep local
            const finalSelected = mergedPurchased.includes(remoteSelected)
              ? remoteSelected
              : (mergedPurchased.includes(localState.selectedSkin) ? localState.selectedSkin : DEFAULT_SKIN_ID);

            set({
              purchasedSkins: mergedPurchased,
              starsSpent: mergedSpent,
              selectedSkin: finalSelected,
            });

            // If local had data remote didn't, push back to Supabase
            const hasNewLocal = localState.purchasedSkins.some(s => !remoteSkins.includes(s)) ||
              localState.starsSpent > (data.stars_spent || 0) ||
              localState.selectedSkin !== remoteSelected;

            if (hasNewLocal) {
              await get().syncToSupabase();
            }
          }
        } catch (err) {
          console.error('Error fetching skins:', err);
        } finally {
          set({ isLoading: false });
        }
      },

      syncToSupabase: async () => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const { selectedSkin, purchasedSkins, starsSpent } = get();

          await supabase
            .from('user_skins')
            .upsert({
              user_id: user.id,
              selected_skin: selectedSkin,
              purchased_skins: purchasedSkins,
              stars_spent: starsSpent,
            }, { onConflict: 'user_id' });
        } catch (err) {
          console.error('Error syncing skins to Supabase:', err);
        }
      },
    }),
    {
      name: 'robozzle-skin-store',
      partialize: (state) => ({
        selectedSkin: state.selectedSkin,
        purchasedSkins: state.purchasedSkins,
        starsSpent: state.starsSpent,
      }),
    }
  )
);

// Sync skins from Supabase when auth state changes
supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_IN' && session) {
    useSkinStore.getState().fetchSkins();
  }
});
