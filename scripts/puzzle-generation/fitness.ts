// Fitness function for evolutionary solver

import { GameEngine } from '../../src/engine/GameEngine';
import type { FunctionName, Program, PuzzleConfig, Position, Tile } from '../../src/engine/types';
import type { FitnessComponents, FitnessResult } from './types';
import { FITNESS_WEIGHTS, MAX_SOLVER_STEPS } from './config';

// Calculate Manhattan distance between two positions
function manhattanDistance(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

// Find all star positions in a grid
function findStarPositions(grid: (Tile | null)[][]): Position[] {
  const stars: Position[] = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.hasStar) {
        stars.push({ x, y });
      }
    }
  }
  return stars;
}

// Count total walkable tiles in grid
function countWalkableTiles(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) count++;
    }
  }
  return count;
}

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

// Count total slots in a program
function countTotalSlots(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    count += program[funcName].length;
  }
  return count;
}

// Evaluate a program's fitness on a puzzle
export function evaluateFitness(puzzle: PuzzleConfig, program: Program): FitnessResult {
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);

  // Track visited tiles and max stack depth
  const visitedTiles = new Set<string>();
  let maxStackDepth = 0;
  let stepsUsed = 0;

  // Get initial star positions
  const initialStars = findStarPositions(puzzle.grid);
  const totalStars = initialStars.length;

  // Run simulation
  engine.start();

  while (stepsUsed < MAX_SOLVER_STEPS) {
    const state = engine.getState();

    // Track visited tile
    const { x, y } = state.robot.position;
    visitedTiles.add(`${x},${y}`);

    // Track stack depth
    const stackDepth = engine.getStackDepth();
    if (stackDepth > maxStackDepth) {
      maxStackDepth = stackDepth;
    }

    // Check if finished
    if (state.status === 'won' || state.status === 'lost') {
      stepsUsed = state.steps;
      break;
    }

    // Step
    const result = engine.step();
    if (result.finished) {
      stepsUsed = result.state.steps;
      break;
    }
  }

  const finalState = engine.getState();
  const solved = finalState.status === 'won';
  const starsCollected = finalState.starsCollected;
  const instructionsUsed = countInstructions(program);
  const totalSlots = countTotalSlots(program);
  const totalWalkable = countWalkableTiles(puzzle.grid);

  // Calculate fitness components

  // 1. Stars collected (0-100) - Primary objective
  const starsCollectedScore = totalStars > 0
    ? (starsCollected / totalStars) * 100
    : 0;

  // 2. Tiles visited (0-30) - Exploration bonus
  const tilesVisitedScore = totalWalkable > 0
    ? Math.min(30, (visitedTiles.size / totalWalkable) * 30)
    : 0;

  // 3. Distance to nearest uncollected star (0-20) - Guidance
  let distanceToStarScore = 0;
  if (!solved && starsCollected < totalStars) {
    // Find remaining stars in current grid state
    const currentGrid = finalState.grid;
    const remainingStars = findStarPositions(currentGrid);

    if (remainingStars.length > 0) {
      const robotPos = finalState.robot.position;
      const minDistance = Math.min(
        ...remainingStars.map(s => manhattanDistance(robotPos, s))
      );
      // Closer = better score (max distance on 16x12 grid is about 26)
      const maxPossibleDistance = puzzle.grid.length + (puzzle.grid[0]?.length || 0);
      distanceToStarScore = Math.max(0, 20 * (1 - minDistance / maxPossibleDistance));
    }
  } else if (solved) {
    // Full score if solved
    distanceToStarScore = 20;
  }

  // 4. Instruction efficiency (0-20) - Fewer instructions = better
  let instructionEfficiencyScore = 0;
  if (instructionsUsed > 0 && totalSlots > 0) {
    // Ideal is 40-80% slot usage
    const usageRatio = instructionsUsed / totalSlots;
    if (usageRatio >= 0.4 && usageRatio <= 0.8) {
      instructionEfficiencyScore = 20;
    } else if (usageRatio < 0.4) {
      // Very few instructions - might be trivial
      instructionEfficiencyScore = usageRatio * 50; // 0-20
    } else {
      // Using too many slots - less elegant
      instructionEfficiencyScore = Math.max(0, 20 - (usageRatio - 0.8) * 50);
    }
  }

  // 5. Stack usage (0-10) - Bonus for recursion
  let stackUsageScore = 0;
  if (maxStackDepth > 1) {
    // Bonus for deeper recursion (capped at 5 levels)
    stackUsageScore = Math.min(10, (maxStackDepth - 1) * 2);
  }

  // Combine components with weights
  const components: FitnessComponents = {
    starsCollected: starsCollectedScore,
    tilesVisited: tilesVisitedScore,
    distanceToStar: distanceToStarScore,
    instructionEfficiency: instructionEfficiencyScore,
    stackUsage: stackUsageScore,
  };

  // Calculate weighted total
  const total =
    components.starsCollected * FITNESS_WEIGHTS.starsCollected +
    components.tilesVisited * FITNESS_WEIGHTS.tilesVisited +
    components.distanceToStar * FITNESS_WEIGHTS.distanceToStar +
    components.instructionEfficiency * FITNESS_WEIGHTS.instructionEfficiency +
    components.stackUsage * FITNESS_WEIGHTS.stackUsage;

  return {
    total,
    components,
    solved,
    stepsUsed,
    instructionsUsed,
    maxStackDepth,
    tilesVisitedCount: visitedTiles.size,
  };
}

// Quick evaluation - just check if it solves
export function quickEvaluate(puzzle: PuzzleConfig, program: Program): { solved: boolean; steps: number } {
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);
  const result = engine.runToCompletion();
  return {
    solved: result.won,
    steps: result.state.steps,
  };
}

// Get visited tiles during execution (for pruning)
export function getVisitedTiles(puzzle: PuzzleConfig, program: Program): Set<string> {
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);

  const visited = new Set<string>();
  engine.start();

  let steps = 0;
  while (steps < MAX_SOLVER_STEPS) {
    const state = engine.getState();
    const { x, y } = state.robot.position;
    visited.add(`${x},${y}`);

    if (state.status === 'won' || state.status === 'lost') break;

    const result = engine.step();
    if (result.finished) break;
    steps++;
  }

  return visited;
}
