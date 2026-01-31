import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PuzzleConfig, PuzzleMetadata, DailyChallenge, InstructionType } from '../engine/types';
import { tutorialPuzzles } from '../engine/tutorials';
import { supabase } from '../lib/supabase';

interface PuzzleStore {
  // Puzzle collections
  tutorials: PuzzleConfig[];
  classicPuzzlesMeta: PuzzleMetadata[]; // Lightweight metadata for list display
  loadedPuzzles: Map<string, PuzzleConfig>; // Cache for full puzzle data
  dailyChallenge: DailyChallenge | null;
  dailyArchive: DailyChallenge[];

  // Loading states
  isLoadingClassic: boolean;
  isLoadingDaily: boolean;
  isLoadingPuzzle: boolean;

  // Actions
  loadTutorials: () => void;
  loadClassicPuzzles: () => Promise<void>;
  loadDailyChallenge: () => Promise<void>;
  loadDailyChallengeForDate: (date: string) => Promise<void>;
  loadDailyArchive: () => Promise<void>;
  fetchPuzzle: (id: string) => Promise<PuzzleConfig | null>;
  getPuzzleById: (id: string) => PuzzleConfig | null;
}

// Get today's date in YYYY-MM-DD format
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

export const usePuzzleStore = create<PuzzleStore>()(
  persist(
    (set, get) => ({
      tutorials: [],
      classicPuzzlesMeta: [],
      loadedPuzzles: new Map(),
      dailyChallenge: null,
      dailyArchive: [],
      isLoadingClassic: false,
      isLoadingDaily: false,
      isLoadingPuzzle: false,

      loadTutorials: () => {
        set({ tutorials: tutorialPuzzles });
      },

      loadClassicPuzzles: async () => {
        set({ isLoadingClassic: true });

        try {
          // Load lightweight metadata from local JSON
          const response = await fetch(`${import.meta.env.BASE_URL}puzzles/classic/index.json`);
          if (response.ok) {
            const metadata: PuzzleMetadata[] = await response.json();
            set({ classicPuzzlesMeta: metadata, isLoadingClassic: false });
          } else {
            set({ isLoadingClassic: false });
          }
        } catch (e) {
          console.error('Error loading classic puzzle metadata:', e);
          set({ isLoadingClassic: false });
        }
      },

      // Fetch full puzzle data from Supabase
      fetchPuzzle: async (id: string) => {
        const { loadedPuzzles, tutorials, dailyChallenge, dailyArchive } = get();

        // Check cache first
        if (loadedPuzzles.has(id)) {
          return loadedPuzzles.get(id)!;
        }

        // Check tutorials (already full data)
        const tutorial = tutorials.find(p => p.id === id);
        if (tutorial) return tutorial;

        // Check daily (already full data)
        if (dailyChallenge?.puzzleId === id) return dailyChallenge.puzzle;

        // Check archive (already full data)
        const archived = dailyArchive.find(d => d.puzzleId === id);
        if (archived) return archived.puzzle;

        // Fetch from Supabase
        set({ isLoadingPuzzle: true });
        try {
          const { data: puzzle, error } = await supabase
            .from('puzzles')
            .select('*')
            .eq('id', id)
            .single();

          if (error) {
            console.error('Error fetching puzzle:', error);
            set({ isLoadingPuzzle: false });
            return null;
          }

          if (puzzle) {
            const parsedPuzzle = parsePuzzleFromDB(puzzle);
            // Update cache
            const newCache = new Map(loadedPuzzles);
            newCache.set(id, parsedPuzzle);
            set({ loadedPuzzles: newCache, isLoadingPuzzle: false });
            return parsedPuzzle;
          }

          set({ isLoadingPuzzle: false });
          return null;
        } catch (e) {
          console.error('Error fetching puzzle:', e);
          set({ isLoadingPuzzle: false });
          return null;
        }
      },

      loadDailyChallenge: async () => {
        set({ isLoadingDaily: true });
        const today = getTodayDate();

        try {
          const { data: daily, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', today)
            .single();

          if (error) {
            console.error('Error loading daily challenge:', error);
            // Generate a fallback daily from classic puzzles metadata
            const fallback = await generateFallbackDaily(get, today);
            set({ dailyChallenge: fallback, isLoadingDaily: false });
          } else if (daily && daily.puzzles) {
            set({
              dailyChallenge: {
                date: daily.date,
                puzzleId: daily.puzzle_id,
                puzzle: parsePuzzleFromDB(daily.puzzles),
              },
              isLoadingDaily: false,
            });
          } else {
            const fallback = await generateFallbackDaily(get, today);
            set({ dailyChallenge: fallback, isLoadingDaily: false });
          }
        } catch (e) {
          console.error('Error loading daily challenge:', e);
          const fallback = await generateFallbackDaily(get, today);
          set({ dailyChallenge: fallback, isLoadingDaily: false });
        }
      },

      loadDailyChallengeForDate: async (date: string) => {
        set({ isLoadingDaily: true });

        try {
          const { data: daily, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', date)
            .single();

          if (error) {
            console.error('Error loading daily challenge for date:', error);
            // Generate a fallback daily from classic puzzles metadata
            const fallback = await generateFallbackDaily(get, date);
            set({ dailyChallenge: fallback, isLoadingDaily: false });
          } else if (daily && daily.puzzles) {
            set({
              dailyChallenge: {
                date: daily.date,
                puzzleId: daily.puzzle_id,
                puzzle: parsePuzzleFromDB(daily.puzzles),
              },
              isLoadingDaily: false,
            });
          } else {
            const fallback = await generateFallbackDaily(get, date);
            set({ dailyChallenge: fallback, isLoadingDaily: false });
          }
        } catch (e) {
          console.error('Error loading daily challenge for date:', e);
          const fallback = await generateFallbackDaily(get, date);
          set({ dailyChallenge: fallback, isLoadingDaily: false });
        }
      },

      loadDailyArchive: async () => {
        try {
          const { data: archive, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .lt('date', getTodayDate())
            .order('date', { ascending: false })
            .limit(30);

          if (!error && archive) {
            const parsedArchive = archive.map(d => ({
              date: d.date,
              puzzleId: d.puzzle_id,
              puzzle: parsePuzzleFromDB(d.puzzles),
            }));
            set({ dailyArchive: parsedArchive });
          }
        } catch (e) {
          console.error('Error loading daily archive:', e);
        }
      },

      // Synchronous lookup (for already-loaded puzzles)
      getPuzzleById: (id: string) => {
        const { tutorials, loadedPuzzles, dailyChallenge, dailyArchive } = get();

        // Search tutorials
        const tutorial = tutorials.find(p => p.id === id);
        if (tutorial) return tutorial;

        // Check cache
        if (loadedPuzzles.has(id)) {
          return loadedPuzzles.get(id)!;
        }

        // Check daily
        if (dailyChallenge?.puzzleId === id) return dailyChallenge.puzzle;

        // Check archive
        const archived = dailyArchive.find(d => d.puzzleId === id);
        if (archived) return archived.puzzle;

        return null;
      },
    }),
    {
      name: 'robozzle-puzzles-v2', // Changed from v1 to avoid stale data
      partialize: (state) => ({
        // Only persist daily archive for offline access
        // Classic puzzles are loaded from local JSON (metadata) and Supabase (full data)
        dailyArchive: state.dailyArchive,
      }),
    }
  )
);

function parsePuzzleFromDB(dbPuzzle: any): PuzzleConfig {
  // Parse function lengths with fallback defaults
  const functionLengths = dbPuzzle.function_lengths || {
    f1: 10,
    f2: 0,
    f3: 0,
    f4: 0,
    f5: 0,
  };

  // Ensure all function keys exist
  const normalizedLengths = {
    f1: functionLengths.f1 ?? 10,
    f2: functionLengths.f2 ?? 0,
    f3: functionLengths.f3 ?? 0,
    f4: functionLengths.f4 ?? 0,
    f5: functionLengths.f5 ?? 0,
  };

  // Parse allowed instructions, or derive from function lengths if missing
  let allowedInstructions: InstructionType[] = dbPuzzle.allowed_instructions;

  if (!allowedInstructions || !Array.isArray(allowedInstructions) || allowedInstructions.length === 0) {
    // Default instructions: movement + functions that have slots
    allowedInstructions = ['forward', 'left', 'right', 'f1'];
    if (normalizedLengths.f2 > 0) allowedInstructions.push('f2');
    if (normalizedLengths.f3 > 0) allowedInstructions.push('f3');
    if (normalizedLengths.f4 > 0) allowedInstructions.push('f4');
    if (normalizedLengths.f5 > 0) allowedInstructions.push('f5');
  } else {
    // Ensure consistency: if a function has slots, it should be callable
    // and if a function has no slots, remove it from allowed instructions
    const funcInstructions = ['f2', 'f3', 'f4', 'f5'] as const;
    for (const func of funcInstructions) {
      const hasSlots = normalizedLengths[func] > 0;
      const isAllowed = allowedInstructions.includes(func);

      if (hasSlots && !isAllowed) {
        // Function has slots but isn't in allowed - add it
        allowedInstructions.push(func);
      } else if (!hasSlots && isAllowed) {
        // Function has no slots but is in allowed - remove it
        allowedInstructions = allowedInstructions.filter(i => i !== func);
      }
    }
  }

  return {
    id: dbPuzzle.id,
    title: dbPuzzle.title,
    description: dbPuzzle.description,
    grid: dbPuzzle.grid,
    robotStart: dbPuzzle.robot_start,
    functionLengths: normalizedLengths,
    allowedInstructions,
    category: dbPuzzle.category,
    difficulty: dbPuzzle.difficulty,
    author: dbPuzzle.author,
    stars: dbPuzzle.stars,
    communityDifficulty: dbPuzzle.community_difficulty,
  };
}

// Generate a fallback daily puzzle using seeded random
async function generateFallbackDaily(
  get: () => PuzzleStore,
  date: string
): Promise<DailyChallenge | null> {
  const { classicPuzzlesMeta, fetchPuzzle } = get();
  if (classicPuzzlesMeta.length === 0) return null;

  // Simple seeded random based on date
  const seed = date.split('-').reduce((acc, part) => acc + parseInt(part, 10), 0);
  const index = seed % classicPuzzlesMeta.length;
  const meta = classicPuzzlesMeta[index];

  // Fetch the full puzzle data
  const puzzle = await fetchPuzzle(meta.id);
  if (!puzzle) return null;

  return {
    date,
    puzzleId: puzzle.id,
    puzzle: { ...puzzle, category: 'daily' },
  };
}
