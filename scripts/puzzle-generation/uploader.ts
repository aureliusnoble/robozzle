// Database upload logic for generated puzzles

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import type { GeneratedPuzzleConfig, PuzzleBatch } from './types';

// Get Supabase client from environment variables
function getSupabaseClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  }

  return createClient(url, key);
}

// Convert puzzle config to database format
function puzzleToDbFormat(puzzle: GeneratedPuzzleConfig) {
  return {
    id: puzzle.id,
    title: puzzle.title,
    description: puzzle.description || null,
    grid: puzzle.grid,
    robot_start: puzzle.robotStart,
    function_lengths: puzzle.functionLengths,
    allowed_instructions: puzzle.allowedInstructions,
    category: puzzle.category,
    difficulty: puzzle.difficulty,
    generation_source: puzzle.generationSource,
    solver_difficulty_score: puzzle.solverDifficultyScore,
    quality_score: puzzle.qualityScore,
    solution_instruction_count: puzzle.solutionInstructionCount,
    solution_step_count: puzzle.solutionStepCount,
    profile_name: puzzle.profileName || null,
    uses_painting: puzzle.usesPainting || false,
  };
}

// Upload a single puzzle to database
export async function uploadPuzzle(puzzle: GeneratedPuzzleConfig): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();
    const dbPuzzle = puzzleToDbFormat(puzzle);

    const { error } = await supabase
      .from('puzzles')
      .upsert(dbPuzzle, { onConflict: 'id' });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Add puzzle to generated pool
export async function addToPool(
  puzzleId: string,
  profileName: string | undefined,
  qualityScore: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = getSupabaseClient();

    const { error } = await supabase
      .from('generated_puzzle_pool')
      .insert({
        puzzle_id: puzzleId,
        profile_name: profileName || null,
        quality_score: qualityScore,
        used_for_daily: null,
      });

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// Upload a batch of puzzles
export async function uploadBatch(batch: PuzzleBatch): Promise<{
  success: boolean;
  uploaded: number;
  failed: number;
  errors: string[];
}> {
  const errors: string[] = [];
  let uploaded = 0;
  let failed = 0;

  for (const puzzle of batch.puzzles) {
    // Upload puzzle
    const puzzleResult = await uploadPuzzle(puzzle);
    if (!puzzleResult.success) {
      errors.push(`Puzzle ${puzzle.id}: ${puzzleResult.error}`);
      failed++;
      continue;
    }

    // Add to pool
    const poolResult = await addToPool(
      puzzle.id,
      puzzle.profileName,
      puzzle.qualityScore
    );

    if (!poolResult.success) {
      errors.push(`Pool entry ${puzzle.id}: ${poolResult.error}`);
      failed++;
      continue;
    }

    uploaded++;
  }

  return {
    success: failed === 0,
    uploaded,
    failed,
    errors,
  };
}

// Get current pool statistics
export async function getPoolStats(): Promise<{
  total: number;
  unused: number;
  byProfile: Record<string, { total: number; unused: number }>;
} | null> {
  try {
    const supabase = getSupabaseClient();

    const { data, error } = await supabase
      .from('generated_puzzle_pool')
      .select('profile_name, used_for_daily');

    if (error || !data) {
      console.error('Error fetching pool stats:', error);
      return null;
    }

    const byProfile: Record<string, { total: number; unused: number }> = {};

    let total = 0;
    let unused = 0;

    for (const entry of data) {
      const profile = entry.profile_name || 'unknown';
      if (!byProfile[profile]) {
        byProfile[profile] = { total: 0, unused: 0 };
      }
      byProfile[profile].total++;
      total++;
      if (!entry.used_for_daily) {
        byProfile[profile].unused++;
        unused++;
      }
    }

    return { total, unused, byProfile };
  } catch (err) {
    console.error('Error getting pool stats:', err);
    return null;
  }
}

// Save batch to local JSON file (for offline/testing)
export function saveBatchToFile(batch: PuzzleBatch, filepath: string): void {
  const json = JSON.stringify(batch, null, 2);
  fs.writeFileSync(filepath, json, 'utf-8');
  console.log(`Saved ${batch.puzzles.length} puzzles to ${filepath}`);
}

// Load batch from local JSON file
export function loadBatchFromFile(filepath: string): PuzzleBatch | null {
  try {
    const json = fs.readFileSync(filepath, 'utf-8');
    return JSON.parse(json) as PuzzleBatch;
  } catch (err) {
    console.error('Error loading batch:', err);
    return null;
  }
}
