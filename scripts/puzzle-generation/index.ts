#!/usr/bin/env npx tsx
/**
 * Main entry point for puzzle generation
 *
 * Usage:
 *   npx tsx scripts/puzzle-generation/index.ts [options]
 *
 * Options:
 *   --upload         Upload to Supabase (requires env vars)
 *   --output <path>  Output JSON file path (default: generated-puzzles.json)
 *   --count <n>      Puzzles per category (default: 24)
 *   --category <cat> Generate only for specific category
 *   --seed <n>       Random seed for reproducibility
 *   --verbose        Show detailed progress
 */

import type { GeneratedPuzzleConfig, GenerationStats, MechanicCategory, PuzzleBatch } from './types';
import { TARGET_POOL_SIZE, MECHANIC_DESCRIPTIONS } from './config';
import { generateCandidate, printGrid } from './generator';
import { solve } from './solver';
import { evaluateQuality } from './quality';
import { aggressivePrune } from './pruner';
import { classifyDifficulty, getDifficultyDescription } from './difficulty';
import { uploadBatch, saveBatchToFile, getPoolStats } from './uploader';

// Parse command line arguments
function parseArgs(): {
  upload: boolean;
  output: string;
  countPerCategory: number;
  category?: MechanicCategory;
  seed?: number;
  verbose: boolean;
} {
  const args = process.argv.slice(2);
  const result = {
    upload: false,
    output: 'generated-puzzles.json',
    countPerCategory: 24,
    category: undefined as MechanicCategory | undefined,
    seed: undefined as number | undefined,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--upload':
        result.upload = true;
        break;
      case '--output':
        result.output = args[++i];
        break;
      case '--count':
        result.countPerCategory = parseInt(args[++i], 10);
        break;
      case '--category':
        result.category = args[++i] as MechanicCategory;
        break;
      case '--seed':
        result.seed = parseInt(args[++i], 10);
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
    }
  }

  return result;
}

// Generate a unique puzzle ID
function generatePuzzleId(category: MechanicCategory, index: number): string {
  const timestamp = Date.now().toString(36);
  return `gen-${category}-${timestamp}-${index}`;
}

// Generate a puzzle title
function generatePuzzleTitle(category: MechanicCategory, index: number): string {
  const categoryNames: Record<MechanicCategory, string> = {
    conditionals: 'Color Logic',
    recursion: 'Recursive Path',
    painting: 'Paint Trail',
    'multi-func': 'Function Dance',
    loop: 'Loop Master',
  };
  return `${categoryNames[category]} #${index + 1}`;
}

// Main generation pipeline for a single puzzle
async function generateSinglePuzzle(
  category: MechanicCategory,
  index: number,
  seed?: number,
  verbose: boolean = false
): Promise<GeneratedPuzzleConfig | null> {
  const puzzleId = generatePuzzleId(category, index);
  const title = generatePuzzleTitle(category, index);

  // Step 1: Generate candidate
  const candidate = generateCandidate(category, {}, seed);
  if (!candidate) {
    if (verbose) console.log(`  [${puzzleId}] Failed to generate candidate`);
    return null;
  }

  // Convert to puzzle config
  const puzzle = {
    id: puzzleId,
    title,
    grid: candidate.grid,
    robotStart: candidate.robotStart,
    functionLengths: candidate.functionLengths,
    allowedInstructions: candidate.allowedInstructions,
    category: 'daily' as const,
    difficulty: 'hard' as const,
  };

  if (verbose) {
    console.log(`  [${puzzleId}] Generated candidate from ${candidate.templateName}`);
    console.log(printGrid(puzzle.grid));
  }

  // Step 2: Run solver
  const solverResult = solve(puzzle, {}, seed);

  if (!solverResult.solved) {
    if (verbose) console.log(`  [${puzzleId}] Solver failed after ${solverResult.generations} generations`);
    return null;
  }

  if (verbose) {
    console.log(`  [${puzzleId}] Solved in ${solverResult.generations} generations, ${solverResult.fitness.instructionsUsed} instructions`);
  }

  // Step 3: Quality check
  const quality = evaluateQuality(puzzle, solverResult, category);

  if (!quality.passed) {
    if (verbose) {
      const reasons = Object.entries(quality.rejectionFlags)
        .filter(([, v]) => v)
        .map(([k]) => k);
      console.log(`  [${puzzleId}] Quality check failed: ${reasons.join(', ')} (score: ${quality.total.toFixed(1)})`);
    }
    return null;
  }

  if (verbose) {
    console.log(`  [${puzzleId}] Quality passed: ${quality.total.toFixed(1)}/100`);
  }

  // Step 4: Prune tiles
  const pruneResult = aggressivePrune(puzzle, solverResult.solution!);

  if (!pruneResult.stillSolvable) {
    if (verbose) console.log(`  [${puzzleId}] Pruning broke solution`);
    return null;
  }

  if (verbose && pruneResult.tilesRemoved > 0) {
    console.log(`  [${puzzleId}] Pruned ${pruneResult.tilesRemoved} tiles`);
  }

  // Step 5: Classify difficulty
  const prunedPuzzle = { ...puzzle, grid: pruneResult.prunedGrid };
  const difficultyResult = classifyDifficulty(prunedPuzzle, solverResult, category);

  if (verbose) {
    console.log(`  [${puzzleId}] Difficulty: ${getDifficultyDescription(difficultyResult)} (${difficultyResult.score.toFixed(1)})`);
  }

  // Create final puzzle config
  const generatedPuzzle: GeneratedPuzzleConfig = {
    ...prunedPuzzle,
    generationSource: 'generated',
    mechanicCategory: category,
    solverDifficultyScore: difficultyResult.score,
    qualityScore: quality.total,
    solutionInstructionCount: solverResult.fitness.instructionsUsed,
    solutionStepCount: solverResult.fitness.stepsUsed,
    solution: solverResult.solution!,
  };

  return generatedPuzzle;
}

