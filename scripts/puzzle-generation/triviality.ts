// Bounded exhaustive triviality checker
// Replaces unbounded genetic algorithm simplicity check

import type {
  FunctionName,
  Instruction,
  InstructionType,
  Program,
  PuzzleConfig,
  TileColor,
} from '../../src/engine/types';
import { runProgram, measureExecution } from './verifier';

// Configuration for triviality checking
export const TRIVIALITY_CONFIG = {
  maxProgramsToTest: 2000, // Absolute program limit
  maxStepsPerProgram: 100, // Hard cutoff per program
  timeoutMs: 1000, // 1 second max
};

// Hard requirements that a solution must meet to be considered valid
// If a bounded search finds a valid solution quickly, the puzzle is too easy
export const HARD_REQUIREMENTS = {
  minStackDepth: 3, // Recursive depth reached
  minFunctions: 2, // Functions used
  minConditionals: 3, // Conditionals applied
  minInstructions: 4, // Non-null instructions
  minSteps: 12, // Execution steps
  minStepsPerInstruction: 3, // 1:3 ratio
};

// Triviality check result
export interface TrivialityResult {
  isTrivial: boolean;
  programsTested: number;
  timeElapsedMs: number;
  reason?: string;
  trivialSolution?: Program;
  trivialMetrics?: {
    instructions: number;
    stackDepth: number;
    steps: number;
    functionsUsed: number;
    conditionals: number;
  };
}

// Check if metrics meet hard requirements
function meetsHardRequirements(metrics: {
  stackDepth: number;
  functionsUsed: number;
  conditionals: number;
  instructions: number;
  steps: number;
}): boolean {
  const stepsPerInstruction = metrics.steps / metrics.instructions;

  return (
    metrics.stackDepth >= HARD_REQUIREMENTS.minStackDepth &&
    metrics.functionsUsed >= HARD_REQUIREMENTS.minFunctions &&
    metrics.conditionals >= HARD_REQUIREMENTS.minConditionals &&
    metrics.instructions >= HARD_REQUIREMENTS.minInstructions &&
    metrics.steps >= HARD_REQUIREMENTS.minSteps &&
    stepsPerInstruction >= HARD_REQUIREMENTS.minStepsPerInstruction
  );
}

// Get colors present in the puzzle grid
function getPuzzleColors(puzzle: PuzzleConfig): TileColor[] {
  const colors = new Set<TileColor>();
  for (const row of puzzle.grid) {
    for (const tile of row) {
      if (tile?.color) colors.add(tile.color);
    }
  }
  return Array.from(colors);
}

// Check if a program is valid for the puzzle
function isValidProgram(program: Program, puzzle: PuzzleConfig): boolean {
  // Must have at least one forward instruction
  let hasForward = false;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst?.type === 'forward') {
        hasForward = true;
        break;
      }
    }
    if (hasForward) break;
  }
  if (!hasForward) return false;

  // Check for unreachable functions: if F2 is called but empty, skip
  const calledFunctions = new Set<FunctionName>();
  const nonEmptyFunctions = new Set<FunctionName>();

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    const func = program[funcName];
    let hasNonNull = false;
    for (const inst of func) {
      if (inst !== null) {
        hasNonNull = true;
        if (
          inst.type === 'f1' ||
          inst.type === 'f2' ||
          inst.type === 'f3' ||
          inst.type === 'f4' ||
          inst.type === 'f5'
        ) {
          calledFunctions.add(inst.type);
        }
      }
    }
    if (hasNonNull) {
      nonEmptyFunctions.add(funcName);
    }
  }

  // If a function is called but empty, invalid
  const calledArray = Array.from(calledFunctions);
  for (const called of calledArray) {
    if (!nonEmptyFunctions.has(called)) {
      return false;
    }
  }

  // Check for invalid conditions (condition color not in puzzle)
  const puzzleColors = new Set(getPuzzleColors(puzzle));
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst !== null && inst.condition !== null && !puzzleColors.has(inst.condition)) {
        return false;
      }
    }
  }

  return true;
}

