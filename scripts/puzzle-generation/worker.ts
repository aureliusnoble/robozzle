// Worker thread for parallel puzzle generation

import { parentPort, workerData } from 'worker_threads';
import type { Program, PuzzleConfig } from '../../src/engine/types';
import type { GeneratedPuzzleConfig } from './types';
import { generateSolution, countInstructions, getUsedFunctions } from './solution-generator';
import { buildGrid, centerGrid, countStars } from './grid-builder';
import { checkComplexity } from './complexity';
import { checkSimplicity } from './triviality';
import { aggressivePrune } from './pruner';
import { verifySolution } from './verifier';
import { TIMEOUT_CONFIG } from './config';

interface WorkerData {
  workerId: number;
  startAttempt: number;
  attemptsPerWorker: number;
  targetPuzzles: number;
  baseSeed?: number;
}

interface WorkerResult {
  workerId: number;
  puzzles: Array<{
    puzzle: GeneratedPuzzleConfig;
    solution: Program;
    complexityScore: number;
  }>;
  failures: {
    solution: number;
    grid: number;
    triviality: number;
    complexity: number;
    prune: number;
    verify: number;
    timeout: number;
  };
  attempts: number;
}

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
}

function generatePuzzleId(workerId: number, index: number): string {
  const timestamp = Date.now().toString(36);
  return `gen-${timestamp}-w${workerId}-${index}`;
}

function generatePuzzleTitle(index: number): string {
  const prefixes = ['Logic', 'Path', 'Maze', 'Flow', 'Code', 'Link', 'Loop', 'Branch'];
  const suffixes = ['Challenge', 'Puzzle', 'Quest', 'Trial', 'Test'];
  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[Math.floor(index / prefixes.length) % suffixes.length];
  return `${prefix} ${suffix} #${index + 1}`;
}

function generateSinglePuzzle(
  workerId: number,
  puzzleIndex: number,
  attemptNum: number,
  seed?: number
): { puzzle: WorkerResult['puzzles'][0] | null; failReason?: string } {
  const puzzleSeed = seed ? seed + attemptNum * 1337 : undefined;
  const timeout = new TimeoutController(TIMEOUT_CONFIG.perPuzzleMs);

  try {
    const solutionTemplate = generateSolution(puzzleSeed);

    if (!solutionTemplate.path || solutionTemplate.path.length < 5) {
      return { puzzle: null, failReason: 'solution' };
    }

    timeout.check();

    let puzzle: PuzzleConfig;
    try {
      puzzle = buildGrid(solutionTemplate, puzzleSeed);
      puzzle = centerGrid(puzzle);
    } catch {
      return { puzzle: null, failReason: 'grid' };
    }

    if (countStars(puzzle.grid) === 0) {
      return { puzzle: null, failReason: 'grid' };
    }

    timeout.check();

    if (!verifySolution(puzzle, solutionTemplate.program)) {
      return { puzzle: null, failReason: 'verify' };
    }

    timeout.check();

    const trivialityResult = checkSimplicity(puzzle, solutionTemplate.program, puzzleSeed);
    if (trivialityResult.isTooSimple) {
      return { puzzle: null, failReason: 'triviality' };
    }

    timeout.check();

    const complexityResult = checkComplexity(puzzle, solutionTemplate.program);
    if (!complexityResult.passed) {
      return { puzzle: null, failReason: 'complexity' };
    }

    timeout.check();

    const pruneResult = aggressivePrune(puzzle, solutionTemplate.program);
    if (!pruneResult.stillSolvable) {
      return { puzzle: null, failReason: 'prune' };
    }

    const prunedPuzzle = { ...puzzle, grid: pruneResult.prunedGrid };

    timeout.check();

    if (!verifySolution(prunedPuzzle, solutionTemplate.program)) {
      return { puzzle: null, failReason: 'verify' };
    }

    const postPruneComplexity = checkComplexity(prunedPuzzle, solutionTemplate.program);
    if (!postPruneComplexity.passed) {
      return { puzzle: null, failReason: 'complexity' };
    }

    const puzzleId = generatePuzzleId(workerId, puzzleIndex);
    const usedFunctions = getUsedFunctions(solutionTemplate.program);
    const title = generatePuzzleTitle(puzzleIndex);

    const generatedPuzzle: GeneratedPuzzleConfig = {
      ...prunedPuzzle,
      id: puzzleId,
      title,
      generationSource: 'generated',
      mechanicCategory: 'multi-func',
      solverDifficultyScore: postPruneComplexity.score,
      qualityScore: postPruneComplexity.score,
      solutionInstructionCount: countInstructions(solutionTemplate.program),
      solutionStepCount: postPruneComplexity.metrics.steps,
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
      return { puzzle: null, failReason: 'timeout' };
    }
    throw err;
  }
}

// Main worker logic
const data = workerData as WorkerData;
const result: WorkerResult = {
  workerId: data.workerId,
  puzzles: [],
  failures: {
    solution: 0,
    grid: 0,
    triviality: 0,
    complexity: 0,
    prune: 0,
    verify: 0,
    timeout: 0,
  },
  attempts: 0,
};

let attempt = data.startAttempt;
const maxAttempts = data.startAttempt + data.attemptsPerWorker;

while (result.puzzles.length < data.targetPuzzles && attempt < maxAttempts) {
  attempt++;
  result.attempts++;

  const seed = data.baseSeed ? data.baseSeed + attempt : undefined;
  const genResult = generateSinglePuzzle(data.workerId, result.puzzles.length, attempt, seed);

  if (genResult.puzzle) {
    result.puzzles.push(genResult.puzzle);
    // Send progress update
    parentPort?.postMessage({ type: 'progress', workerId: data.workerId, puzzlesFound: result.puzzles.length });
  } else {
    const reason = genResult.failReason || 'unknown';
    if (reason === 'solution') result.failures.solution++;
    else if (reason === 'grid') result.failures.grid++;
    else if (reason === 'triviality') result.failures.triviality++;
    else if (reason === 'complexity') result.failures.complexity++;
    else if (reason === 'prune') result.failures.prune++;
    else if (reason === 'verify') result.failures.verify++;
    else if (reason === 'timeout') result.failures.timeout++;
  }
}

// Send final result
parentPort?.postMessage({ type: 'done', result });
