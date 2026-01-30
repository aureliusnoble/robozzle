// Difficulty classification for generated puzzles

import type { FunctionName, Program, PuzzleConfig, Tile } from '../../src/engine/types';
import type { DifficultyResult, MechanicCategory, SolverResult } from './types';
import { DIFFICULTY_RANGES } from './config';

// Count instructions in a program
function countInstructions(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of program[funcName]) {
      if (instruction !== null) count++;
    }
  }
  return count;
}

// Count total slots in a puzzle
function countTotalSlots(puzzle: PuzzleConfig): number {
  return (
    puzzle.functionLengths.f1 +
    puzzle.functionLengths.f2 +
    puzzle.functionLengths.f3 +
    puzzle.functionLengths.f4 +
    puzzle.functionLengths.f5
  );
}

// Count active functions (functions with slots > 0)
function countActiveFunctions(puzzle: PuzzleConfig): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    if (puzzle.functionLengths[funcName] > 0) count++;
  }
  return count;
}

// Count colors in grid
function countColors(grid: (Tile | null)[][]): number {
  const colors = new Set<string>();
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.color) colors.add(tile.color);
    }
  }
  return colors.size;
}

// Count stars
function countStars(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.hasStar) count++;
    }
  }
  return count;
}

// Count tiles
function countTiles(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) count++;
    }
  }
  return count;
}

// Check if solution uses conditionals
function solutionUsesConditionals(solution: Program): boolean {
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction?.condition !== null) {
        return true;
      }
    }
  }
  return false;
}

// Check if solution uses recursion
function solutionUsesRecursion(solution: Program): boolean {
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction?.type === funcName) {
        return true;
      }
    }
  }
  return false;
}

// Check if solution uses painting
function solutionUsesPainting(solution: Program): boolean {
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction && ['paint_red', 'paint_green', 'paint_blue'].includes(instruction.type)) {
        return true;
      }
    }
  }
  return false;
}

// Calculate mechanic difficulty bonus
function getMechanicDifficultyScore(
  category: MechanicCategory,
  solution: Program,
  puzzle: PuzzleConfig
): number {
  let score = 0;

  // Base difficulty by category
  const categoryBase: Record<MechanicCategory, number> = {
    loop: 10,
    conditionals: 20,
    painting: 25,
    'multi-func': 30,
    recursion: 35,
  };

  score += categoryBase[category];

  // Additional complexity factors
  if (solutionUsesConditionals(solution)) {
    score += 10;
  }

  if (solutionUsesRecursion(solution)) {
    score += 15;
  }

  if (solutionUsesPainting(solution)) {
    score += 10;
  }

  // Multiple functions add complexity
  const activeFunctions = countActiveFunctions(puzzle);
  if (activeFunctions >= 3) {
    score += 10;
  } else if (activeFunctions >= 2) {
    score += 5;
  }

  return Math.min(50, score); // Cap at 50
}

// Calculate grid complexity score
function getGridComplexityScore(puzzle: PuzzleConfig): number {
  let score = 0;

  const tiles = countTiles(puzzle.grid);
  const colors = countColors(puzzle.grid);
  const stars = countStars(puzzle.grid);

  // More tiles = more complexity
  if (tiles >= 20) {
    score += 15;
  } else if (tiles >= 15) {
    score += 10;
  } else if (tiles >= 10) {
    score += 5;
  }

  // More colors = more complexity
  if (colors >= 3) {
    score += 10;
  } else if (colors >= 2) {
    score += 5;
  }

  // More stars can add complexity
  if (stars >= 4) {
    score += 10;
  } else if (stars >= 2) {
    score += 5;
  }

  return Math.min(25, score); // Cap at 25
}

// Calculate solution complexity score
function getSolutionComplexityScore(
  solution: Program,
  puzzle: PuzzleConfig,
  solverResult: SolverResult
): number {
  let score = 0;

  const instructionCount = countInstructions(solution);
  const totalSlots = countTotalSlots(puzzle);
  const usageRatio = totalSlots > 0 ? instructionCount / totalSlots : 0;

  // Instruction efficiency
  if (usageRatio >= 0.6 && usageRatio <= 0.8) {
    score += 15; // Sweet spot
  } else if (usageRatio >= 0.4) {
    score += 10;
  } else if (usageRatio >= 0.2) {
    score += 5;
  }

  // Stack depth during execution
  if (solverResult.fitness.maxStackDepth >= 5) {
    score += 15;
  } else if (solverResult.fitness.maxStackDepth >= 3) {
    score += 10;
  } else if (solverResult.fitness.maxStackDepth >= 2) {
    score += 5;
  }

  // Steps used
  if (solverResult.fitness.stepsUsed >= 100) {
    score += 10;
  } else if (solverResult.fitness.stepsUsed >= 50) {
    score += 5;
  }

  return Math.min(25, score); // Cap at 25
}

// Calculate generations needed score
function getGenerationsScore(generations: number): number {
  // More generations to find solution = harder puzzle
  if (generations >= 200) {
    return 25;
  } else if (generations >= 100) {
    return 20;
  } else if (generations >= 50) {
    return 15;
  } else if (generations >= 20) {
    return 10;
  } else if (generations >= 10) {
    return 5;
  }
  return 0;
}

// Main difficulty classification function
export function classifyDifficulty(
  puzzle: PuzzleConfig,
  solverResult: SolverResult,
  mechanicCategory: MechanicCategory
): DifficultyResult {
  if (!solverResult.solved || !solverResult.solution) {
    return {
      score: 100, // Maximum difficulty for unsolvable
      category: 'hard',
      factors: {
        generationsNeeded: 100,
        solutionComplexity: 0,
        mechanicDifficulty: 0,
        gridComplexity: 0,
      },
    };
  }

  const solution = solverResult.solution;

  // Calculate factor scores
  const generationsNeeded = getGenerationsScore(solverResult.generations);
  const solutionComplexity = getSolutionComplexityScore(solution, puzzle, solverResult);
  const mechanicDifficulty = getMechanicDifficultyScore(mechanicCategory, solution, puzzle);
  const gridComplexity = getGridComplexityScore(puzzle);

  // Calculate total score (0-100)
  const rawScore = generationsNeeded + solutionComplexity + mechanicDifficulty + gridComplexity;
  const score = Math.min(100, Math.max(0, rawScore));

  // Classify into medium or hard
  let category: 'medium' | 'hard';
  if (score >= DIFFICULTY_RANGES.hard.min) {
    category = 'hard';
  } else {
    category = 'medium';
  }

  return {
    score,
    category,
    factors: {
      generationsNeeded,
      solutionComplexity,
      mechanicDifficulty,
      gridComplexity,
    },
  };
}

// Check if difficulty is within acceptable range (medium-hard band)
export function isAcceptableDifficulty(result: DifficultyResult): boolean {
  return (
    result.score >= DIFFICULTY_RANGES.medium.min &&
    result.score <= DIFFICULTY_RANGES.hard.max
  );
}

// Get human-readable difficulty description
export function getDifficultyDescription(result: DifficultyResult): string {
  if (result.score >= 70) {
    return 'Challenging';
  } else if (result.score >= 55) {
    return 'Hard';
  } else if (result.score >= 40) {
    return 'Medium-Hard';
  } else if (result.score >= 30) {
    return 'Medium';
  } else {
    return 'Easy';
  }
}