// Generate puzzles for a category
async function generateForCategory(
  category: MechanicCategory,
  target: number,
  baseSeed?: number,
  verbose: boolean = false
): Promise<GeneratedPuzzleConfig[]> {
  const puzzles: GeneratedPuzzleConfig[] = [];
  let attempts = 0;
  const maxAttempts = target * 20; // Allow many retries

  console.log(`\nGenerating ${target} puzzles for ${category}...`);
  console.log(`  ${MECHANIC_DESCRIPTIONS[category]}`);

  while (puzzles.length < target && attempts < maxAttempts) {
    const seed = baseSeed ? baseSeed + attempts * 1337 : undefined;

    const puzzle = await generateSinglePuzzle(category, puzzles.length, seed, verbose);

    if (puzzle) {
      puzzles.push(puzzle);
      console.log(`  ✓ [${puzzles.length}/${target}] ${puzzle.title} (quality: ${puzzle.qualityScore.toFixed(0)}, difficulty: ${puzzle.solverDifficultyScore.toFixed(0)})`);
    }

    attempts++;

    // Progress indicator for non-verbose mode
    if (!verbose && attempts % 10 === 0 && puzzles.length < target) {
      process.stdout.write('.');
    }
  }

  console.log(`\n  Completed: ${puzzles.length}/${target} puzzles (${attempts} attempts)`);
  return puzzles;
}

// Main function
async function main() {
  const args = parseArgs();

  console.log('='.repeat(60));
  console.log('Robozzle Puzzle Generator');
  console.log('='.repeat(60));
  console.log(`Target: ${args.countPerCategory} puzzles per category`);
  console.log(`Output: ${args.upload ? 'Supabase + ' : ''}${args.output}`);
  if (args.seed) console.log(`Seed: ${args.seed}`);
  if (args.category) console.log(`Category: ${args.category}`);
  console.log('');

  const categories: MechanicCategory[] = args.category
    ? [args.category]
    : ['conditionals', 'recursion', 'painting', 'multi-func', 'loop'];

  const allPuzzles: GeneratedPuzzleConfig[] = [];
  const stats: GenerationStats = {
    attempted: 0,
    solvable: 0,
    passedQuality: 0,
    byCategory: {
      conditionals: { attempted: 0, solvable: 0, passed: 0 },
      recursion: { attempted: 0, solvable: 0, passed: 0 },
      painting: { attempted: 0, solvable: 0, passed: 0 },
      'multi-func': { attempted: 0, solvable: 0, passed: 0 },
      loop: { attempted: 0, solvable: 0, passed: 0 },
    },
    averageSolverGenerations: 0,
    averageQualityScore: 0,
  };

  // Generate for each category
  for (const category of categories) {
    const puzzles = await generateForCategory(
      category,
      args.countPerCategory,
      args.seed,
      args.verbose
    );

    allPuzzles.push(...puzzles);
    stats.byCategory[category].passed = puzzles.length;
  }

  // Calculate averages
  if (allPuzzles.length > 0) {
    stats.passedQuality = allPuzzles.length;
    stats.averageQualityScore = allPuzzles.reduce((sum, p) => sum + p.qualityScore, 0) / allPuzzles.length;
  }

  // Create batch
  const batch: PuzzleBatch = {
    puzzles: allPuzzles,
    generatedAt: new Date(),
    totalGenerated: allPuzzles.length,
    totalPassed: allPuzzles.length,
    byCategory: {
      conditionals: allPuzzles.filter(p => p.mechanicCategory === 'conditionals').length,
      recursion: allPuzzles.filter(p => p.mechanicCategory === 'recursion').length,
      painting: allPuzzles.filter(p => p.mechanicCategory === 'painting').length,
      'multi-func': allPuzzles.filter(p => p.mechanicCategory === 'multi-func').length,
      loop: allPuzzles.filter(p => p.mechanicCategory === 'loop').length,
    },
  };

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('Generation Summary');
  console.log('='.repeat(60));
  console.log(`Total puzzles: ${batch.totalGenerated}`);
  console.log(`Average quality score: ${stats.averageQualityScore.toFixed(1)}`);
  console.log('\nBy category:');
  for (const [cat, count] of Object.entries(batch.byCategory)) {
    console.log(`  ${cat}: ${count}`);
  }

  // Save to file
  saveBatchToFile(batch, args.output);

  // Upload to Supabase if requested
  if (args.upload) {
    console.log('\nUploading to Supabase...');

    try {
      const result = await uploadBatch(batch);

      if (result.success) {
        console.log(`✓ Uploaded ${result.uploaded} puzzles successfully`);
      } else {
        console.log(`⚠ Uploaded ${result.uploaded} puzzles, ${result.failed} failed`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`  - ${err}`);
        }
      }

      // Show pool stats
      const poolStats = await getPoolStats();
      if (poolStats) {
        console.log(`\nPool status: ${poolStats.unused}/${poolStats.total} unused`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
    }
  }

  console.log('\nDone!');
}

// Run
main().catch(console.error);
