#!/usr/bin/env npx tsx
/**
 * Headless Puzzle Generation Script
 *
 * This script generates puzzles for the daily challenge pool using the simulation-based
 * generation system. It runs without a browser and can be executed via GitHub Actions.
 *
 * Usage:
 *   npx tsx scripts/generate-daily/index.ts
 *
 * Environment variables:
 *   SUPABASE_URL - Supabase project URL
 *   SUPABASE_SERVICE_KEY - Supabase service role key (for write access)
 */

import { createClient } from '@supabase/supabase-js';
import { SimulationEngine } from './simulation-engine';
import type { SimulationConfig } from '../../src/engine/simulationTypes';
import type { ChallengeType } from '../../src/engine/types';

// Configuration
const MIN_POOL_SIZE = 7; // Minimum puzzles in pool before generating more
const MAX_GENERATION_TIME_MS = 30 * 60 * 1000; // 30 minutes per puzzle max
const PUZZLES_TO_GENERATE = 7; // Generate up to this many per run

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface GenerationConfig {
  id: string;
  name: string;
  challenge_type: ChallengeType;
  config: SimulationConfig;
  description?: string;
  is_active: boolean;
}

interface PoolCount {
  challengeType: ChallengeType;
  count: number;
}

async function getActiveConfigs(): Promise<GenerationConfig[]> {
  const { data, error } = await supabase
    .from('generation_configs')
    .select('*')
    .eq('is_active', true);

  if (error) {
    console.error('Error fetching generation configs:', error);
    return [];
  }

  return data || [];
}

async function getPoolCounts(): Promise<PoolCount[]> {
  const { data, error } = await supabase
    .from('generated_puzzle_pool')
    .select('mechanic_category')
    .is('used_for_daily', null);

  if (error) {
    console.error('Error fetching pool counts:', error);
    return [];
  }

  const counts = new Map<ChallengeType, number>();
  counts.set('easy', 0);
  counts.set('challenge', 0);

  for (const row of data || []) {
    const type = row.mechanic_category as ChallengeType;
    counts.set(type, (counts.get(type) || 0) + 1);
  }

  return [
    { challengeType: 'easy', count: counts.get('easy') || 0 },
    { challengeType: 'challenge', count: counts.get('challenge') || 0 },
  ];
}

