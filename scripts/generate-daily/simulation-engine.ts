/**
 * Headless Simulation Engine
 *
 * Pure functions for puzzle generation that work without React.
 * Extracted from useSimulation.ts for headless execution.
 */

import type {
  Direction,
  FunctionName,
  Instruction,
  InstructionType,
  Position,
  Program,
  StackFrame,
  Tile,
  TileColor,
} from '../../src/engine/types';
import type { SimulationConfig } from '../../src/engine/simulationTypes';

const DIRECTION_DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const TURN_LEFT: Record<Direction, Direction> = {
  up: 'left',
  left: 'down',
  down: 'right',
  right: 'up',
};

const TURN_RIGHT: Record<Direction, Direction> = {
  up: 'right',
  right: 'down',
  down: 'left',
  left: 'up',
};

const DIRECTIONS: Direction[] = ['up', 'down', 'left', 'right'];
const COLORS: ('red' | 'green' | 'blue')[] = ['red', 'green', 'blue'];
const FUNCTIONS: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getWeightedRandomColor(colorRatios: SimulationConfig['colorRatios']): TileColor {
  const totalWeight = colorRatios.red + colorRatios.green + colorRatios.blue;
  const roll = Math.random() * totalWeight;

  if (roll < colorRatios.red) return 'red';
  if (roll < colorRatios.red + colorRatios.green) return 'green';
  return 'blue';
}

function getRandomCondition(conditionalPercent: number): TileColor | null {
  if (Math.random() * 100 >= conditionalPercent) return null;
  return getRandomElement(COLORS);
}

function getWeightedRandomInstruction(
  weights: SimulationConfig['instructionWeights'],
  slotsPerFunction: SimulationConfig['slotsPerFunction']
): InstructionType {
  const availableFunctions = FUNCTIONS.filter(fn => slotsPerFunction[fn] > 0);
  const effectiveFunctionCallWeight = availableFunctions.length > 0 ? weights.functionCall : 0;

  const totalWeight = weights.forward + weights.turn + effectiveFunctionCallWeight + weights.paint;
  const roll = Math.random() * totalWeight;

  let cumulative = 0;

  cumulative += weights.forward;
  if (roll < cumulative) return 'forward';

  cumulative += weights.turn;
  if (roll < cumulative) return Math.random() < 0.5 ? 'left' : 'right';

  cumulative += effectiveFunctionCallWeight;
  if (roll < cumulative && availableFunctions.length > 0) {
    return getRandomElement(availableFunctions);
  }

  const paintInstructions: InstructionType[] = ['paint_red', 'paint_green', 'paint_blue'];
  return getRandomElement(paintInstructions);
}

function generateRandomProgram(config: SimulationConfig): Program {
  const program: Program = { f1: [], f2: [], f3: [], f4: [], f5: [] };

  for (const fn of FUNCTIONS) {
    const slots = config.slotsPerFunction[fn];
    program[fn] = [];

    for (let i = 0; i < slots; i++) {
      let condition = getRandomCondition(config.conditionalPercent);
      let type = getWeightedRandomInstruction(config.instructionWeights, config.slotsPerFunction);

      // Don't allow unconditional F1 call in last slot of F1
      const isLastSlot = i === slots - 1;
      if (fn === 'f1' && isLastSlot && type === 'f1' && condition === null) {
        if (Math.random() < 0.5) {
          condition = getRandomElement(COLORS);
        } else {
          const otherTypes: InstructionType[] = ['forward', 'left', 'right', 'paint_red', 'paint_green', 'paint_blue'];
          type = getRandomElement(otherTypes);
        }
      }

      program[fn].push({ type, condition });
    }
  }

  return program;
}

function serializeProgram(program: Program): string {
  const parts: string[] = [];
  for (const fn of FUNCTIONS) {
    for (const instr of program[fn]) {
      if (instr) {
        parts.push(`${instr.type}:${instr.condition ?? 'null'}`);
      } else {
        parts.push('empty');
      }
    }
    parts.push('|');
  }
  return parts.join(',');
}

