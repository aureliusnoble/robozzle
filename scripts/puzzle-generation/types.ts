// Types for puzzle generation system

import type {
  Direction,
  FunctionName,
  Instruction,
  InstructionType,
  Position,
  Program,
  PuzzleConfig,
  Tile,
  TileColor,
} from '../../src/engine/types';

// Re-export commonly used types
export type {
  Direction,
  FunctionName,
  Instruction,
  InstructionType,
  Position,
  Program,
  PuzzleConfig,
  Tile,
  TileColor,
};

// Generation source tracking
export type GenerationSource = 'classic' | 'generated' | 'user';

// Extended puzzle config with generation metadata
export interface GeneratedPuzzleConfig extends PuzzleConfig {
  generationSource: GenerationSource;
  profileName?: string; // Name of the puzzle profile used
  solverDifficultyScore: number;
  qualityScore: number;
  solutionInstructionCount: number;
  solutionStepCount: number;
  usesPainting?: boolean;
  solution?: Program;
}

// Fitness score components from solver
export interface FitnessComponents {
  starsCollected: number;      // 0-100: Primary goal
  tilesVisited: number;        // 0-30: Exploration bonus
  distanceToStar: number;      // 0-20: Guidance toward uncollected stars
  instructionEfficiency: number; // 0-20: Fewer instructions = better
  stackUsage: number;          // 0-10: Bonus for recursion
}

export interface FitnessResult {
  total: number;               // Combined fitness score
  components: FitnessComponents;
  solved: boolean;
  stepsUsed: number;
  instructionsUsed: number;
  maxStackDepth: number;
  tilesVisitedCount: number;
}

// Quality score components
export interface QualityComponents {
  solvability: number;         // 30 points if solvable
  efficiency: number;          // 0-20: Solution uses 40-80% of slots
  uniqueness: number;          // 0-15: Multiple valid solutions
  tileUtilization: number;     // 0-20: Good grid density
  mechanicUsage: number;       // 0-15: Uses intended mechanic
}

export interface QualityResult {
  total: number;               // Combined quality score (0-100)
  components: QualityComponents;
  passed: boolean;             // Above threshold (60)
  rejectionFlags: RejectionFlags;
}

export interface RejectionFlags {
  trivial: boolean;            // Solution <= 2 instructions
  deadTiles: boolean;          // Has unreachable/unnecessary tiles
  tooHard: boolean;            // Solver couldn't find solution
  tooEasy: boolean;            // Solved in first few generations
}

// Pruning result
export interface PruningResult {
  prunedGrid: (Tile | null)[][];
  tilesRemoved: number;
  originalTileCount: number;
  finalTileCount: number;
  stillSolvable: boolean;
}

// Upload batch for database
export interface PuzzleBatch {
  puzzles: GeneratedPuzzleConfig[];
  generatedAt: Date;
  totalGenerated: number;
  totalPassed: number;
  byProfile: Record<string, number>;
}

// Pool entry for database
export interface GeneratedPuzzlePoolEntry {
  id: string;
  puzzleId: string;
  profileName?: string;
  usedForDaily: string | null;
  qualityScore: number;
  createdAt: Date;
}
