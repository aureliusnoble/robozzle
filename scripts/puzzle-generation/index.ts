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

// Failure tracking
interface FailureStats {
  candidateFailed: number;
  solverFailed: number;
  qualityFailed: number;
  pruneFailed: number;
}

// Main generation pipeline for a single puzzle
async function generateSinglePuzzle(
  category: MechanicCategory,
  index: number,
  attemptNum: number,
  seed?: number,
  verbose: boolean = false
): Promise<{ puzzle: GeneratedPuzzleConfig | null; failReason?: string }> {
  const puzzleId = generatePuzzleId(category, index);
  const title = generatePuzzleTitle(category, index);

  // Step 1: Generate candidate
  const candidateStart = Date.now();
  const candidate = generateCandidate(category, {}, seed);
  if (!candidate) {
    return { puzzle: null, failReason: 'candidate' };
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
    console.log(`    [Attempt ${attemptNum}] Generated from ${candidate.templateName}`);
    console.log(printGrid(puzzle.grid));
  }

  // Step 2: Run solver
  const solverStart = Date.now();
  const solverResult = solve(puzzle, {}, seed);
  const solverTime = Date.now() - solverStart;

  if (!solverResult.solved) {
    if (verbose) {
      console.log(`    [Attempt ${attemptNum}] Solver failed: ${solverResult.generations} gens, ${solverTime}ms`);
    }
    return { puzzle: null, failReason: 'solver' };
  }

  if (verbose) {
    console.log(`    [Attempt ${attemptNum}] Solved: ${solverResult.generations} gens, ${solverResult.fitness.instructionsUsed} inst, ${solverTime}ms`);
  }

  // Step 3: Quality check
  const quality = evaluateQuality(puzzle, solverResult, category);

  if (!quality.passed) {
    const reasons = Object.entries(quality.rejectionFlags)
      .filter(([, v]) => v)
      .map(([k]) => k);
    if (verbose) {
      console.log(`    [Attempt ${attemptNum}] Quality failed: ${reasons.join(', ')} (${quality.total.toFixed(0)})`);
    }
    return { puzzle: null, failReason: `quality:${reasons.join(',')}` };
  }

  // Step 4: Prune tiles
  const pruneResult = aggressivePrune(puzzle, solverResult.solution!);

  if (!pruneResult.stillSolvable) {
    if (verbose) console.log(`    [Attempt ${attemptNum}] Pruning broke solution`);
    return { puzzle: null, failReason: 'prune' };
  }

  // Step 5: Classify difficulty
  const prunedPuzzle = { ...puzzle, grid: pruneResult.prunedGrid };
  const difficultyResult = classifyDifficulty(prunedPuzzle, solverResult, category);

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

  return { puzzle: generatedPuzzle };
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
  const maxAttempts = target * 50; // Allow many retries
  const startTime = Date.now();

  const failures: FailureStats = {
    candidateFailed: 0,
    solverFailed: 0,
    qualityFailed: 0,
    pruneFailed: 0,
  };

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`Generating ${target} puzzles for: ${category}`);
  console.log(`  ${MECHANIC_DESCRIPTIONS[category]}`);
  console.log(`${'─'.repeat(60)}`);

  while (puzzles.length < target && attempts < maxAttempts) {
    attempts++;
    const seed = baseSeed ? baseSeed + attempts * 1337 : undefined;

    // Show progress every attempt
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = attempts > 0 ? (puzzles.length / attempts * 100).toFixed(0) : '0';
    process.stdout.write(`\r  [${puzzles.length}/${target}] Attempt ${attempts} | ${rate}% success | ${elapsed}s elapsed`);

    const result = await generateSinglePuzzle(category, puzzles.length, attempts, seed, verbose);

    if (result.puzzle) {
      puzzles.push(result.puzzle);
      // Clear line and print success
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(`  ✓ [${puzzles.length}/${target}] ${result.puzzle.title} (q:${result.puzzle.qualityScore.toFixed(0)} d:${result.puzzle.solverDifficultyScore.toFixed(0)})`);
    } else {
      // Track failure reason
      if (result.failReason === 'candidate') failures.candidateFailed++;
      else if (result.failReason === 'solver') failures.solverFailed++;
      else if (result.failReason?.startsWith('quality')) failures.qualityFailed++;
      else if (result.failReason === 'prune') failures.pruneFailed++;
    }

    // Periodic status update (every 25 attempts if not verbose)
    if (!verbose && attempts % 25 === 0 && puzzles.length < target) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      console.log(`  ... ${attempts} attempts: ${failures.candidateFailed} bad candidates, ${failures.solverFailed} unsolvable, ${failures.qualityFailed} low quality`);
    }
  }

  // Final summary for category
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`  Completed: ${puzzles.length}/${target} in ${totalTime}s (${attempts} attempts)`);
  console.log(`  Failures: ${failures.candidateFailed} candidate, ${failures.solverFailed} solver, ${failures.qualityFailed} quality, ${failures.pruneFailed} prune`);

  return puzzles;
}

// Main function
async function main() {
  const args = parseArgs();

  console.log('═'.repeat(60));
  console.log('  ROBOZZLE PUZZLE GENERATOR');
  console.log('═'.repeat(60));
  console.log(`  Target:   ${args.countPerCategory} puzzles per category`);
  console.log(`  Output:   ${args.upload ? 'Supabase + ' : ''}${args.output}`);
  if (args.seed) console.log(`  Seed:     ${args.seed}`);
  if (args.category) console.log(`  Category: ${args.category}`);
  if (args.verbose) console.log(`  Mode:     Verbose`);
  console.log('═'.repeat(60));

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

  const totalStart = Date.now();

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

  const totalTime = ((Date.now() - totalStart) / 1000).toFixed(1);

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
  console.log('\n' + '═'.repeat(60));
  console.log('  GENERATION SUMMARY');
  console.log('═'.repeat(60));
  console.log(`  Total puzzles: ${batch.totalGenerated}`);
  console.log(`  Total time:    ${totalTime}s`);
  console.log(`  Avg quality:   ${stats.averageQualityScore.toFixed(1)}`);
  console.log('\n  By category:');
  for (const [cat, count] of Object.entries(batch.byCategory)) {
    const bar = '█'.repeat(count) + '░'.repeat(args.countPerCategory - count);
    console.log(`    ${cat.padEnd(12)} ${bar} ${count}/${args.countPerCategory}`);
  }

  // Save to file
  saveBatchToFile(batch, args.output);

  // Upload to Supabase if requested
  if (args.upload) {
    console.log('\n  Uploading to Supabase...');

    try {
      const result = await uploadBatch(batch);

      if (result.success) {
        console.log(`  ✓ Uploaded ${result.uploaded} puzzles successfully`);
      } else {
        console.log(`  ⚠ Uploaded ${result.uploaded} puzzles, ${result.failed} failed`);
        for (const err of result.errors.slice(0, 5)) {
          console.log(`    - ${err}`);
        }
      }

      // Show pool stats
      const poolStats = await getPoolStats();
      if (poolStats) {
        console.log(`\n  Pool status: ${poolStats.unused}/${poolStats.total} unused`);
      }
    } catch (err) {
      console.error('  Upload failed:', err);
    }
  }

  console.log('\n' + '═'.repeat(60));
  console.log('  DONE!');
  console.log('═'.repeat(60));
}

// Run
main().catch(console.error);
