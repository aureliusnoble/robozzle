// Core game types for RoboZZle

export type TileColor = 'red' | 'green' | 'blue' | null;

export type Direction = 'up' | 'down' | 'left' | 'right';

export type InstructionType =
  | 'forward'
  | 'left'
  | 'right'
  | 'f1'
  | 'f2'
  | 'f3'
  | 'f4'
  | 'f5'
  | 'paint_red'
  | 'paint_green'
  | 'paint_blue'
  | 'noop';

export interface Instruction {
  type: InstructionType;
  condition: TileColor | null; // null means unconditional
}

export interface Tile {
  color: TileColor;
  hasStar: boolean;
}

export interface Position {
  x: number;
  y: number;
}

export interface RobotState {
  position: Position;
  direction: Direction;
}

export interface GameState {
  puzzleId: string;  // Track which puzzle this state belongs to
  robot: RobotState;
  grid: (Tile | null)[][]; // null = void/empty space
  starsCollected: number;
  totalStars: number;
  steps: number;
  status: 'idle' | 'running' | 'paused' | 'won' | 'lost';
}

export interface Program {
  f1: (Instruction | null)[];
  f2: (Instruction | null)[];
  f3: (Instruction | null)[];
  f4: (Instruction | null)[];
  f5: (Instruction | null)[];
}

export type FunctionName = 'f1' | 'f2' | 'f3' | 'f4' | 'f5';

export interface StackFrame {
  functionName: FunctionName;
  instructionIndex: number;
}

export interface PuzzleConfig {
  id: string;
  title: string;
  description?: string;
  grid: (Tile | null)[][];
  robotStart: RobotState;
  functionLengths: {
    f1: number;
    f2: number;
    f3: number;
    f4: number;
    f5: number;
  };
  allowedInstructions: InstructionType[];
  category: 'daily' | 'daily_easy' | 'daily_challenge' | 'tutorial' | 'classic';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';
  tutorialStep?: number;
  advancedTopic?: string;    // Topic ID for Advanced Concepts (e.g., 'recursion', 'memory')
  hint?: string;
  warning?: string;          // Challenge warning shown prominently
  author?: string;           // Original puzzle author
  stars?: number;            // Difficulty rating (1-20 stars)
  communityDifficulty?: number; // Raw community difficulty score
}

// Lightweight metadata for puzzle lists (loaded from local JSON)
export interface PuzzleMetadata {
  id: string;
  title: string;
  description?: string;
  author?: string;
  stars?: number;
  difficulty: PuzzleConfig['difficulty'];
  f1: number;
  f2: number;
  f3: number;
}

export interface Solution {
  puzzleId: string;
  program: Program;
  steps: number;
  instructionsUsed: number;
  completedAt: Date;
}

export interface ExecutionResult {
  state: GameState;
  finished: boolean;
  won: boolean;
}

// Daily challenge types
export type ChallengeType = 'easy' | 'challenge';

export interface DailyChallenge {
  date: string; // YYYY-MM-DD
  puzzleId: string;
  puzzle: PuzzleConfig;
  challengeType: ChallengeType;
}

export interface LeaderboardEntry {
  rank: number;
  userId: string | null;
  username: string;
  instructionsUsed: number;
  steps: number;
  completedAt: Date;
  points: number;
  isLate?: boolean;
}

// Puzzle-specific leaderboard entry (for classic puzzles)
export interface PuzzleLeaderboardEntry {
  rank: number;
  userId: string | null;
  username: string;
  instructionsUsed: number;
  steps: number;
  submittedAt: Date;
  isLate: boolean;
  program?: Program;
}

// Saved program slot
export interface SavedProgram {
  id: string;
  puzzleId: string;
  slot: number;  // 0 = latest (auto-save), 1-3 = user slots
  program: Program;
  instructionsUsed: number | null;
  updatedAt: Date;
}

// Classic ranking entry
export interface ClassicRankingEntry {
  rank: number;
  userId: string;
  username: string;
  score: number;
  weeklyMovement: number | null;  // positive = up, negative = down, null = new/no data
}

// Monthly daily ranking entry
export interface MonthlyDailyRankingEntry {
  rank: number;
  userId: string;
  username: string;
  totalPoints: number;
  completions: number;
}

// User profile types
export interface UserProfile {
  id: string;
  username: string;
  email: string;
  role: string | null;
  puzzlesSolved: number;
  currentStreak: number;
  longestStreak: number;
  totalPoints: number;
  classicStars: number;
  hardestPuzzleStars: number;
  bestDailyEasyRank: number | null;
  bestDailyChallengeRank: number | null;
  lastDailyDate: string | null;
  lastClassicStarsDate: string | null;
  createdAt: Date;
}

export interface UserProgress {
  tutorialCompleted: number[];
  classicSolved: string[];
  dailySolved: string[]; // dates
}

// Generation metadata types
export type GenerationSource = 'classic' | 'generated' | 'user';

export type MechanicCategory = 'easy' | 'challenge';

export interface GenerationMetadata {
  generationSource: GenerationSource;
  mechanicCategory?: MechanicCategory;
  solverDifficultyScore?: number;
  qualityScore?: number;
  solutionInstructionCount?: number;
  solutionStepCount?: number;
}

// Extended puzzle config with optional generation metadata
export interface GeneratedPuzzleConfig extends PuzzleConfig, GenerationMetadata {
  solution?: Program;
}