async function uploadPuzzle(
  puzzle: any,
  solution: any,
  challengeType: ChallengeType,
  qualityScore: number
): Promise<boolean> {
  const puzzleId = `gen-${challengeType}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // Insert puzzle
  const { error: puzzleError } = await supabase.from('puzzles').insert({
    id: puzzleId,
    title: `Generated ${challengeType} ${new Date().toISOString().split('T')[0]}`,
    description: null,
    grid: puzzle.grid,
    robot_start: puzzle.robotStart,
    function_lengths: puzzle.functionLengths,
    allowed_instructions: puzzle.allowedInstructions,
    category: 'daily',
    difficulty: challengeType === 'easy' ? 'easy' : 'hard',
    generation_source: 'generated',
    mechanic_category: challengeType,
    profile_name: challengeType,
    quality_score: qualityScore,
    solution_instruction_count: countInstructions(solution),
    solution_step_count: puzzle.stepCount || 0,
    generated_solution: solution,
  });

  if (puzzleError) {
    console.error('Error inserting puzzle:', puzzleError);
    return false;
  }

  // Add to pool
  const { error: poolError } = await supabase.from('generated_puzzle_pool').insert({
    puzzle_id: puzzleId,
    mechanic_category: challengeType,
    quality_score: qualityScore,
  });

  if (poolError) {
    console.error('Error adding to pool:', poolError);
    return false;
  }

  console.log(`Successfully uploaded puzzle ${puzzleId} to ${challengeType} pool`);
  return true;
}

function countInstructions(program: any): number {
  let count = 0;
  for (const fn of ['f1', 'f2', 'f3', 'f4', 'f5']) {
    if (program[fn]) {
      for (const instr of program[fn]) {
        if (instr && instr.type !== 'noop') {
          count++;
        }
      }
    }
  }
  return count;
}

async function generatePuzzlesForType(
  challengeType: ChallengeType,
  config: SimulationConfig,
  count: number
): Promise<number> {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`Generating ${count} ${challengeType.toUpperCase()} puzzles`);
  console.log(`${'='.repeat(50)}`);

  // Log config details
  console.log('\nConfig settings:');
  console.log(`  Grid size: ${config.gridSize}x${config.gridSize}, Max steps: ${config.maxSteps}`);
  console.log(`  Functions: F1=${config.slotsPerFunction.f1}, F2=${config.slotsPerFunction.f2}, F3=${config.slotsPerFunction.f3}, F4=${config.slotsPerFunction.f4}, F5=${config.slotsPerFunction.f5}`);
  console.log(`  Min tiles: ${config.minTiles}, Min bounding box: ${config.minBoundingBox}, Max dense: ${config.maxDenseTiles}`);
  console.log(`  Min turns: ${config.minTurns}, Min path length: ${config.minPathLength}`);
  console.log(`  Min coverage: ${config.minCoveragePercent}%, Conditional %: ${config.conditionalPercent}%`);
  console.log(`  Min stack depth: ${config.minStackDepth}, Min self calls: ${config.minSelfCalls}`);
  console.log(`  Path trace ratio: ${config.minPathTraceRatio}, Min conditionals: ${config.minConditionals}`);
  console.log(`  Min paint revisits: ${config.minPaintRevisits}, Max unnecessary paints: ${config.maxUnnecessaryPaints}`);
  console.log(`  Loop check: ${config.disableLoopCheck ? 'DISABLED' : 'enabled'}`);
  console.log(`  Instruction weights: fwd=${config.instructionWeights.forward}, turn=${config.instructionWeights.turn}, call=${config.instructionWeights.functionCall}, paint=${config.instructionWeights.paint}`);
  console.log(`  Auto restart after: ${config.autoRestartAfter} attempts`);

  const engine = new SimulationEngine(config);
  let generated = 0;

  for (let i = 0; i < count; i++) {
    console.log(`\n--- Puzzle ${i + 1}/${count} ---`);

    const startTime = Date.now();
    const result = engine.generate(MAX_GENERATION_TIME_MS);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success && result.puzzle && result.solution) {
      console.log(`SUCCESS in ${elapsed}s after ${result.attempts.toLocaleString()} attempts`);

      // Log puzzle details
      const totalSlots = Object.values(config.slotsPerFunction).reduce((a, b) => a + b, 0);
      const executedCount = result.executedSlots?.size || 0;
      const coverage = totalSlots > 0 ? ((executedCount / totalSlots) * 100).toFixed(1) : '0';
      const pathLength = (result.robotPath?.length || 1) - 1;
      const turns = result.turnPositions?.length || 0;
      const stars = turns + 1; // turns + final position

      console.log(`  Path length: ${pathLength} moves`);
      console.log(`  Turns: ${turns}, Stars: ${stars}`);
      console.log(`  Coverage: ${executedCount}/${totalSlots} slots (${coverage}%)`);
      console.log(`  Step count: ${result.puzzle.stepCount}`);

      const qualityScore = calculateQualityScore(result, config);
      console.log(`  Quality score: ${qualityScore}`);

      const success = await uploadPuzzle(
        result.puzzle,
        result.solution,
        challengeType,
        qualityScore
      );

      if (success) {
        generated++;
        console.log(`  Uploaded successfully!`);
      } else {
        console.log(`  Upload FAILED`);
      }
    } else {
      console.log(`FAILED after ${elapsed}s and ${result.attempts.toLocaleString()} attempts`);
      console.log(`  Last error type: ${result.errorType || 'unknown'}`);
      console.log(`  Timeout: ${MAX_GENERATION_TIME_MS / 1000}s`);

      // Log error breakdown
      if (result.errorCounts) {
        const ec = result.errorCounts;
        const total = ec.boundary + ec.coverage + ec.loop + ec.minTiles + ec.minBoundingBox + ec.minTurns + ec.minPathLength + ec.other;
        if (total > 0) {
          console.log(`  Error breakdown:`);
          if (ec.boundary > 0) console.log(`    - boundary: ${ec.boundary} (${((ec.boundary/total)*100).toFixed(1)}%)`);
          if (ec.coverage > 0) console.log(`    - coverage: ${ec.coverage} (${((ec.coverage/total)*100).toFixed(1)}%)`);
          if (ec.loop > 0) console.log(`    - loop: ${ec.loop} (${((ec.loop/total)*100).toFixed(1)}%)`);
          if (ec.minTiles > 0) console.log(`    - minTiles: ${ec.minTiles} (${((ec.minTiles/total)*100).toFixed(1)}%)`);
          if (ec.minBoundingBox > 0) console.log(`    - minBoundingBox: ${ec.minBoundingBox} (${((ec.minBoundingBox/total)*100).toFixed(1)}%)`);
          if (ec.minTurns > 0) console.log(`    - minTurns: ${ec.minTurns} (${((ec.minTurns/total)*100).toFixed(1)}%)`);
          if (ec.minPathLength > 0) console.log(`    - minPathLength: ${ec.minPathLength} (${((ec.minPathLength/total)*100).toFixed(1)}%)`);
          if (ec.other > 0) console.log(`    - other: ${ec.other} (${((ec.other/total)*100).toFixed(1)}%)`);
        }
      }
    }
  }

  console.log(`\n${challengeType.toUpperCase()} generation complete: ${generated}/${count} puzzles`);
  return generated;
}

function calculateQualityScore(result: any, config: SimulationConfig): number {
  // Quality score based on various factors
  let score = 50; // Base score

  // Bonus for using more slots
  const totalSlots = Object.values(config.slotsPerFunction).reduce((a, b) => a + b, 0);
  const executedSlots = result.executedSlots?.size || 0;
  const coverage = totalSlots > 0 ? executedSlots / totalSlots : 0;
  score += coverage * 20;

  // Bonus for more turns (interesting paths)
  const turns = result.turnPositions?.length || 0;
  score += Math.min(turns * 2, 15);

  // Bonus for longer paths
  const pathLength = result.robotPath?.length || 0;
  score += Math.min(pathLength / 5, 15);

  return Math.round(score);
}

// Get today's date in YYYY-MM-DD format (UTC)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Get tomorrow's date in YYYY-MM-DD format (UTC)
function getTomorrowDate(): string {
  const tomorrow = new Date();
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().split('T')[0];
}

// Check if a daily challenge exists for a given date and type
async function hasDailyChallenge(date: string, challengeType: ChallengeType): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('id')
    .eq('date', date)
    .eq('challenge_type', challengeType)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('Error checking daily challenge:', error);
  }
  return !!data;
}

// Delete existing daily challenge for a date and type (for tomorrow's swap)
async function deleteDailyChallenge(date: string, challengeType: ChallengeType): Promise<boolean> {
  // First get the puzzle_id so we can unmark it in the pool
  const { data: existing, error: fetchError } = await supabase
    .from('daily_challenges')
    .select('puzzle_id')
    .eq('date', date)
    .eq('challenge_type', challengeType)
    .single();

  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching daily challenge to delete:', fetchError);
    return false;
  }

  if (!existing) {
    return true; // Nothing to delete
  }

  // Unmark the puzzle in the pool (set used_for_daily back to null)
  const { error: poolError } = await supabase
    .from('generated_puzzle_pool')
    .update({ used_for_daily: null })
    .eq('puzzle_id', existing.puzzle_id);

  if (poolError) {
    console.error('Error unmarking puzzle in pool:', poolError);
    // Continue anyway - the puzzle might not be in the pool
  }

  // Delete the daily challenge entry
  const { error: deleteError } = await supabase
    .from('daily_challenges')
    .delete()
    .eq('date', date)
    .eq('challenge_type', challengeType);

  if (deleteError) {
    console.error('Error deleting daily challenge:', deleteError);
    return false;
  }

  console.log(`Deleted existing ${challengeType} daily for ${date}`);
  return true;
}

// Get the next daily number based on archive count
async function getNextDailyNumber(challengeType: ChallengeType): Promise<number> {
  const { count, error } = await supabase
    .from('daily_challenges')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_type', challengeType);

  if (error) {
    console.error('Error counting daily challenges:', error);
    return 1;
  }
  return (count || 0) + 1;
}

// Select a puzzle from the pool and set it as the daily for a given date
async function selectDailyPuzzle(challengeType: ChallengeType, targetDate: string): Promise<boolean> {

  // Get an available puzzle from the pool
  const { data: poolEntry, error: poolError } = await supabase
    .from('generated_puzzle_pool')
    .select('puzzle_id, id')
    .eq('mechanic_category', challengeType)
    .is('used_for_daily', null)
    .order('quality_score', { ascending: false })
    .limit(1)
    .single();

  if (poolError || !poolEntry) {
    console.log(`No available ${challengeType} puzzles in pool`);
    return false;
  }

  const puzzleId = poolEntry.puzzle_id;
  const poolId = poolEntry.id;

  // Get next daily number
  const dailyNumber = await getNextDailyNumber(challengeType);
  const dailyTitle = `Daily ${challengeType === 'easy' ? 'Easy' : 'Challenge'} #${dailyNumber}`;

  console.log(`Selecting ${challengeType} puzzle ${puzzleId} as "${dailyTitle}"`);

  // Update puzzle title and clear description
  const { error: titleError } = await supabase
    .from('puzzles')
    .update({ title: dailyTitle, description: null })
    .eq('id', puzzleId);

  if (titleError) {
    console.error('Error updating puzzle title:', titleError);
    return false;
  }

  // Mark as used in pool
  const { error: usedError } = await supabase
    .from('generated_puzzle_pool')
    .update({ used_for_daily: targetDate })
    .eq('id', poolId);

  if (usedError) {
    console.error('Error marking puzzle as used:', usedError);
    return false;
  }

  // Create daily challenge entry
  const { error: dailyError } = await supabase
    .from('daily_challenges')
    .insert({
      date: targetDate,
      puzzle_id: puzzleId,
      challenge_type: challengeType,
    });

  if (dailyError) {
    console.error('Error creating daily challenge:', dailyError);
    return false;
  }

  console.log(`Successfully set ${dailyTitle} for ${targetDate}`);
  return true;
}

