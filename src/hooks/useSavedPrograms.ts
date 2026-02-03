import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { SavedProgram, Program } from '../engine/types';
import { useAuthStore } from '../stores/authStore';

const LOCAL_STORAGE_KEY = 'robozzle-saved-programs';

interface LocalSavedPrograms {
  [puzzleId: string]: {
    [slot: number]: {
      program: Program;
      instructionsUsed: number | null;
      updatedAt: string;
    };
  };
}

// Get locally saved programs
function getLocalPrograms(): LocalSavedPrograms {
  try {
    const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

// Save programs locally
function setLocalPrograms(programs: LocalSavedPrograms): void {
  localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(programs));
}

// Count instructions in a program
function countInstructions(program: Program): number {
  let count = 0;
  for (const fn of ['f1', 'f2', 'f3', 'f4', 'f5'] as const) {
    for (const inst of program[fn]) {
      if (inst && inst.type !== 'noop') {
        count++;
      }
    }
  }
  return count;
}

export function useSavedPrograms(puzzleId: string | undefined) {
  const [savedSlots, setSavedSlots] = useState<SavedProgram[]>([]);
  const [latestProgram, setLatestProgram] = useState<Program | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();

  // Fetch saved programs (merging local and Supabase)
  const fetchSavedPrograms = useCallback(async () => {
    if (!puzzleId) {
      setSavedSlots([]);
      setLatestProgram(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Get local programs first
      const localPrograms = getLocalPrograms();
      const localPuzzlePrograms = localPrograms[puzzleId] || {};

      let mergedSlots: SavedProgram[] = [];

      // If authenticated, fetch from Supabase
      if (user) {
        const { data, error: fetchError } = await supabase
          .from('saved_programs')
          .select('*')
          .eq('user_id', user.id)
          .eq('puzzle_id', puzzleId)
          .order('slot', { ascending: true });

        if (fetchError) {
          setError(fetchError.message);
        } else if (data) {
          mergedSlots = data.map((d) => ({
            id: d.id,
            puzzleId: d.puzzle_id,
            slot: d.slot,
            program: d.program as unknown as Program,
            instructionsUsed: d.instructions_used,
            updatedAt: new Date(d.updated_at),
          }));
        }

        // Merge local programs that don't exist in Supabase
        for (const slotStr of Object.keys(localPuzzlePrograms)) {
          const slot = parseInt(slotStr, 10);
          const existing = mergedSlots.find((s) => s.slot === slot);

          if (!existing) {
            const localSlot = localPuzzlePrograms[slot];
            mergedSlots.push({
              id: `local-${puzzleId}-${slot}`,
              puzzleId,
              slot,
              program: localSlot.program,
              instructionsUsed: localSlot.instructionsUsed,
              updatedAt: new Date(localSlot.updatedAt),
            });
          } else {
            // If local is newer, use local data
            const localSlot = localPuzzlePrograms[slot];
            const localDate = new Date(localSlot.updatedAt);
            if (localDate > existing.updatedAt) {
              existing.program = localSlot.program;
              existing.instructionsUsed = localSlot.instructionsUsed;
              existing.updatedAt = localDate;
            }
          }
        }
      } else {
        // Not authenticated, use local only
        for (const slotStr of Object.keys(localPuzzlePrograms)) {
          const slot = parseInt(slotStr, 10);
          const localSlot = localPuzzlePrograms[slot];
          mergedSlots.push({
            id: `local-${puzzleId}-${slot}`,
            puzzleId,
            slot,
            program: localSlot.program,
            instructionsUsed: localSlot.instructionsUsed,
            updatedAt: new Date(localSlot.updatedAt),
          });
        }
      }

      setSavedSlots(mergedSlots.sort((a, b) => a.slot - b.slot));

      // Set latest program (slot 0)
      const latest = mergedSlots.find((s) => s.slot === 0);
      setLatestProgram(latest?.program || null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch saved programs');
    } finally {
      setIsLoading(false);
    }
  }, [puzzleId, user]);

  // Save program to a slot
  const saveProgram = useCallback(
    async (slot: number, program: Program): Promise<{ success: boolean; error?: string }> => {
      if (!puzzleId) {
        return { success: false, error: 'No puzzle selected' };
      }

      if (slot < 0 || slot > 3) {
        return { success: false, error: 'Invalid slot number' };
      }

      const instructionsUsed = countInstructions(program);
      const now = new Date().toISOString();

      // Always save locally first
      const localPrograms = getLocalPrograms();
      if (!localPrograms[puzzleId]) {
        localPrograms[puzzleId] = {};
      }
      localPrograms[puzzleId][slot] = {
        program,
        instructionsUsed,
        updatedAt: now,
      };
      setLocalPrograms(localPrograms);

      // If authenticated, sync to Supabase
      if (user) {
        try {
          const { error: upsertError } = await supabase
            .from('saved_programs')
            .upsert(
              {
                user_id: user.id,
                puzzle_id: puzzleId,
                slot,
                program: program as unknown as Record<string, unknown>,
                instructions_used: instructionsUsed,
              },
              {
                onConflict: 'user_id,puzzle_id,slot',
              }
            );

          if (upsertError) {
            // Local save succeeded, but Supabase failed
            console.warn('Failed to sync to Supabase:', upsertError);
          }
        } catch (err) {
          console.warn('Failed to sync to Supabase:', err);
        }
      }

      // Refresh the state
      await fetchSavedPrograms();

      return { success: true };
    },
    [puzzleId, user, fetchSavedPrograms]
  );

  // Load program from a slot
  const loadProgram = useCallback(
    (slot: number): Program | null => {
      const saved = savedSlots.find((s) => s.slot === slot);
      return saved?.program || null;
    },
    [savedSlots]
  );

  // Delete a saved program
  const deleteProgram = useCallback(
    async (slot: number): Promise<{ success: boolean; error?: string }> => {
      if (!puzzleId) {
        return { success: false, error: 'No puzzle selected' };
      }

      // Delete locally
      const localPrograms = getLocalPrograms();
      if (localPrograms[puzzleId]) {
        delete localPrograms[puzzleId][slot];
        if (Object.keys(localPrograms[puzzleId]).length === 0) {
          delete localPrograms[puzzleId];
        }
        setLocalPrograms(localPrograms);
      }

      // If authenticated, delete from Supabase
      if (user) {
        try {
          const { error: deleteError } = await supabase
            .from('saved_programs')
            .delete()
            .eq('user_id', user.id)
            .eq('puzzle_id', puzzleId)
            .eq('slot', slot);

          if (deleteError) {
            console.warn('Failed to delete from Supabase:', deleteError);
          }
        } catch (err) {
          console.warn('Failed to delete from Supabase:', err);
        }
      }

      // Refresh the state
      await fetchSavedPrograms();

      return { success: true };
    },
    [puzzleId, user, fetchSavedPrograms]
  );

  // Get slot info for display
  const getSlotInfo = useCallback(
    (slot: number): { isEmpty: boolean; instructionsUsed: number | null; updatedAt: Date | null } => {
      const saved = savedSlots.find((s) => s.slot === slot);
      if (!saved) {
        return { isEmpty: true, instructionsUsed: null, updatedAt: null };
      }
      return {
        isEmpty: false,
        instructionsUsed: saved.instructionsUsed,
        updatedAt: saved.updatedAt,
      };
    },
    [savedSlots]
  );

  // Initial fetch
  useEffect(() => {
    fetchSavedPrograms();
  }, [fetchSavedPrograms]);

  return {
    savedSlots,
    latestProgram,
    isLoading,
    error,
    saveProgram,
    loadProgram,
    deleteProgram,
    getSlotInfo,
    refresh: fetchSavedPrograms,
  };
}