// Program generator that enumerates programs in order of increasing complexity
class ProgramEnumerator {
  private puzzle: PuzzleConfig;
  private allowedInstructions: InstructionType[];
  private colors: TileColor[];
  private functionLengths: number[];
  private currentComplexity: number;
  private currentPrograms: Program[];
  private currentIndex: number;

  constructor(puzzle: PuzzleConfig) {
    this.puzzle = puzzle;
    this.allowedInstructions = puzzle.allowedInstructions;
    this.colors = getPuzzleColors(puzzle);
    this.functionLengths = [
      puzzle.functionLengths.f1,
      puzzle.functionLengths.f2,
      puzzle.functionLengths.f3,
      puzzle.functionLengths.f4,
      puzzle.functionLengths.f5,
    ];
    this.currentComplexity = 1;
    this.currentPrograms = [];
    this.currentIndex = 0;
  }

  // Get next program to test, or null if exhausted current batch
  next(): Program | null {
    while (this.currentIndex >= this.currentPrograms.length) {
      // Generate next batch of programs at current complexity
      this.currentPrograms = this.generateProgramsAtComplexity(this.currentComplexity);
      this.currentIndex = 0;
      this.currentComplexity++;

      // Stop if complexity exceeds reasonable limit
      if (this.currentComplexity > 8) {
        return null;
      }

      // Skip if no programs at this complexity
      if (this.currentPrograms.length === 0) {
        continue;
      }
    }

    return this.currentPrograms[this.currentIndex++];
  }

  // Generate all programs with exactly n non-null instructions
  private generateProgramsAtComplexity(n: number): Program[] {
    const programs: Program[] = [];
    const maxPrograms = 500; // Limit per complexity level to avoid explosion

    // Generate random programs at this complexity level
    // Use structured generation rather than pure random
    this.generateStructuredPrograms(n, programs, maxPrograms);

    // Filter to valid programs
    return programs.filter(p => isValidProgram(p, this.puzzle));
  }

  // Generate structured programs with n instructions
  private generateStructuredPrograms(
    n: number,
    programs: Program[],
    maxPrograms: number
  ): void {
    // Generate programs by distributing n instructions across functions
    // Focus on F1 + one other function for minimal complexity

    const totalSlots = this.functionLengths.reduce((a, b) => a + b, 0);
    if (n > totalSlots) return;

    // Simple strategy: generate random valid programs with n instructions
    const attempts = maxPrograms * 3;

    for (let attempt = 0; attempt < attempts && programs.length < maxPrograms; attempt++) {
      const program = this.generateRandomProgram(n);
      if (program && this.countInstructions(program) === n) {
        programs.push(program);
      }
    }
  }

  // Generate a random program with approximately targetInstructions non-null slots
  private generateRandomProgram(targetInstructions: number): Program | null {
    const program: Program = { f1: [], f2: [], f3: [], f4: [], f5: [] };

    // Initialize with nulls
    for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      const length = this.puzzle.functionLengths[funcName];
      program[funcName] = new Array(length).fill(null);
    }

    // Determine which slots to fill
    const allSlots: Array<{ func: FunctionName; idx: number }> = [];
    for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      const length = this.puzzle.functionLengths[funcName];
      for (let i = 0; i < length; i++) {
        allSlots.push({ func: funcName, idx: i });
      }
    }

    // Shuffle and pick first targetInstructions
    this.shuffle(allSlots);
    const slotsToFill = allSlots.slice(0, targetInstructions);

    // Fill selected slots
    for (const { func, idx } of slotsToFill) {
      const inst = this.randomInstruction();
      program[func][idx] = inst;
    }

    return program;
  }

  // Generate a random instruction
  private randomInstruction(): Instruction {
    const type = this.allowedInstructions[Math.floor(Math.random() * this.allowedInstructions.length)];
    const condition = Math.random() < 0.3 && this.colors.length > 0
      ? this.colors[Math.floor(Math.random() * this.colors.length)]
      : null;
    return { type, condition };
  }

  // Count non-null instructions
  private countInstructions(program: Program): number {
    let count = 0;
    for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      for (const inst of program[funcName]) {
        if (inst !== null) count++;
      }
    }
    return count;
  }

  // Fisher-Yates shuffle
  private shuffle<T>(arr: T[]): void {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }
}