// Default configs if none are in the database
const DEFAULT_EASY_CONFIG: SimulationConfig = {
  slotsPerFunction: { f1: 5, f2: 0, f3: 0, f4: 0, f5: 0 },
  maxSteps: 500,
  gridSize: 16,
  colorRatios: { red: 1, green: 1, blue: 0 },
  minCoveragePercent: 80,
  conditionalPercent: 30,
  instructionWeights: { forward: 4, turn: 3, functionCall: 0, paint: 0 },
  minTiles: 8,
  minBoundingBox: 3,
  minTurns: 2,
  maxDenseTiles: 3,
  maxAvgExecutionsPerSlot: 5,
  minStackDepth: 1,
  minSelfCalls: 0,
  autoRestartAfter: 500,
  minPathTraceRatio: 1.0,
  minPathLength: 10,
  minConditionals: 0,
  minPaintRevisits: 0,
  maxUnnecessaryPaints: -1,
  disableLoopCheck: false,
};

const DEFAULT_CHALLENGE_CONFIG: SimulationConfig = {
  slotsPerFunction: { f1: 5, f2: 3, f3: 0, f4: 0, f5: 0 },
  maxSteps: 1000,
  gridSize: 16,
  colorRatios: { red: 1, green: 1, blue: 1 },
  minCoveragePercent: 80,
  conditionalPercent: 50,
  instructionWeights: { forward: 3, turn: 2, functionCall: 3, paint: 0 },
  minTiles: 12,
  minBoundingBox: 4,
  minTurns: 3,
  maxDenseTiles: 4,
  maxAvgExecutionsPerSlot: 8,
  minStackDepth: 2,
  minSelfCalls: 1,
  autoRestartAfter: 1000,
  minPathTraceRatio: 1.2,
  minPathLength: 20,
  minConditionals: 2,
  minPaintRevisits: 0,
  maxUnnecessaryPaints: -1,
  disableLoopCheck: false,
};

