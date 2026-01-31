#!/usr/bin/env npx tsx
/**
 * Solution-First Puzzle Generation Pipeline
 *
 * Usage:
 *   npx tsx scripts/puzzle-generation/index.ts [options]
 *
 * Options:
 *   --upload         Upload to Supabase (requires env vars)
 *   --output <path>  Output JSON file path (default: generated-puzzles.json)
 *   --count <n>      Number of puzzles to generate (default: 20)
 *   --seed <n>       Random seed for reproducibility
 *   --verbose        Show detailed progress
 *   --workers <n>    Number of parallel workers (default: CPU cores)
 */

import { Worker } from 'worker_threads';
import { cpus } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import type { Program, PuzzleConfig } from '../../src/engine/types';
import type { GeneratedPuzzleConfig, PuzzleBatch } from './types';
import { generateSolution, countInstructions, getUsedFunctions } from './solution-generator';
import { buildGrid, centerGrid, printGrid, countTiles, countStars } from './grid-builder';
import { checkComplexity, formatMetrics } from './complexity';
import { checkSimplicity } from './triviality';
import { verifyNoTrivialSolution, checkVerifierAvailable } from './rust-verifier';
import { aggressivePrune } from './pruner';
import { verifySolution } from './verifier';
import { uploadBatch, saveBatchToFile, getPoolStats } from './uploader';
import { TIMEOUT_CONFIG, getProfileByIndex, type PuzzleProfile } from './config';

// Global flag for Rust verifier availability
let useRustVerifier = false;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Timeout controller for bounded execution
class TimeoutController {
  private startTime: number;
  private timeoutMs: number;

  constructor(timeoutMs: number) {
    this.startTime = Date.now();
    this.timeoutMs = timeoutMs;
  }

  check(): void {
    if (this.isExpired()) {
      throw new Error('Timeout exceeded');
    }
  }

  isExpired(): boolean {
    return Date.now() - this.startTime >= this.timeoutMs;
  }

  remaining(): number {
    return Math.max(0, this.timeoutMs - (Date.now() - this.startTime));
  }

  elapsed(): number {
    return Date.now() - this.startTime;
  }
}

// Parse command line arguments
function parseArgs(): {
  upload: boolean;
  output: string;
  count: number;
  seed?: number;
  verbose: boolean;
  workers: number;
} {
  const args = process.argv.slice(2);
  const result = {
    upload: false,
    output: 'generated-puzzles.json',
    count: 20,
    seed: undefined as number | undefined,
    verbose: false,
    workers: cpus().length,
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
        result.count = parseInt(args[++i], 10);
        break;
      case '--seed':
        result.seed = parseInt(args[++i], 10);
        break;
      case '--verbose':
      case '-v':
        result.verbose = true;
        break;
      case '--workers':
      case '-w':
        result.workers = parseInt(args[++i], 10);
        break;
    }
  }

  return result;
}

// Generate a unique puzzle ID
function generatePuzzleId(index: number): string {
  const timestamp = Date.now().toString(36);
  return `gen-${timestamp}-${index}`;
}

// Generate a puzzle title - just numbered
function generatePuzzleTitle(index: number): string {
  return `Puzzle #${index + 1}`;
}

// Failure tracking
interface FailureStats {
  solutionFailed: number;
  gridFailed: number;
  trivialityFailed: number;
  complexityFailed: number;
  pruneFailed: number;
  verifyFailed: number;
  timeoutFailed: number;
}

// Generated puzzle result
interface GeneratedPuzzle {
  puzzle: GeneratedPuzzleConfig;
  solution: Program;
  complexityScore: number;
}

