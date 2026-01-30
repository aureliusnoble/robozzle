// Configuration for puzzle generation system

import type { GenerationConfig, MechanicCategory, SolverConfig } from './types';

// Default solver configuration
// Keep generations low - if we can't find solution quickly, puzzle is too hard
export const DEFAULT_SOLVER_CONFIG: SolverConfig = {
  populationSize: 80,
  maxGenerations: 200,
  stagnationLimit: 30,
  tournamentSize: 5,
  eliteCount: 5,
  mutationRate: 0.15,
  crossoverRate: 0.7,
};

// Default generation configuration
export const DEFAULT_GENERATION_CONFIG: Omit<GenerationConfig, 'mechanicCategory'> = {
  gridWidth: 16,
  gridHeight: 12,
  targetDifficulty: 'hard',
  maxTotalSlots: 15,
};

// Quality thresholds
export const QUALITY_THRESHOLDS = {
  minScore: 60,                // Minimum quality score to pass
  minInstructions: 3,          // Reject solutions with <= 2 instructions
  maxSolverGenerations: 400,   // Puzzles needing more are too hard
  minSolverGenerations: 10,    // Puzzles solved immediately are too easy
  minTileUtilization: 0.3,     // At least 30% of non-void tiles used
  maxTileUtilization: 0.9,     // Not more than 90% (leave some breathing room)
};

// Target pool sizes per category
export const TARGET_POOL_SIZE: Record<MechanicCategory, number> = {
  conditionals: 24,
  recursion: 24,
  painting: 24,
  'multi-func': 24,
  loop: 24,
};

// Total target: 120 puzzles
export const TOTAL_TARGET_PUZZLES = Object.values(TARGET_POOL_SIZE).reduce((a, b) => a + b, 0);

// Mechanic category descriptions
export const MECHANIC_DESCRIPTIONS: Record<MechanicCategory, string> = {
  conditionals: 'Color-based conditional execution',
  recursion: 'Functions calling themselves',
  painting: 'Using paint to track state or modify behavior',
  'multi-func': 'F1+F2 coordination and subroutines',
  loop: 'F1 auto-loop exploitation',
};

// Instruction weights for mutation selection
export const INSTRUCTION_WEIGHTS: Record<string, number> = {
  forward: 30,
  left: 15,
  right: 15,
  f1: 5,
  f2: 10,
  f3: 5,
  f4: 2,
  f5: 1,
  paint_red: 5,
  paint_green: 5,
  paint_blue: 5,
  noop: 7,
};

// Color weights for generation
export const COLOR_WEIGHTS = {
  red: 40,
  green: 35,
  blue: 25,
};

// Difficulty score ranges
export const DIFFICULTY_RANGES = {
  medium: { min: 30, max: 55 },
  hard: { min: 55, max: 80 },
};

// Max steps for solver - if puzzle needs >1000 steps, it's too complex for humans
export const MAX_SOLVER_STEPS = 1000;

// Generation retry limits
export const MAX_GENERATION_RETRIES = 100;
export const MAX_SOLVER_RETRIES = 3;

// Fitness component weights
export const FITNESS_WEIGHTS = {
  starsCollected: 1.0,         // Primary objective
  tilesVisited: 0.3,           // Secondary: exploration
  distanceToStar: 0.2,         // Guidance toward goal
  instructionEfficiency: 0.2,  // Favor concise solutions
  stackUsage: 0.1,             // Bonus for recursion
};

// Quality component weights (for logging/debugging)
export const QUALITY_WEIGHTS = {
  solvability: 30,
  efficiency: 20,
  uniqueness: 15,
  tileUtilization: 20,
  mechanicUsage: 15,
};

// Template slot ranges by mechanic
export const SLOT_RANGES: Record<MechanicCategory, { min: number; max: number }> = {
  conditionals: { min: 8, max: 12 },
  recursion: { min: 8, max: 12 },
  painting: { min: 8, max: 12 },
  'multi-func': { min: 10, max: 15 },
  loop: { min: 6, max: 10 },
};

// Function distribution by mechanic
export const FUNCTION_DISTRIBUTIONS: Record<MechanicCategory, { f1: [number, number]; f2: [number, number]; f3: [number, number] }> = {
  conditionals: { f1: [5, 8], f2: [0, 4], f3: [0, 0] },
  recursion: { f1: [1, 3], f2: [4, 8], f3: [0, 3] },
  painting: { f1: [4, 8], f2: [0, 4], f3: [0, 0] },
  'multi-func': { f1: [3, 6], f2: [3, 6], f3: [0, 4] },
  loop: { f1: [4, 8], f2: [0, 3], f3: [0, 0] },
};