async function main() {
  console.log('=== Daily Puzzle Generation Script ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Get current pool counts
  const poolCounts = await getPoolCounts();
  console.log('\nCurrent pool counts:');
  for (const { challengeType, count } of poolCounts) {
    console.log(`  ${challengeType}: ${count} available`);
  }

  // Get active generation configs from database
  const dbConfigs = await getActiveConfigs();
  console.log(`\nFound ${dbConfigs.length} active generation configs in database`);

  // Determine what needs to be generated
  const toGenerate: { challengeType: ChallengeType; count: number; config: SimulationConfig }[] = [];

  for (const { challengeType, count } of poolCounts) {
    if (count < MIN_POOL_SIZE) {
      const needed = Math.min(MIN_POOL_SIZE - count, PUZZLES_TO_GENERATE);

      // Find configs for this challenge type and randomly select one
      const matchingConfigs = dbConfigs.filter(c => c.challenge_type === challengeType);
      let config: SimulationConfig;
      if (matchingConfigs.length > 0) {
        const randomIndex = Math.floor(Math.random() * matchingConfigs.length);
        const selectedConfig = matchingConfigs[randomIndex];
        console.log(`Using config "${selectedConfig.name}" for ${challengeType} (${matchingConfigs.length} available)`);
        config = selectedConfig.config;
      } else {
        console.log(`No active configs for ${challengeType}, using default`);
        config = challengeType === 'easy' ? DEFAULT_EASY_CONFIG : DEFAULT_CHALLENGE_CONFIG;
      }

      toGenerate.push({ challengeType, count: needed, config });
      console.log(`Will generate ${needed} ${challengeType} puzzles (pool has ${count}, min is ${MIN_POOL_SIZE})`);
    }
  }

  if (toGenerate.length === 0) {
    console.log('\nAll pools have sufficient puzzles. Nothing to generate.');
  } else {
    // Generate puzzles
    let totalGenerated = 0;
    for (const { challengeType, count, config } of toGenerate) {
      const generated = await generatePuzzlesForType(challengeType, config, count);
      totalGenerated += generated;
    }

    console.log(`\n=== Generation Complete ===`);
    console.log(`Total puzzles generated: ${totalGenerated}`);
  }

  // Check and select daily challenges
  const today = getTodayDate();
  const tomorrow = getTomorrowDate();

  console.log(`\n=== Checking Daily Challenges ===`);
  console.log(`Today: ${today}, Tomorrow: ${tomorrow}`);

  // TODAY: Only set up if missing (don't replace - may have leaderboard entries)
  console.log(`\n--- Today's Dailies (${today}) ---`);

  const hasTodayEasy = await hasDailyChallenge(today, 'easy');
  const hasTodayChallenge = await hasDailyChallenge(today, 'challenge');

  if (hasTodayEasy) {
    console.log('Easy daily already set for today');
  } else {
    console.log('No easy daily set for today, selecting one...');
    const success = await selectDailyPuzzle('easy', today);
    if (!success) {
      console.log('Failed to select easy daily puzzle for today');
    }
  }

  if (hasTodayChallenge) {
    console.log('Challenge daily already set for today');
  } else {
    console.log('No challenge daily set for today, selecting one...');
    const success = await selectDailyPuzzle('challenge', today);
    if (!success) {
      console.log('Failed to select challenge daily puzzle for today');
    }
  }

  // TOMORROW: Always swap out with fresh puzzles
  console.log(`\n--- Tomorrow's Dailies (${tomorrow}) ---`);

  // Delete existing tomorrow dailies and select fresh ones
  await deleteDailyChallenge(tomorrow, 'easy');
  console.log('Selecting fresh easy daily for tomorrow...');
  const easySuccess = await selectDailyPuzzle('easy', tomorrow);
  if (!easySuccess) {
    console.log('Failed to select easy daily puzzle for tomorrow');
  }

  await deleteDailyChallenge(tomorrow, 'challenge');
  console.log('Selecting fresh challenge daily for tomorrow...');
  const challengeSuccess = await selectDailyPuzzle('challenge', tomorrow);
  if (!challengeSuccess) {
    console.log('Failed to select challenge daily puzzle for tomorrow');
  }

  console.log('\n=== Script Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
