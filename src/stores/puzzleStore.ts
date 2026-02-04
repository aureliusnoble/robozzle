import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PuzzleConfig, PuzzleMetadata, DailyChallenge, InstructionType, ChallengeType } from '../engine/types';
import { tutorialPuzzles } from '../engine/tutorials';
import { supabase } from '../lib/supabase';

interface PuzzleStore {
  // Puzzle collections
  tutorials: PuzzleConfig[];
  classicPuzzlesMeta: PuzzleMetadata[]; // Lightweight metadata for list display
  loadedPuzzles: Map<string, PuzzleConfig>; // Cache for full puzzle data
  dailyChallenge: DailyChallenge | null;
  dailyEasyChallenge: DailyChallenge | null;
  dailyChallengeChallenge: DailyChallenge | null;
  dailyArchive: DailyChallenge[];

  // Loading states
  isLoadingClassic: boolean;
  isLoadingDaily: boolean;
  isLoadingPuzzle: boolean;

  // Actions
  loadTutorials: () => void;
  loadClassicPuzzles: () => Promise<void>;
  loadDailyChallenge: (challengeType?: ChallengeType) => Promise<void>;
  loadDailyChallengeForDate: (date: string, challengeType?: ChallengeType) => Promise<void>;
  loadDailyArchive: () => Promise<void>;
  loadBothDailyChallenges: () => Promise<void>;
  prefetchDailyChallenges: () => Promise<void>;
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
      dailyEasyChallenge: null,
      dailyChallengeChallenge: null,
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

