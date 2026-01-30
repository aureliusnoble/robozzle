// Quality scoring heuristics for generated puzzles

import type { FunctionName, Program, PuzzleConfig, Tile } from '../../src/engine/types';
import type {
  FitnessResult,
  MechanicCategory,
  QualityComponents,
  QualityResult,
  RejectionFlags,
  SolverResult,
} from './types';
import { QUALITY_THRESHOLDS, QUALITY_WEIGHTS } from './config';
import { findMultipleSolutions, solve } from './solver';

// Count non-null instructions in a program
function countInstructions(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of program[funcName]) {
      if (instruction !== null) count++;
    }
  }
  return count;
}

// Count total slots in a program/puzzle
function countTotalSlots(puzzle: PuzzleConfig): number {
  return (
    puzzle.functionLengths.f1 +
    puzzle.functionLengths.f2 +
    puzzle.functionLengths.f3 +
    puzzle.functionLengths.f4 +
    puzzle.functionLengths.f5
  );
}

// Count walkable tiles
function countWalkableTiles(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) count++;
    }
  }
  return count;
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

// Check if puzzle uses conditionals
function usesConditionals(solution: Program): boolean {
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction?.condition !== null) {
        return true;
      }
    }
  }
  return false;
}

// Check if puzzle uses multiple functions
function usesMultipleFunctions(solution: Program, puzzle: PuzzleConfig): boolean {
  const functionsUsed = new Set<FunctionName>();

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    if (puzzle.functionLengths[funcName] > 0) {
      for (const instruction of solution[funcName]) {
        if (instruction !== null) {
          functionsUsed.add(funcName);
          // Check for function calls
          if (['f1', 'f2', 'f3', 'f4', 'f5'].includes(instruction.type)) {
            functionsUsed.add(instruction.type as FunctionName);
          }
        }
      }
    }
  }

  return functionsUsed.size > 1;
}

// Check if puzzle uses recursion (function calls itself or mutual recursion)
function usesRecursion(solution: Program): boolean {
  // Check for self-calls
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction?.type === funcName) {
        return true;
      }
    }
  }

  // Check for mutual recursion (f2 calls f3, f3 calls f2)
  const calls: Record<FunctionName, Set<FunctionName>> = {
    f1: new Set(),
    f2: new Set(),
    f3: new Set(),
    f4: new Set(),
    f5: new Set(),
  };

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction && ['f1', 'f2', 'f3', 'f4', 'f5'].includes(instruction.type)) {
        calls[funcName].add(instruction.type as FunctionName);
      }
    }
  }

  // Check for cycles
  for (const start of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    const visited = new Set<FunctionName>();
    const stack = [start];

    while (stack.length > 0) {
      const current = stack.pop()!;
      if (visited.has(current)) {
        return true; // Found cycle
      }
      visited.add(current);
      for (const called of calls[current]) {
        stack.push(called);
      }
    }
  }

  return false;
}

// Check if puzzle uses painting
function usesPainting(solution: Program): boolean {
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const instruction of solution[funcName]) {
      if (instruction && ['paint_red', 'paint_green', 'paint_blue'].includes(instruction.type)) {
        return true;
      }
    }
  }
  return false;
}