// Main generation pipeline for a single puzzle
// New pipeline order: Generate -> Build -> Triviality (fast) -> Complexity -> Prune -> Verify
async function generateSinglePuzzle(
  index: number,
  attemptNum: number,
  profile: PuzzleProfile,
  seed?: number,
  verbose: boolean = false
): Promise<{ puzzle: GeneratedPuzzle | null; failReason?: string }> {
  const puzzleSeed = seed ? seed + attemptNum * 1337 : undefined;

  // Per-puzzle timeout
  const timeout = new TimeoutController(TIMEOUT_CONFIG.perPuzzleMs);

  try {
    // Step 1: Generate solution with profile-specific requirements
    if (verbose) {
      console.log(`    [Attempt ${attemptNum}] Generating solution (${profile.name})...`);
    }

    const solutionTemplate = generateSolution(puzzleSeed, profile);

    if (!solutionTemplate.path || solutionTemplate.path.length < 5) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Solution generation failed: path too short`);
      }
      return { puzzle: null, failReason: 'solution' };
    }

    timeout.check();

    // Step 2: Build grid from solution path
    if (verbose) {
      console.log(`    [Attempt ${attemptNum}] Building grid from path (${solutionTemplate.path.length} segments)...`);
    }

    let puzzle: PuzzleConfig;
    try {
      puzzle = buildGrid(solutionTemplate, puzzleSeed);
      puzzle = centerGrid(puzzle);
    } catch (err) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Grid building failed: ${err}`);
      }
      return { puzzle: null, failReason: 'grid' };
    }

    // Verify grid has stars
    if (countStars(puzzle.grid) === 0) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Grid has no stars`);
      }
      return { puzzle: null, failReason: 'grid' };
    }

    timeout.check();

    // Step 3: Verify solution works on grid (quick check)
    if (verbose) console.log(`    [Attempt ${attemptNum}] Verifying solution...`);
    if (!verifySolution(puzzle, solutionTemplate.program)) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Solution verification failed`);
        console.log(printGrid(puzzle.grid));
      }
      return { puzzle: null, failReason: 'verify' };
    }

    timeout.check();

    // Step 4: Check triviality BEFORE pruning (easier to find trivial solutions on unpruned grid)
    if (verbose) console.log(`    [Attempt ${attemptNum}] Checking triviality...`);

    let trivialityFailed = false;
    let trivialityReason = '';

    if (useRustVerifier) {
      // Use fast Rust verifier
      try {
        const rustResult = await verifyNoTrivialSolution(puzzle, {
          timeoutSeconds: 10, // Shorter timeout for unpruned grid
          maxInstructions: 12,
        });
        if (!rustResult.valid) {
          trivialityFailed = true;
          trivialityReason = rustResult.reason || 'trivial solution found';
        }
      } catch (err) {
        // Fall back to TypeScript checker on error
        const tsResult = checkSimplicity(puzzle, solutionTemplate.program, puzzleSeed);
        trivialityFailed = tsResult.isTooSimple;
        trivialityReason = tsResult.reason || 'too simple';
      }
    } else {
      // Use TypeScript fallback
      const tsResult = checkSimplicity(puzzle, solutionTemplate.program, puzzleSeed);
      trivialityFailed = tsResult.isTooSimple;
      trivialityReason = tsResult.reason || 'too simple';
    }

    if (trivialityFailed) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Triviality check failed: ${trivialityReason}`);
      }
      return { puzzle: null, failReason: `triviality:${trivialityReason}` };
    }

    timeout.check();

    // Step 5: Check complexity bounds (using profile-specific requirements)
    if (verbose) console.log(`    [Attempt ${attemptNum}] Checking complexity...`);
    const complexityResult = checkComplexity(puzzle, solutionTemplate.program, profile);

    if (!complexityResult.passed) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Complexity check failed: ${complexityResult.reason}`);
        console.log(`      Metrics: ${formatMetrics(complexityResult.metrics)}`);
      }
      return { puzzle: null, failReason: `complexity:${complexityResult.reason}` };
    }

    timeout.check();

    // Step 6: Prune unused tiles
    if (verbose) console.log(`    [Attempt ${attemptNum}] Pruning tiles...`);
    const pruneResult = aggressivePrune(puzzle, solutionTemplate.program);

    if (!pruneResult.stillSolvable) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Pruning broke solution`);
      }
      return { puzzle: null, failReason: 'prune' };
    }

    const prunedPuzzle = { ...puzzle, grid: pruneResult.prunedGrid };

    timeout.check();

    // Step 7: Re-verify after pruning
    if (verbose) console.log(`    [Attempt ${attemptNum}] Re-verifying after prune...`);
    if (!verifySolution(prunedPuzzle, solutionTemplate.program)) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Post-prune verification failed`);
      }
      return { puzzle: null, failReason: 'verify' };
    }

    // Re-check complexity after pruning (metrics may have changed slightly)
    if (verbose) console.log(`    [Attempt ${attemptNum}] Re-checking complexity...`);
    const postPruneComplexity = checkComplexity(prunedPuzzle, solutionTemplate.program, profile);
    if (!postPruneComplexity.passed) {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Post-prune complexity check failed: ${postPruneComplexity.reason}`);
      }
      return { puzzle: null, failReason: `complexity:${postPruneComplexity.reason}` };
    }

    // Success! Create final puzzle config
    const puzzleId = generatePuzzleId(index);
    const title = generatePuzzleTitle(index);

    const generatedPuzzle: GeneratedPuzzleConfig = {
      ...prunedPuzzle,
      id: puzzleId,
      title,
      generationSource: 'generated',
      profileName: profile.name,
      solverDifficultyScore: postPruneComplexity.score,
      qualityScore: postPruneComplexity.score,
      solutionInstructionCount: countInstructions(solutionTemplate.program),
      solutionStepCount: postPruneComplexity.metrics.steps,
      usesPainting: solutionTemplate.usesPainting,
      solution: solutionTemplate.program,
    };

    return {
      puzzle: {
        puzzle: generatedPuzzle,
        solution: solutionTemplate.program,
        complexityScore: postPruneComplexity.score,
      },
    };
  } catch (err) {
    if (err instanceof Error && err.message === 'Timeout exceeded') {
      if (verbose) {
        console.log(`    [Attempt ${attemptNum}] Timeout exceeded`);
      }
      return { puzzle: null, failReason: 'timeout' };
    }
    throw err;
  }
}

// Main generation loop
async function generatePuzzles(
  count: number,
  baseSeed?: number,
  verbose: boolean = false
): Promise<GeneratedPuzzle[]> {
  const puzzles: GeneratedPuzzle[] = [];
  let attempts = 0;
  const maxAttempts = count * 50;
  const startTime = Date.now();

  // Total generation timeout
  const totalTimeout = new TimeoutController(TIMEOUT_CONFIG.totalGenerationMs);

  const failures: FailureStats = {
    solutionFailed: 0,
    gridFailed: 0,
    trivialityFailed: 0,
    complexityFailed: 0,
    pruneFailed: 0,
    verifyFailed: 0,
    timeoutFailed: 0,
  };

  console.log(`\nGenerating ${count} puzzles...`);
  console.log('─'.repeat(60));

  while (puzzles.length < count && attempts < maxAttempts) {
    // Check total generation timeout
    if (totalTimeout.isExpired()) {
      console.log(`\n  Total generation timeout reached (${TIMEOUT_CONFIG.totalGenerationMs / 1000}s)`);
      break;
    }

    attempts++;
    const seed = baseSeed ? baseSeed + attempts : undefined;

    // Get profile for this puzzle (cycles through profiles)
    const profile = getProfileByIndex(puzzles.length);

    // Progress update
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const rate = attempts > 0 ? (puzzles.length / attempts * 100).toFixed(0) : '0';
    process.stdout.write(`\r  [${puzzles.length}/${count}] Attempt ${attempts} | ${rate}% success | ${elapsed}s elapsed`);

    const result = await generateSinglePuzzle(puzzles.length, attempts, profile, seed, verbose);

    if (result.puzzle) {
      puzzles.push(result.puzzle);
      // Clear line and print success
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const p = result.puzzle.puzzle;
      const profileTag = profile.requirements.requiresPainting ? ' [Paint]' : '';
      console.log(`  ✓ [${puzzles.length}/${count}] ${p.title}${profileTag} (${profile.name}, score: ${result.puzzle.complexityScore.toFixed(1)})`);
    } else {
      // Track failure reason
      const reason = result.failReason || 'unknown';
      if (reason === 'solution') failures.solutionFailed++;
      else if (reason === 'grid') failures.gridFailed++;
      else if (reason.startsWith('triviality')) failures.trivialityFailed++;
      else if (reason.startsWith('complexity')) failures.complexityFailed++;
      else if (reason === 'prune') failures.pruneFailed++;
      else if (reason === 'verify') failures.verifyFailed++;
      else if (reason === 'timeout') failures.timeoutFailed++;
    }

    // Periodic status update
    if (!verbose && attempts % 25 === 0 && puzzles.length < count) {
      process.stdout.write('\r' + ' '.repeat(80) + '\r');
      const failSummary = [
        failures.solutionFailed && `sol:${failures.solutionFailed}`,
        failures.gridFailed && `grid:${failures.gridFailed}`,
        failures.trivialityFailed && `trivial:${failures.trivialityFailed}`,
        failures.complexityFailed && `cmplx:${failures.complexityFailed}`,
        failures.verifyFailed && `verify:${failures.verifyFailed}`,
        failures.timeoutFailed && `timeout:${failures.timeoutFailed}`,
      ].filter(Boolean).join(' ');
      console.log(`  ... ${attempts} attempts | ${failSummary}`);
    }
  }

  // Final summary
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  process.stdout.write('\r' + ' '.repeat(80) + '\r');
  console.log(`\nCompleted: ${puzzles.length}/${count} in ${totalTime}s (${attempts} attempts)`);
  console.log(`Failures: solution=${failures.solutionFailed}, grid=${failures.gridFailed}, triviality=${failures.trivialityFailed}, complexity=${failures.complexityFailed}, verify=${failures.verifyFailed}, prune=${failures.pruneFailed}, timeout=${failures.timeoutFailed}`);

  return puzzles;
}

// Parallel generation using worker threads
async function generatePuzzlesParallel(
  count: number,
  numWorkers: number,
  baseSeed?: number
): Promise<GeneratedPuzzle[]> {
  const startTime = Date.now();
  const puzzlesPerWorker = Math.ceil(count / numWorkers);
  const attemptsPerWorker = puzzlesPerWorker * 50;

  console.log(`\nGenerating ${count} puzzles using ${numWorkers} workers...`);
  console.log('─'.repeat(60));

  const workerPath = join(__dirname, 'worker.ts');
  const workers: Worker[] = [];
  const results: GeneratedPuzzle[] = [];
  const totalFailures = {
    solution: 0,
    grid: 0,
    triviality: 0,
    complexity: 0,
    prune: 0,
    verify: 0,
    timeout: 0,
  };
  let totalAttempts = 0;
  const workerProgress: number[] = new Array(numWorkers).fill(0);

  const updateProgress = () => {
    const total = workerProgress.reduce((a, b) => a + b, 0);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    process.stdout.write(`\r  [${total}/${count}] ${elapsed}s elapsed | Workers: ${workerProgress.join(', ')}`);
  };

  const workerPromises = Array.from({ length: numWorkers }, (_, i) => {
    return new Promise<void>((resolve, reject) => {
      const worker = new Worker(workerPath, {
        workerData: {
          workerId: i,
          startAttempt: i * attemptsPerWorker,
          attemptsPerWorker,
          targetPuzzles: puzzlesPerWorker,
          baseSeed,
        },
        execArgv: ['--import', 'tsx'],
      });

      workers.push(worker);

      worker.on('message', (msg) => {
        if (msg.type === 'progress') {
          workerProgress[msg.workerId] = msg.puzzlesFound;
          updateProgress();
        } else if (msg.type === 'done') {
          const r = msg.result;
          results.push(...r.puzzles);
          totalAttempts += r.attempts;
          totalFailures.solution += r.failures.solution;
          totalFailures.grid += r.failures.grid;
          totalFailures.triviality += r.failures.triviality;
          totalFailures.complexity += r.failures.complexity;
          totalFailures.prune += r.failures.prune;
          totalFailures.verify += r.failures.verify;
          totalFailures.timeout += r.failures.timeout;
          resolve();
        }
      });

      worker.on('error', reject);
      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker ${i} exited with code ${code}`));
        }
      });
    });
  });

  await Promise.all(workerPromises);

  // Terminate all workers
  for (const worker of workers) {
    await worker.terminate();
  }

  // Clear progress line
  process.stdout.write('\r' + ' '.repeat(80) + '\r');

  // Print results
  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\nCompleted: ${results.length}/${count} in ${totalTime}s (${totalAttempts} total attempts)`);
  console.log(`Failures: solution=${totalFailures.solution}, grid=${totalFailures.grid}, triviality=${totalFailures.triviality}, complexity=${totalFailures.complexity}, verify=${totalFailures.verify}, prune=${totalFailures.prune}, timeout=${totalFailures.timeout}`);

  // Return only the requested number of puzzles
  return results.slice(0, count);
}

// Main function
async function main() {
  const args = parseArgs();

  console.log('═'.repeat(60));
  console.log('  ROBOZZLE SOLUTION-FIRST PUZZLE GENERATOR');
  console.log('═'.repeat(60));
  console.log(`  Target:   ${args.count} puzzles`);
  console.log(`  Output:   ${args.upload ? 'Supabase + ' : ''}${args.output}`);
  console.log(`  Workers:  ${args.workers}`);
  if (args.seed) console.log(`  Seed:     ${args.seed}`);
  if (args.verbose) console.log(`  Mode:     Verbose`);

  // Check for Rust verifier availability
  useRustVerifier = await checkVerifierAvailable();
  console.log(`  Verifier: ${useRustVerifier ? 'Rust (fast)' : 'TypeScript (fallback)'}`);
  console.log('═'.repeat(60));

  // Use parallel generation if workers > 1 and not verbose
  const generatedPuzzles = args.workers > 1 && !args.verbose
    ? await generatePuzzlesParallel(args.count, args.workers, args.seed)
    : await generatePuzzles(args.count, args.seed, args.verbose);

  // Create batch
  const batch: PuzzleBatch = {
    puzzles: generatedPuzzles.map(g => g.puzzle),
    generatedAt: new Date(),
    totalGenerated: generatedPuzzles.length,
    totalPassed: generatedPuzzles.length,
    byCategory: {
      conditionals: 0,
      recursion: 0,
      painting: 0,
      'multi-func': generatedPuzzles.length, // All puzzles are multi-mechanic
      loop: 0,
    },
  };

  // Print summary stats
  if (generatedPuzzles.length > 0) {
    const avgScore = generatedPuzzles.reduce((sum, p) => sum + p.complexityScore, 0) / generatedPuzzles.length;
    const avgTiles = generatedPuzzles.reduce((sum, p) => sum + countTiles(p.puzzle.grid), 0) / generatedPuzzles.length;
    const avgStars = generatedPuzzles.reduce((sum, p) => sum + countStars(p.puzzle.grid), 0) / generatedPuzzles.length;

    console.log('\n' + '─'.repeat(60));
    console.log('  STATISTICS');
    console.log('─'.repeat(60));
    console.log(`  Avg complexity score: ${avgScore.toFixed(1)}`);
    console.log(`  Avg tiles:            ${avgTiles.toFixed(1)}`);
    console.log(`  Avg stars:            ${avgStars.toFixed(1)}`);
  }

  // Save to file
  console.log('\n' + '─'.repeat(60));
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