      loadDailyChallenge: async (challengeType: ChallengeType = 'challenge') => {
        set({ isLoadingDaily: true });
        const today = getTodayDate();

        try {
          const { data: daily, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', today)
            .eq('challenge_type', challengeType)
            .single();

          if (error || !daily || !daily.puzzles) {
            // No daily challenge set for today - show "no puzzle" state
            console.log(`No ${challengeType} daily challenge found for today`);
            const stateUpdate: Partial<PuzzleStore> = { isLoadingDaily: false };
            if (challengeType === 'easy') {
              stateUpdate.dailyEasyChallenge = null;
            } else {
              stateUpdate.dailyChallengeChallenge = null;
            }
            stateUpdate.dailyChallenge = null;
            set(stateUpdate as any);
          } else {
            const challenge: DailyChallenge = {
              date: daily.date,
              puzzleId: daily.puzzle_id,
              puzzle: parseDailyPuzzleFromDB(daily.puzzles),
              challengeType: daily.challenge_type || 'challenge',
            };
            const stateUpdate: Partial<PuzzleStore> = {
              dailyChallenge: challenge,
              isLoadingDaily: false,
            };
            if (challengeType === 'easy') {
              stateUpdate.dailyEasyChallenge = challenge;
            } else {
              stateUpdate.dailyChallengeChallenge = challenge;
            }
            set(stateUpdate as any);
          }
        } catch (e) {
          console.error('Error loading daily challenge:', e);
          set({ dailyChallenge: null, isLoadingDaily: false });
        }
      },

      loadDailyChallengeForDate: async (date: string, challengeType: ChallengeType = 'challenge') => {
        set({ isLoadingDaily: true });

        try {
          const { data: daily, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', date)
            .eq('challenge_type', challengeType)
            .single();

          if (error || !daily || !daily.puzzles) {
            // No challenge found for this date
            console.log(`No ${challengeType} daily challenge found for date:`, date);
            set({ dailyChallenge: null, isLoadingDaily: false });
          } else {
            set({
              dailyChallenge: {
                date: daily.date,
                puzzleId: daily.puzzle_id,
                puzzle: parseDailyPuzzleFromDB(daily.puzzles),
                challengeType: daily.challenge_type || 'challenge',
              },
              isLoadingDaily: false,
            });
          }
        } catch (e) {
          console.error('Error loading daily challenge for date:', e);
          set({ dailyChallenge: null, isLoadingDaily: false });
        }
      },

      loadDailyArchive: async () => {
        try {
          const { data: archive, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .lt('date', getTodayDate())
            .order('date', { ascending: false })
            .limit(60); // 30 days * 2 challenge types

          if (!error && archive) {
            const parsedArchive = archive.map(d => ({
              date: d.date,
              puzzleId: d.puzzle_id,
              puzzle: parseDailyPuzzleFromDB(d.puzzles),
              challengeType: (d.challenge_type || 'challenge') as ChallengeType,
            }));
            set({ dailyArchive: parsedArchive });
          }
        } catch (e) {
          console.error('Error loading daily archive:', e);
        }
      },

      loadBothDailyChallenges: async () => {
        set({ isLoadingDaily: true });
        const today = getTodayDate();

        try {
          const { data: challenges, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', today);

          if (error || !challenges) {
            console.log('No daily challenges found for today');
            set({
              dailyEasyChallenge: null,
              dailyChallengeChallenge: null,
              isLoadingDaily: false,
            });
            return;
          }

          const stateUpdate: Partial<PuzzleStore> = { isLoadingDaily: false };

          for (const daily of challenges) {
            if (!daily.puzzles) continue;

            const challenge: DailyChallenge = {
              date: daily.date,
              puzzleId: daily.puzzle_id,
              puzzle: parseDailyPuzzleFromDB(daily.puzzles),
              challengeType: daily.challenge_type || 'challenge',
            };

            if (daily.challenge_type === 'easy') {
              stateUpdate.dailyEasyChallenge = challenge;
            } else {
              stateUpdate.dailyChallengeChallenge = challenge;
            }
          }

          set(stateUpdate as any);
        } catch (e) {
          console.error('Error loading daily challenges:', e);
          set({
            dailyEasyChallenge: null,
            dailyChallengeChallenge: null,
            isLoadingDaily: false,
          });
        }
      },

      // Prefetch daily challenges on app load - checks cache and refreshes if stale
      prefetchDailyChallenges: async () => {
        const { dailyEasyChallenge, dailyChallengeChallenge } = get();
        const today = getTodayDate();

        // Check if cached dailies are for today
        const easyIsValid = dailyEasyChallenge?.date === today;
        const challengeIsValid = dailyChallengeChallenge?.date === today;

        // If both are valid, no need to fetch
        if (easyIsValid && challengeIsValid) {
          return;
        }

        // Fetch fresh daily challenges
        try {
          const { data: challenges, error } = await supabase
            .from('daily_challenges')
            .select('*, puzzles(*)')
            .eq('date', today);

          if (error || !challenges) {
            return;
          }

          const stateUpdate: Partial<PuzzleStore> = {};

          for (const daily of challenges) {
            if (!daily.puzzles) continue;

            const challenge: DailyChallenge = {
              date: daily.date,
              puzzleId: daily.puzzle_id,
              puzzle: parseDailyPuzzleFromDB(daily.puzzles),
              challengeType: daily.challenge_type || 'challenge',
            };

            if (daily.challenge_type === 'easy') {
              stateUpdate.dailyEasyChallenge = challenge;
            } else {
              stateUpdate.dailyChallengeChallenge = challenge;
            }
          }

          if (Object.keys(stateUpdate).length > 0) {
            set(stateUpdate as any);
          }
        } catch (e) {
          console.error('Error prefetching daily challenges:', e);
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
      name: 'robozzle-puzzles-v3', // Changed from v2 to include daily challenges
      partialize: (state) => ({
        // Persist daily challenges for faster loading on return visits
        dailyEasyChallenge: state.dailyEasyChallenge,
        dailyChallengeChallenge: state.dailyChallengeChallenge,
        // Also persist archive for offline access
        dailyArchive: state.dailyArchive,
      }),
    }
  )
);

// Helper to ensure paint instructions are available (used for daily puzzles)
function ensurePaintInstructions(puzzle: PuzzleConfig): PuzzleConfig {
  const paintInstructions: InstructionType[] = ['paint_red', 'paint_green', 'paint_blue'];
  const missingPaint = paintInstructions.filter(p => !puzzle.allowedInstructions.includes(p));

  if (missingPaint.length === 0) {
    return puzzle;
  }

  return {
    ...puzzle,
    allowedInstructions: [...puzzle.allowedInstructions, ...missingPaint],
  };
}

// Wrapper for parsing daily puzzles - always includes paint instructions
function parseDailyPuzzleFromDB(dbPuzzle: any): PuzzleConfig {
  return ensurePaintInstructions(parsePuzzleFromDB(dbPuzzle));
}

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