// Evaluate quality of a puzzle
export function evaluateQuality(
  puzzle: PuzzleConfig,
  solverResult: SolverResult,
  mechanicCategory: MechanicCategory
): QualityResult {
  const rejectionFlags: RejectionFlags = {
    trivial: false,
    deadTiles: false,
    tooHard: false,
    tooEasy: false,
  };

  // Check if solver found a solution
  if (!solverResult.solved || !solverResult.solution) {
    rejectionFlags.tooHard = true;
    return {
      total: 0,
      components: {
        solvability: 0,
        efficiency: 0,
        uniqueness: 0,
        tileUtilization: 0,
        mechanicUsage: 0,
      },
      passed: false,
      rejectionFlags,
    };
  }

  const solution = solverResult.solution;
  const instructionsUsed = countInstructions(solution);
  const totalSlots = countTotalSlots(puzzle);
  const walkableTiles = countWalkableTiles(puzzle.grid);
  const stars = countStars(puzzle.grid);

  // Check for trivial solution
  if (instructionsUsed <= QUALITY_THRESHOLDS.minInstructions) {
    rejectionFlags.trivial = true;
  }

  // Check if solved too quickly (likely too easy)
  if (solverResult.generations < QUALITY_THRESHOLDS.minSolverGenerations) {
    rejectionFlags.tooEasy = true;
  }

  // Check if took too long (might be edge case)
  if (solverResult.generations > QUALITY_THRESHOLDS.maxSolverGenerations) {
    rejectionFlags.tooHard = true;
  }

  // Calculate components

  // 1. Solvability (30 points)
  const solvability = solverResult.solved ? QUALITY_WEIGHTS.solvability : 0;

  // 2. Efficiency (0-20) - Solution uses 40-80% of available slots
  let efficiency = 0;
  if (totalSlots > 0) {
    const usageRatio = instructionsUsed / totalSlots;
    if (usageRatio >= 0.4 && usageRatio <= 0.8) {
      efficiency = QUALITY_WEIGHTS.efficiency;
    } else if (usageRatio < 0.4) {
      efficiency = usageRatio * QUALITY_WEIGHTS.efficiency * 2.5;
    } else {
      efficiency = Math.max(0, QUALITY_WEIGHTS.efficiency - (usageRatio - 0.8) * 50);
    }
  }

  // 3. Uniqueness (0-15) - Multiple valid solutions indicate good design
  const solutions = findMultipleSolutions(puzzle, 5, 5);
  let uniqueness = 0;
  if (solutions.length >= 2 && solutions.length <= 5) {
    uniqueness = QUALITY_WEIGHTS.uniqueness;
  } else if (solutions.length === 1) {
    uniqueness = QUALITY_WEIGHTS.uniqueness * 0.6; // Single solution is okay
  } else if (solutions.length > 5) {
    uniqueness = QUALITY_WEIGHTS.uniqueness * 0.3; // Too many solutions might mean too easy
  }

  // 4. Tile utilization (0-20) - Good grid density
  let tileUtilization = 0;
  const gridArea = puzzle.grid.length * (puzzle.grid[0]?.length || 0);
  if (gridArea > 0) {
    const density = walkableTiles / gridArea;
    if (density >= QUALITY_THRESHOLDS.minTileUtilization &&
        density <= QUALITY_THRESHOLDS.maxTileUtilization) {
      tileUtilization = QUALITY_WEIGHTS.tileUtilization;
    } else if (density < QUALITY_THRESHOLDS.minTileUtilization) {
      tileUtilization = (density / QUALITY_THRESHOLDS.minTileUtilization) * QUALITY_WEIGHTS.tileUtilization;
    } else {
      tileUtilization = QUALITY_WEIGHTS.tileUtilization * 0.5;
    }
  }

  // Also check visited tiles during execution
  const visitedRatio = solverResult.fitness.tilesVisitedCount / walkableTiles;
  if (visitedRatio < 0.5) {
    // Might have dead tiles
    rejectionFlags.deadTiles = true;
    tileUtilization *= 0.5;
  }

  // 5. Mechanic usage (0-15) - Uses the intended mechanic
  let mechanicUsage = 0;
  switch (mechanicCategory) {
    case 'conditionals':
      if (usesConditionals(solution)) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage;
      }
      break;
    case 'recursion':
      if (usesRecursion(solution)) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage;
      } else if (usesMultipleFunctions(solution, puzzle)) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage * 0.5;
      }
      break;
    case 'painting':
      if (usesPainting(solution)) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage;
      }
      break;
    case 'multi-func':
      if (usesMultipleFunctions(solution, puzzle)) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage;
      }
      break;
    case 'loop':
      // F1 auto-loop is always used, check if solution is concise
      if (instructionsUsed <= 8) {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage;
      } else {
        mechanicUsage = QUALITY_WEIGHTS.mechanicUsage * 0.7;
      }
      break;
  }

  const components: QualityComponents = {
    solvability,
    efficiency,
    uniqueness,
    tileUtilization,
    mechanicUsage,
  };

  const total = solvability + efficiency + uniqueness + tileUtilization + mechanicUsage;

  // Determine if passed
  const hasRejectionFlags = Object.values(rejectionFlags).some(v => v);
  const passed = total >= QUALITY_THRESHOLDS.minScore && !hasRejectionFlags;

  return {
    total,
    components,
    passed,
    rejectionFlags,
  };
}

// Quick quality check (without full evaluation)
export function quickQualityCheck(
  puzzle: PuzzleConfig,
  solverResult: SolverResult
): { passed: boolean; reason?: string } {
  if (!solverResult.solved) {
    return { passed: false, reason: 'Not solvable' };
  }

  const instructionsUsed = countInstructions(solverResult.solution!);
  if (instructionsUsed <= 2) {
    return { passed: false, reason: 'Trivial solution' };
  }

  if (solverResult.generations < 5) {
    return { passed: false, reason: 'Too easy' };
  }

  const walkableTiles = countWalkableTiles(puzzle.grid);
  const visitedRatio = solverResult.fitness.tilesVisitedCount / walkableTiles;
  if (visitedRatio < 0.4) {
    return { passed: false, reason: 'Too many unused tiles' };
  }

  return { passed: true };
}