function createEmptyGrid(size: number): (Tile | null)[][] {
  const grid: (Tile | null)[][] = [];
  for (let y = 0; y < size; y++) {
    const row: (Tile | null)[] = [];
    for (let x = 0; x < size; x++) {
      row.push(null);
    }
    grid.push(row);
  }
  return grid;
}

// Create a grid with original colors (before any paint operations)
function createOriginalGrid(
  grid: (Tile | null)[][],
  originalColors: Map<string, TileColor>
): (Tile | null)[][] {
  return grid.map((row, y) =>
    row.map((tile, x) => {
      if (!tile) return null;
      const originalColor = originalColors.get(`${x},${y}`);
      return {
        ...tile,
        color: originalColor ?? tile.color,
      };
    })
  );
}

function getOppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

function is90DegreeTurn(entry: Direction, exit: Direction): boolean {
  return exit !== entry && exit !== getOppositeDirection(entry);
}

interface SimulationResult {
  success: boolean;
  errorType: string | null;
  grid: (Tile | null)[][];
  originalGrid: (Tile | null)[][];
  robotPath: Position[];
  turnPositions: Position[];
  executedSlots: Set<string>;
  stepCount: number;
  finalPosition: Position;
  finalDirection: Direction;
  startDirection: Direction;
}

