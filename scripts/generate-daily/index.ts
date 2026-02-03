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
    title: `Daily ${challengeType === 'easy' ? 'Easy' : 'Challenge'} ${new Date().toISOString().split('T')[0]}`,
    description: `Auto-generated ${challengeType} puzzle`,
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
  console.log(`\nGenerating ${count} ${challengeType} puzzles...`);

  const engine = new SimulationEngine(config);
  let generated = 0;

  for (let i = 0; i < count; i++) {
    console.log(`\nAttempting puzzle ${i + 1}/${count}...`);

    const startTime = Date.now();
    const result = engine.generate(MAX_GENERATION_TIME_MS);

    if (result.success && result.puzzle && result.solution) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`Generated puzzle in ${elapsed}s after ${result.attempts} attempts`);

      const qualityScore = calculateQualityScore(result, config);
      const success = await uploadPuzzle(
        result.puzzle,
        result.solution,
        challengeType,
        qualityScore
      );

      if (success) {
        generated++;
      }
    } else {
      console.log(`Failed to generate puzzle after ${result.attempts} attempts`);
      if (result.errorType) {
        console.log(`Last error type: ${result.errorType}`);
      }
    }
  }

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

      // Find config for this challenge type
      const dbConfig = dbConfigs.find(c => c.challenge_type === challengeType);
      const config = dbConfig?.config ||
        (challengeType === 'easy' ? DEFAULT_EASY_CONFIG : DEFAULT_CHALLENGE_CONFIG);

      toGenerate.push({ challengeType, count: needed, config });
      console.log(`Will generate ${needed} ${challengeType} puzzles (pool has ${count}, min is ${MIN_POOL_SIZE})`);
    }
  }

  if (toGenerate.length === 0) {
    console.log('\nAll pools have sufficient puzzles. Nothing to generate.');
    return;
  }

  // Generate puzzles
  let totalGenerated = 0;
  for (const { challengeType, count, config } of toGenerate) {
    const generated = await generatePuzzlesForType(challengeType, config, count);
    totalGenerated += generated;
  }

  console.log(`\n=== Generation Complete ===`);
  console.log(`Total puzzles generated: ${totalGenerated}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
