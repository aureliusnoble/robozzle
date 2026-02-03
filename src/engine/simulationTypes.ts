// Simulation mode types for RoboZZle

import type { Position, Program, Tile, Direction } from './types';

export interface SimulationConfig {
  slotsPerFunction: {
    f1: number;
    f2: number;
    f3: number;
    f4: number;
    f5: number;
  };
  maxSteps: number; // Default 1000
  gridSize: number; // Default 16
  colorRatios: {
    red: number;
    green: number;
    blue: number;
  };
  minCoveragePercent: number; // Default 80 - minimum percentage of slots that must execute
  conditionalPercent: number; // Default 70 - percentage of instructions that should be conditional
  instructionWeights: {
    forward: number;
    turn: number; // left + right
    functionCall: number; // f1-f5
    paint: number; // paint_red, paint_green, paint_blue
  };
  minTiles: number; // Default 12 - minimum tiles that must be placed
  minBoundingBox: number; // Default 3 - minimum width OR height of tile bounding box
  minTurns: number; // Default 2 - minimum number of turns in the path
  maxDenseTiles: number; // Default 3 - max tiles with 3+ adjacent neighbors (avoids clustered paths)
  maxAvgExecutionsPerSlot: number; // Default 1 - max average times each slot can execute (stepCount / executedSlots)
  minStackDepth: number; // Default 1 - minimum stack depth that must be reached during execution
  minSelfCalls: number; // Default 0 - minimum number of times any function must call itself (recursive calls)
  autoRestartAfter: number; // Default 1000 - automatically restart simulation after this many retries
  minPathTraceRatio: number; // Default 1.0 - path trace instructions must be at least this ratio of total slots
  disableLoopCheck: boolean; // Default false - if true, don't fail when robot returns to start position/direction
  minPathLength: number; // Default 0 - minimum number of forward moves (positions visited - 1)
  minConditionals: number; // Default 0 - minimum number of conditional instructions that must execute
  minPaintRevisits: number; // Default 0 - minimum paint-revisit events (revisit painted tile + execute conditional matching painted color)
  maxUnnecessaryPaints: number; // Default -1 (disabled) - max number of paint instructions that can be removed while still solving. 0 = all paints must be necessary.
}

export type SimulationStatus =
  | 'idle'
  | 'running'
  | 'retrying'
  | 'success'
  | 'exhausted';

export type SimulationErrorType = 'boundary' | 'coverage' | 'loop' | 'minTiles' | 'minBoundingBox' | 'minTurns' | 'density' | 'incomplete' | 'minStackDepth' | 'minSelfCalls' | 'pathTraceRatio' | 'minPathLength' | 'minConditionals' | 'minPaintRevisits' | 'unnecessaryPaint';

export type ErrorCounts = Record<SimulationErrorType, number>;

export interface SimulationState {
  status: SimulationStatus;
  program: Program;
  grid: (Tile | null)[][];
  originalGrid: (Tile | null)[][]; // Grid with original colors before any paint operations
  robotPosition: Position;
  robotDirection: Direction;
  robotStartDirection: Direction; // Initial direction at start of simulation
  robotPath: Position[];
  turnPositions: Position[];
  executedSlots: Set<string>; // "f1-0", "f2-3", etc.
  triedConfigurations: Set<string>; // Serialized full program configs
  retryCount: number;
  stepCount: number;
  maxStackDepth: number; // Maximum stack depth reached during execution
  maxSelfCalls: number; // Maximum self-calls (recursive calls) by any function
  pathTraceInstructions: number; // Number of instructions needed to trace the path naively
  errorType: SimulationErrorType | null;
  errorCounts: ErrorCounts; // Count of each error type in current simulation run
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  slotsPerFunction: {
    f1: 10,
    f2: 10,
    f3: 10,
    f4: 10,
    f5: 10,
  },
  maxSteps: 1000,
  gridSize: 16,
  colorRatios: {
    red: 1,
    green: 1,
    blue: 1,
  },
  minCoveragePercent: 80,
  conditionalPercent: 70,
  instructionWeights: {
    forward: 3,
    turn: 2,
    functionCall: 3,
    paint: 2,
  },
  minTiles: 12,
  minBoundingBox: 3,
  minTurns: 2,
  maxDenseTiles: 3,
  maxAvgExecutionsPerSlot: 1,
  minStackDepth: 1,
  minSelfCalls: 0,
  autoRestartAfter: 1000,
  minPathTraceRatio: 1.0,
  disableLoopCheck: false,
  minPathLength: 0,
  minConditionals: 0,
  minPaintRevisits: 0,
  maxUnnecessaryPaints: -1, // -1 = disabled, 0 = all paints must be necessary
};

export const createEmptyErrorCounts = (): ErrorCounts => ({
  boundary: 0,
  coverage: 0,
  loop: 0,
  minTiles: 0,
  minBoundingBox: 0,
  minTurns: 0,
  density: 0,
  incomplete: 0,
  minStackDepth: 0,
  minSelfCalls: 0,
  pathTraceRatio: 0,
  minPathLength: 0,
  minConditionals: 0,
  minPaintRevisits: 0,
  unnecessaryPaint: 0,
});

export const createEmptySimulationState = (): SimulationState => ({
  status: 'idle',
  program: {
    f1: [],
    f2: [],
    f3: [],
    f4: [],
    f5: [],
  },
  grid: [],
  originalGrid: [],
  robotPosition: { x: 8, y: 8 },
  robotDirection: 'up',
  robotStartDirection: 'up',
  robotPath: [],
  turnPositions: [],
  executedSlots: new Set(),
  triedConfigurations: new Set(),
  retryCount: 0,
  stepCount: 0,
  maxStackDepth: 0,
  maxSelfCalls: 0,
  pathTraceInstructions: 0,
  errorType: null,
  errorCounts: createEmptyErrorCounts(),
});