function runSimulation(program: Program, config: SimulationConfig): SimulationResult {
  const grid = createEmptyGrid(config.gridSize);
  const center = Math.floor(config.gridSize / 2);

  const startColor = getWeightedRandomColor(config.colorRatios);
  grid[center][center] = { color: startColor, hasStar: false };

  let robotPos: Position = { x: center, y: center };
  let robotDir: Direction = getRandomElement(DIRECTIONS);

  const startPos = { ...robotPos };
  const startDir = robotDir;

  const robotPath: Position[] = [{ ...robotPos }];
  const turnPositions: Position[] = [];
  let currentTileEntryDirection: Direction | null = null;
  const executedSlots = new Set<string>();

  const originalColors = new Map<string, TileColor>();
  originalColors.set(`${robotPos.x},${robotPos.y}`, startColor);

  const stack: StackFrame[] = [{ functionName: 'f1', instructionIndex: 0 }];
  let stepCount = 0;
  let loopIterations = 0;
  const MAX_LOOP_ITERATIONS = config.maxSteps * 100;

  while (stepCount < config.maxSteps && loopIterations < MAX_LOOP_ITERATIONS) {
    loopIterations++;

    if (stack.length === 0) {
      stack.push({ functionName: 'f1', instructionIndex: 0 });
    }

    const frame = stack[stack.length - 1];
    const func = program[frame.functionName];

    if (frame.instructionIndex >= func.length) {
      stack.pop();
      continue;
    }

    const instruction = func[frame.instructionIndex];
    const slotKey = `${frame.functionName}-${frame.instructionIndex}`;
    frame.instructionIndex++;

    if (!instruction) continue;

    const currentTile = grid[robotPos.y]?.[robotPos.x];
    if (instruction.condition !== null) {
      if (!currentTile || currentTile.color !== instruction.condition) {
        continue;
      }
    }

    executedSlots.add(slotKey);
    stepCount++;

    // Check early termination
    let totalSlots = 0;
    for (const fn of FUNCTIONS) {
      totalSlots += config.slotsPerFunction[fn];
    }
    const currentCoverage = totalSlots > 0 ? (executedSlots.size / totalSlots) * 100 : 100;
    const avgExecutions = executedSlots.size > 0 ? stepCount / executedSlots.size : 0;

    if (currentCoverage >= config.minCoveragePercent && avgExecutions >= config.maxAvgExecutionsPerSlot) {
      break;
    }

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[robotDir];
        const newPos: Position = {
          x: robotPos.x + delta.x,
          y: robotPos.y + delta.y,
        };

        if (newPos.x < 0 || newPos.x >= config.gridSize || newPos.y < 0 || newPos.y >= config.gridSize) {
          return {
            success: false,
            errorType: 'boundary',
            grid,
            originalGrid: createOriginalGrid(grid, originalColors),
            robotPath,
            turnPositions,
            executedSlots,
            stepCount,
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
          };
        }

        if (!grid[newPos.y][newPos.x]) {
          const newColor = getWeightedRandomColor(config.colorRatios);
          grid[newPos.y][newPos.x] = { color: newColor, hasStar: false };
          originalColors.set(`${newPos.x},${newPos.y}`, newColor);
        }

        if (currentTileEntryDirection !== null && is90DegreeTurn(currentTileEntryDirection, robotDir)) {
          turnPositions.push({ ...robotPos });
        }

        robotPos = newPos;
        currentTileEntryDirection = robotDir;
        robotPath.push({ ...robotPos });

        // Loop check
        if (!config.disableLoopCheck && stepCount > 1 && robotPos.x === startPos.x && robotPos.y === startPos.y && robotDir === startDir) {
          return {
            success: false,
            errorType: 'loop',
            grid,
            originalGrid: createOriginalGrid(grid, originalColors),
            robotPath,
            turnPositions,
            executedSlots,
            stepCount,
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
          };
        }
        break;
      }

      case 'left':
        robotDir = TURN_LEFT[robotDir];
        break;

      case 'right':
        robotDir = TURN_RIGHT[robotDir];
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        if (config.slotsPerFunction[instruction.type] > 0) {
          stack.push({ functionName: instruction.type, instructionIndex: 0 });
        }
        break;

      case 'paint_red':
      case 'paint_green':
      case 'paint_blue': {
        const paintColor = instruction.type.replace('paint_', '') as TileColor;
        if (currentTile) {
          currentTile.color = paintColor;
        }
        break;
      }
    }
  }

  // Check constraints
  let totalSlots = 0;
  for (const fn of FUNCTIONS) {
    totalSlots += config.slotsPerFunction[fn];
  }
  const finalCoverage = totalSlots > 0 ? (executedSlots.size / totalSlots) * 100 : 100;

  if (finalCoverage < config.minCoveragePercent) {
    return {
      success: false,
      errorType: 'coverage',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      stepCount,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Count tiles
  let tileCount = 0;
  let minX = config.gridSize, maxX = 0, minY = config.gridSize, maxY = 0;
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      if (grid[y][x]) {
        tileCount++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  if (tileCount < config.minTiles) {
    return {
      success: false,
      errorType: 'minTiles',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      stepCount,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  const boundingBox = Math.max(maxX - minX + 1, maxY - minY + 1);
  if (boundingBox < config.minBoundingBox) {
    return {
      success: false,
      errorType: 'minBoundingBox',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      stepCount,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  if (turnPositions.length < config.minTurns) {
    return {
      success: false,
      errorType: 'minTurns',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      stepCount,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  const pathLength = robotPath.length - 1;
  if (config.minPathLength > 0 && pathLength < config.minPathLength) {
    return {
      success: false,
      errorType: 'minPathLength',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      stepCount,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  return {
    success: true,
    errorType: null,
    grid,
    originalGrid: createOriginalGrid(grid, originalColors),
    robotPath,
    turnPositions,
    executedSlots,
    stepCount,
    finalPosition: robotPos,
    finalDirection: robotDir,
    startDirection: startDir,
  };
}

function filterExecutedInstructions(
  program: Program,
  executedSlots: Set<string>
): Program {
  const filtered: Program = { f1: [], f2: [], f3: [], f4: [], f5: [] };

  for (const fn of FUNCTIONS) {
    filtered[fn] = program[fn].map((instr, idx) => {
      const slotKey = `${fn}-${idx}`;
      return executedSlots.has(slotKey) ? instr : null;
    });
  }

  return filtered;
}

export interface ErrorCounts {
  boundary: number;
  coverage: number;
  loop: number;
  minTiles: number;
  minBoundingBox: number;
  minTurns: number;
  minPathLength: number;
  other: number;
}

export interface GenerationResult {
  success: boolean;
  puzzle?: any;
  solution?: Program;
  attempts: number;
  errorType?: string;
  executedSlots?: Set<string>;
  robotPath?: Position[];
  turnPositions?: Position[];
  errorCounts?: ErrorCounts;
}

export class SimulationEngine {
  private config: SimulationConfig;
  private triedConfigurations = new Set<string>();

  constructor(config: SimulationConfig) {
    this.config = config;
  }

  generate(timeoutMs: number): GenerationResult {
    const startTime = Date.now();
    let attempts = 0;
    let lastErrorType: string | null = null;

    const errorCounts: ErrorCounts = {
      boundary: 0,
      coverage: 0,
      loop: 0,
      minTiles: 0,
      minBoundingBox: 0,
      minTurns: 0,
      minPathLength: 0,
      other: 0,
    };

    this.triedConfigurations.clear();

    // Progress logging
    let lastProgressLog = startTime;
    const PROGRESS_INTERVAL = 10000; // Log every 10 seconds

    while (Date.now() - startTime < timeoutMs) {
      attempts++;

      // Log progress periodically
      const now = Date.now();
      if (now - lastProgressLog >= PROGRESS_INTERVAL) {
        const elapsed = ((now - startTime) / 1000).toFixed(0);
        const uniqueConfigs = this.triedConfigurations.size;
        console.log(`  [${elapsed}s] ${attempts.toLocaleString()} attempts, ${uniqueConfigs.toLocaleString()} unique configs...`);
        lastProgressLog = now;
      }

      // Generate random program
      const program = generateRandomProgram(this.config);
      const serialized = serializeProgram(program);

      // Skip if already tried
      if (this.triedConfigurations.has(serialized)) {
        continue;
      }
      this.triedConfigurations.add(serialized);

      // Run simulation
      const result = runSimulation(program, this.config);

      if (result.success) {
        // Create puzzle config from result - use ORIGINAL grid (before paint operations)
        const center = Math.floor(this.config.gridSize / 2);
        const gridWithStars = result.originalGrid.map(row =>
          row.map(tile => tile ? { ...tile, hasStar: false } : null)
        );

        // Place stars at turn positions and final position
        const starPositions = new Set<string>();
        for (const pos of result.turnPositions) {
          starPositions.add(`${pos.x},${pos.y}`);
        }
        starPositions.add(`${result.finalPosition.x},${result.finalPosition.y}`);

        for (const posKey of starPositions) {
          const [x, y] = posKey.split(',').map(Number);
          if (gridWithStars[y]?.[x]) {
            gridWithStars[y][x]!.hasStar = true;
          }
        }

        // Determine allowed instructions
        const allowedInstructions = new Set<InstructionType>();
        allowedInstructions.add('forward');
        allowedInstructions.add('left');
        allowedInstructions.add('right');

        for (const fn of FUNCTIONS) {
          if (this.config.slotsPerFunction[fn] > 0) {
            allowedInstructions.add(fn);
          }
        }

        const puzzle = {
          grid: gridWithStars,
          robotStart: {
            position: { x: center, y: center },
            direction: result.startDirection,
          },
          functionLengths: this.config.slotsPerFunction,
          allowedInstructions: Array.from(allowedInstructions),
          stepCount: result.stepCount,
        };

        const solution = filterExecutedInstructions(program, result.executedSlots);

        return {
          success: true,
          puzzle,
          solution,
          attempts,
          executedSlots: result.executedSlots,
          robotPath: result.robotPath,
          turnPositions: result.turnPositions,
          errorCounts,
        };
      }

      // Track error types
      lastErrorType = result.errorType;
      switch (result.errorType) {
        case 'boundary': errorCounts.boundary++; break;
        case 'coverage': errorCounts.coverage++; break;
        case 'loop': errorCounts.loop++; break;
        case 'minTiles': errorCounts.minTiles++; break;
        case 'minBoundingBox': errorCounts.minBoundingBox++; break;
        case 'minTurns': errorCounts.minTurns++; break;
        case 'minPathLength': errorCounts.minPathLength++; break;
        default: errorCounts.other++; break;
      }

      // Auto-restart after many failures
      if (attempts % this.config.autoRestartAfter === 0) {
        this.triedConfigurations.clear();
      }
    }

    return {
      success: false,
      attempts,
      errorType: lastErrorType || 'timeout',
      errorCounts,
    };
  }
}
