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

// Mechanic categories for puzzle variety
export type MechanicCategory =
  | 'conditionals'
  | 'recursion'
  | 'painting'
  | 'multi-func'
  | 'loop';

// Generation source tracking
export type GenerationSource = 'classic' | 'generated' | 'user';

// Extended puzzle config with generation metadata
export interface GeneratedPuzzleConfig extends PuzzleConfig {
  generationSource: GenerationSource;
  mechanicCategory: MechanicCategory;
  solverDifficultyScore: number;
  qualityScore: number;
  solutionInstructionCount: number;
  solutionStepCount: number;
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

// Solver configuration
export interface SolverConfig {
  populationSize: number;      // Number of programs in population (default: 100)
  maxGenerations: number;      // Max generations before giving up (default: 500)
  stagnationLimit: number;     // Generations without improvement (default: 50)
  tournamentSize: number;      // Tournament selection size (default: 5)
  eliteCount: number;          // Top programs preserved each generation (default: 5)
  mutationRate: number;        // Probability of mutation per instruction (default: 0.1)
  crossoverRate: number;       // Probability of crossover (default: 0.7)
}

export interface SolverResult {
  solved: boolean;
  solution: Program | null;
  fitness: FitnessResult;
  generations: number;
  totalEvaluations: number;
  bestFitnessHistory: number[];
}

// Individual in evolutionary population
export interface Individual {
  program: Program;
  fitness: FitnessResult;
}

// Template system for guided generation
export interface PuzzleTemplate {
  name: string;
  category: MechanicCategory;
  description: string;
  minSlots: number;
  maxSlots: number;
  requiredInstructions: InstructionType[];
  optionalInstructions: InstructionType[];
  minColors: number;
  maxColors: number;
  minStars: number;
  maxStars: number;
  pathComplexity: 'simple' | 'branching' | 'looping';
  generate: (config: GenerationConfig) => PuzzleCandidate;
}

// Generation configuration
export interface GenerationConfig {
  gridWidth: number;           // Default: 16
  gridHeight: number;          // Default: 12
  targetDifficulty: 'medium' | 'hard'; // All in medium-hard band
  mechanicCategory: MechanicCategory;
  maxTotalSlots: number;       // Max 15 per requirements
  seed?: number;               // Optional random seed
}

// Candidate puzzle before validation
export interface PuzzleCandidate {
  grid: (Tile | null)[][];
  robotStart: { position: Position; direction: Direction };
  functionLengths: PuzzleConfig['functionLengths'];
  allowedInstructions: InstructionType[];
  mechanicCategory: MechanicCategory;
  templateName: string;
}

// Pruning result
export interface PruningResult {
  prunedGrid: (Tile | null)[][];
  tilesRemoved: number;
  originalTileCount: number;
  finalTileCount: number;
  stillSolvable: boolean;
}

// Difficulty classification result
export interface DifficultyResult {
  score: number;               // 0-100 difficulty score
  category: 'medium' | 'hard'; // For generated puzzles
  factors: {
    generationsNeeded: number;
    solutionComplexity: number;
    mechanicDifficulty: number;
    gridComplexity: number;
  };
}

// Upload batch for database
export interface PuzzleBatch {
  puzzles: GeneratedPuzzleConfig[];
  generatedAt: Date;
  totalGenerated: number;
  totalPassed: number;
  byCategory: Record<MechanicCategory, number>;
}

// Generation statistics
export interface GenerationStats {
  attempted: number;
  solvable: number;
  passedQuality: number;
  byCategory: Record<MechanicCategory, {
    attempted: number;
    solvable: number;
    passed: number;
  }>;
  averageSolverGenerations: number;
  averageQualityScore: number;
}

// Pool entry for database
export interface GeneratedPuzzlePoolEntry {
  id: string;
  puzzleId: string;
  mechanicCategory: MechanicCategory;
  usedForDaily: string | null;  // Date string or null
  qualityScore: number;
  createdAt: Date;
}