// Main triviality check function
export function checkTriviality(
  puzzle: PuzzleConfig,
  intendedSolution: Program
): TrivialityResult {
  const startTime = Date.now();
  const enumerator = new ProgramEnumerator(puzzle);
  let programsTested = 0;

  // First, verify the intended solution meets requirements
  const intendedMetrics = measureExecution(puzzle, intendedSolution, TRIVIALITY_CONFIG.maxStepsPerProgram * 2);
  if (!intendedMetrics.solved) {
    return {
      isTrivial: false,
      programsTested: 0,
      timeElapsedMs: Date.now() - startTime,
      reason: 'intended solution does not solve puzzle',
    };
  }

  // Search for trivial solutions
  while (programsTested < TRIVIALITY_CONFIG.maxProgramsToTest) {
    // Check timeout
    const elapsed = Date.now() - startTime;
    if (elapsed >= TRIVIALITY_CONFIG.timeoutMs) {
      return {
        isTrivial: false,
        programsTested,
        timeElapsedMs: elapsed,
        reason: 'timeout reached without finding trivial solution',
      };
    }

    // Get next program to test
    const program = enumerator.next();
    if (!program) {
      break; // Exhausted enumeration
    }

    programsTested++;

    // Run the program with limited steps
    const result = runProgram(puzzle, program, TRIVIALITY_CONFIG.maxStepsPerProgram);

    if (result.solved) {
      // Found a solution - check if it meets hard requirements
      const metrics = measureExecution(puzzle, program, TRIVIALITY_CONFIG.maxStepsPerProgram);

      if (meetsHardRequirements(metrics)) {
        // Found a valid trivial solution - puzzle is too easy
        return {
          isTrivial: true,
          programsTested,
          timeElapsedMs: Date.now() - startTime,
          reason: `found valid trivial solution (${metrics.instructions} inst, stack ${metrics.stackDepth}, ${metrics.steps} steps)`,
          trivialSolution: program,
          trivialMetrics: {
            instructions: metrics.instructions,
            stackDepth: metrics.stackDepth,
            steps: metrics.steps,
            functionsUsed: metrics.functionsUsed,
            conditionals: metrics.conditionals,
          },
        };
      }
      // Solution found but doesn't meet requirements - not considered "trivial"
      // Continue searching
    }
  }

  // No trivial solution found
  return {
    isTrivial: false,
    programsTested,
    timeElapsedMs: Date.now() - startTime,
    reason: 'no trivial solution found within limits',
  };
}

// Compatibility wrapper for old API
export interface SimplicityResult {
  isTooSimple: boolean;
  intendedMetrics: {
    instructions: number;
    stackDepth: number;
    steps: number;
  };
  alternativeMetrics?: {
    instructions: number;
    stackDepth: number;
    steps: number;
  };
  reason?: string;
}

// Wrapper that matches the old checkSimplicity interface
export function checkSimplicity(
  puzzle: PuzzleConfig,
  intendedSolution: Program,
  _seed?: number
): SimplicityResult {
  const intendedMetrics = measureExecution(puzzle, intendedSolution);

  const result = checkTriviality(puzzle, intendedSolution);

  return {
    isTooSimple: result.isTrivial,
    intendedMetrics: {
      instructions: intendedMetrics.instructions,
      stackDepth: intendedMetrics.stackDepth,
      steps: intendedMetrics.steps,
    },
    alternativeMetrics: result.trivialMetrics
      ? {
          instructions: result.trivialMetrics.instructions,
          stackDepth: result.trivialMetrics.stackDepth,
          steps: result.trivialMetrics.steps,
        }
      : undefined,
    reason: result.reason,
  };
}
