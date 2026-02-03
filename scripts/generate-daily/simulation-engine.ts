/**
 * Headless Simulation Engine
 *
 * Pure functions for puzzle generation that work without React.
 * Extracted from useSimulation.ts for headless execution.
 * MUST MATCH useSimulation.ts EXACTLY for all constraint checks.
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

// Generate random condition, optionally excluding a specific color
function getRandomConditionExcluding(
  conditionalPercent: number,
  excludeColor: TileColor | null
): TileColor | null {
  if (Math.random() * 100 >= conditionalPercent) return null;

  if (excludeColor === null) {
    return getRandomElement(COLORS);
  }

  const availableColors = COLORS.filter(c => c !== excludeColor);
  return getRandomElement(availableColors);
}

// Generate random instruction type, optionally excluding opposite turn
function getWeightedRandomInstructionExcluding(
  weights: SimulationConfig['instructionWeights'],
  slotsPerFunction: SimulationConfig['slotsPerFunction'],
  excludeOppositeTurn: 'left' | 'right' | null
): InstructionType {
  const availableFunctions = FUNCTIONS.filter(fn => slotsPerFunction[fn] > 0);
  const effectiveFunctionCallWeight = availableFunctions.length > 0 ? weights.functionCall : 0;

  let effectiveTurnWeight = weights.turn;
  if (excludeOppositeTurn !== null) {
    effectiveTurnWeight = weights.turn / 2;
  }

  const totalWeight = weights.forward + effectiveTurnWeight + effectiveFunctionCallWeight + weights.paint;
  const roll = Math.random() * totalWeight;

  let cumulative = 0;

  cumulative += weights.forward;
  if (roll < cumulative) return 'forward';

  cumulative += effectiveTurnWeight;
  if (roll < cumulative) {
    if (excludeOppositeTurn === 'left') return 'left';
    if (excludeOppositeTurn === 'right') return 'right';
    return Math.random() < 0.5 ? 'left' : 'right';
  }

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
      const prevInstruction = i > 0 ? program[fn][i - 1] : null;

      let excludeOppositeTurn: 'left' | 'right' | null = null;
      let excludeColor: TileColor | null = null;

      if (prevInstruction) {
        if (prevInstruction.condition === null) {
          if (prevInstruction.type === 'left') excludeOppositeTurn = 'left';
          else if (prevInstruction.type === 'right') excludeOppositeTurn = 'right';
        }
        if (prevInstruction.condition !== null) {
          excludeColor = prevInstruction.condition;
        }
      }

      let condition = getRandomConditionExcluding(config.conditionalPercent, excludeColor);
      const applyTurnExclusion = condition === null ? excludeOppositeTurn : null;
      let type = getWeightedRandomInstructionExcluding(
        config.instructionWeights,
        config.slotsPerFunction,
        applyTurnExclusion
      );

      // Don't allow unconditional F1 call in last slot of F1
      const isLastSlot = i === slots - 1;
      if (fn === 'f1' && isLastSlot && type === 'f1' && condition === null) {
        if (Math.random() < 0.5) {
          condition = getRandomElement(COLORS);
        } else {
          const otherTypes: InstructionType[] = ['forward', 'left', 'right', 'f2', 'f3', 'f4', 'f5', 'paint_red', 'paint_green', 'paint_blue'];
          const availableTypes = otherTypes.filter(t => {
            if (t === 'f2' && config.slotsPerFunction.f2 === 0) return false;
            if (t === 'f3' && config.slotsPerFunction.f3 === 0) return false;
            if (t === 'f4' && config.slotsPerFunction.f4 === 0) return false;
            if (t === 'f5' && config.slotsPerFunction.f5 === 0) return false;
            return true;
          });
          type = getRandomElement(availableTypes);
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

// Calculate minimum turns needed between two directions
function getTurnsBetween(from: Direction, to: Direction): number {
  if (from === to) return 0;
  const dirs: Direction[] = ['up', 'right', 'down', 'left'];
  const fromIdx = dirs.indexOf(from);
  const toIdx = dirs.indexOf(to);
  const diff = Math.abs(fromIdx - toIdx);
  return diff === 3 ? 1 : diff;
}

// Calculate direction from one position to another
function getDirectionBetween(from: Position, to: Position): Direction {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (dx === 1) return 'right';
  if (dx === -1) return 'left';
  if (dy === 1) return 'down';
  return 'up';
}

// Calculate how many forward/left/right instructions would be needed to trace the path naively
function calculatePathTraceInstructions(robotPath: Position[], startDirection: Direction): number {
  if (robotPath.length < 2) return 0;

  let instructions = 0;
  let currentDir = startDirection;

  for (let i = 1; i < robotPath.length; i++) {
    const prev = robotPath[i - 1];
    const curr = robotPath[i];

    const moveDir = getDirectionBetween(prev, curr);
    const turns = getTurnsBetween(currentDir, moveDir);
    instructions += turns;
    instructions += 1; // The forward
    currentDir = moveDir;
  }

  return instructions;
}

interface SimulationResult {
  success: boolean;
  errorType: string | null;
  grid: (Tile | null)[][];
  originalGrid: (Tile | null)[][];
  robotPath: Position[];
  turnPositions: Position[];
  executedSlots: Set<string>;
  executedConditionals: number;
  paintRevisits: number;
  tilesWerePainted: boolean;
  calledFunctions: Set<FunctionName>;
  visitedColors: TileColor[];
  stepCount: number;
  maxStackDepth: number;
  maxSelfCalls: number;
  pathTraceInstructions: number;
  finalPosition: Position;
  finalDirection: Direction;
  startDirection: Direction;
}

function runSimulation(
  program: Program,
  config: SimulationConfig,
  options?: {
    skipPaintSlots?: Set<string>;
    fixedGrid?: (Tile | null)[][];
    fixedStartPos?: Position;
    fixedStartDir?: Direction;
    skipPaintCheck?: boolean; // Prevent infinite recursion in paint necessity check
  }
): SimulationResult {
  const grid = options?.fixedGrid
    ? options.fixedGrid.map(row => row.map(tile => tile ? { ...tile } : null))
    : createEmptyGrid(config.gridSize);
  const center = Math.floor(config.gridSize / 2);

  let startColor: TileColor;
  if (options?.fixedGrid) {
    const startX = options.fixedStartPos?.x ?? center;
    const startY = options.fixedStartPos?.y ?? center;
    startColor = grid[startY][startX]?.color ?? 'red';
  } else {
    startColor = getWeightedRandomColor(config.colorRatios);
    grid[center][center] = { color: startColor, hasStar: false };
  }

  let robotPos: Position = options?.fixedStartPos ?? { x: center, y: center };
  let robotDir: Direction = options?.fixedStartDir ?? getRandomElement(DIRECTIONS);

  const startPos = { ...robotPos };
  const startDir = robotDir;

  const robotPath: Position[] = [{ ...robotPos }];
  const turnPositions: Position[] = [];
  let currentTileEntryDirection: Direction | null = null;
  const executedSlots = new Set<string>();
  const calledFunctions = new Set<FunctionName>(['f1']);
  const visitedColors: TileColor[] = [startColor];

  const originalColors = new Map<string, TileColor>();
  originalColors.set(`${robotPos.x},${robotPos.y}`, startColor);

  const stack: StackFrame[] = [{ functionName: 'f1', instructionIndex: 0 }];
  let stepCount = 0;
  let loopIterations = 0;
  const MAX_LOOP_ITERATIONS = config.maxSteps * 100;
  let maxStackDepth = 1;

  // Track unique self-call slots (instructions where a function calls itself)
  const executedSelfCallSlots = new Set<string>();

  // Track paint-revisits: tiles that were painted, left, revisited, and had matching conditional execute
  const paintedTiles = new Map<string, TileColor>();
  const leftPaintedTiles = new Set<string>();
  let paintRevisitCount = 0;
  const executedConditionalSlots = new Set<string>();

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

    // Track unique conditional slots that executed
    if (instruction.condition !== null) {
      executedConditionalSlots.add(slotKey);

      // Check for paint-revisit
      const posKey = `${robotPos.x},${robotPos.y}`;
      if (leftPaintedTiles.has(posKey) && paintedTiles.get(posKey) === instruction.condition) {
        paintRevisitCount++;
      }
    }

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
        // Track leaving a painted tile
        const currentPosKey = `${robotPos.x},${robotPos.y}`;
        if (paintedTiles.has(currentPosKey)) {
          leftPaintedTiles.add(currentPosKey);
        }

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
            executedConditionals: executedConditionalSlots.size,
            paintRevisits: paintRevisitCount,
            tilesWerePainted: paintedTiles.size > 0,
            calledFunctions,
            visitedColors,
            stepCount,
            maxStackDepth,
            maxSelfCalls: executedSelfCallSlots.size,
            pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
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

        const tileColor = grid[robotPos.y][robotPos.x]?.color;
        if (tileColor) {
          visitedColors.push(tileColor);
        }

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
            executedConditionals: executedConditionalSlots.size,
            paintRevisits: paintRevisitCount,
            tilesWerePainted: paintedTiles.size > 0,
            calledFunctions,
            visitedColors,
            stepCount,
            maxStackDepth,
            maxSelfCalls: executedSelfCallSlots.size,
            pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
          };
        }
        break;
      }

      case 'left':
        robotDir = TURN_LEFT[robotDir];
        if (!config.disableLoopCheck && stepCount > 1 && robotPos.x === startPos.x && robotPos.y === startPos.y && robotDir === startDir) {
          return {
            success: false,
            errorType: 'loop',
            grid,
            originalGrid: createOriginalGrid(grid, originalColors),
            robotPath,
            turnPositions,
            executedSlots,
            executedConditionals: executedConditionalSlots.size,
            paintRevisits: paintRevisitCount,
            tilesWerePainted: paintedTiles.size > 0,
            calledFunctions,
            visitedColors,
            stepCount,
            maxStackDepth,
            maxSelfCalls: executedSelfCallSlots.size,
            pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
          };
        }
        break;

      case 'right':
        robotDir = TURN_RIGHT[robotDir];
        if (!config.disableLoopCheck && stepCount > 1 && robotPos.x === startPos.x && robotPos.y === startPos.y && robotDir === startDir) {
          return {
            success: false,
            errorType: 'loop',
            grid,
            originalGrid: createOriginalGrid(grid, originalColors),
            robotPath,
            turnPositions,
            executedSlots,
            executedConditionals: executedConditionalSlots.size,
            paintRevisits: paintRevisitCount,
            tilesWerePainted: paintedTiles.size > 0,
            calledFunctions,
            visitedColors,
            stepCount,
            maxStackDepth,
            maxSelfCalls: executedSelfCallSlots.size,
            pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
          };
        }
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5': {
        calledFunctions.add(instruction.type);
        // Check for self-call (recursive call)
        if (frame.functionName === instruction.type) {
          executedSelfCallSlots.add(slotKey);
        }
        stack.push({ functionName: instruction.type, instructionIndex: 0 });
        if (stack.length > maxStackDepth) {
          maxStackDepth = stack.length;
        }
        break;
      }

      case 'paint_red':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          if (currentTile.color !== 'red') {
            currentTile.color = 'red';
            visitedColors.push('red');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'red');
          }
        }
        break;

      case 'paint_green':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          if (currentTile.color !== 'green') {
            currentTile.color = 'green';
            visitedColors.push('green');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'green');
          }
        }
        break;

      case 'paint_blue':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          if (currentTile.color !== 'blue') {
            currentTile.color = 'blue';
            visitedColors.push('blue');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'blue');
          }
        }
        break;
    }
  }

  // Check constraints
  let totalSlots = 0;
  for (const fn of FUNCTIONS) {
    totalSlots += config.slotsPerFunction[fn];
  }

  const coveragePercent = totalSlots > 0 ? (executedSlots.size / totalSlots) * 100 : 100;

  if (coveragePercent < config.minCoveragePercent) {
    return {
      success: false,
      errorType: 'coverage',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Count tiles placed
  let tileCount = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      if (grid[y][x] !== null) {
        tileCount++;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Check minimum tiles
  if (tileCount < config.minTiles) {
    return {
      success: false,
      errorType: 'minTiles',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum bounding box
  const boundingWidth = maxX - minX + 1;
  const boundingHeight = maxY - minY + 1;
  if (Math.max(boundingWidth, boundingHeight) < config.minBoundingBox) {
    return {
      success: false,
      errorType: 'minBoundingBox',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum turns
  if (turnPositions.length < config.minTurns) {
    return {
      success: false,
      errorType: 'minTurns',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check density - count tiles with 3+ adjacent neighbors
  let denseTileCount = 0;
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      if (grid[y][x] !== null) {
        let adjacentCount = 0;
        if (y > 0 && grid[y - 1][x] !== null) adjacentCount++;
        if (y < config.gridSize - 1 && grid[y + 1][x] !== null) adjacentCount++;
        if (x > 0 && grid[y][x - 1] !== null) adjacentCount++;
        if (x < config.gridSize - 1 && grid[y][x + 1] !== null) adjacentCount++;

        if (adjacentCount >= 3) {
          denseTileCount++;
        }
      }
    }
  }

  if (denseTileCount > config.maxDenseTiles) {
    return {
      success: false,
      errorType: 'density',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum stack depth
  if (maxStackDepth < config.minStackDepth) {
    return {
      success: false,
      errorType: 'minStackDepth',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum self-calls (recursive calls)
  if (executedSelfCallSlots.size < config.minSelfCalls) {
    return {
      success: false,
      errorType: 'minSelfCalls',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions: calculatePathTraceInstructions(robotPath, startDir),
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Calculate path trace instructions
  const pathTraceInstructions = calculatePathTraceInstructions(robotPath, startDir);
  const pathLength = robotPath.length - 1;

  // Check minimum path length
  if (pathLength < config.minPathLength) {
    return {
      success: false,
      errorType: 'minPathLength',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check path trace ratio
  const requiredPathTrace = config.minPathTraceRatio * totalSlots;
  if (pathTraceInstructions < requiredPathTrace) {
    return {
      success: false,
      errorType: 'pathTraceRatio',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum conditionals
  if (executedConditionalSlots.size < config.minConditionals) {
    return {
      success: false,
      errorType: 'minConditionals',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check minimum paint-revisits
  if (config.minPaintRevisits > 0 && (paintedTiles.size === 0 || paintRevisitCount < config.minPaintRevisits)) {
    return {
      success: false,
      errorType: 'minPaintRevisits',
      grid,
      originalGrid: createOriginalGrid(grid, originalColors),
      robotPath,
      turnPositions,
      executedSlots,
      executedConditionals: executedConditionalSlots.size,
      paintRevisits: paintRevisitCount,
      tilesWerePainted: paintedTiles.size > 0,
      calledFunctions,
      visitedColors,
      stepCount,
      maxStackDepth,
      maxSelfCalls: executedSelfCallSlots.size,
      pathTraceInstructions,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
    };
  }

  // Check if paint instructions meet the necessity requirement
  // Skip this check if we're already in a nested paint check (prevents infinite recursion)
  if (config.maxUnnecessaryPaints >= 0 && paintedTiles.size > 0 && !options?.skipPaintCheck) {
    // Find all executed paint slots
    const executedPaintSlots: string[] = [];
    for (const slotKey of executedSlots) {
      const [fn, idx] = slotKey.split('-');
      const instr = program[fn as FunctionName]?.[parseInt(idx)];
      if (instr && (instr.type === 'paint_red' || instr.type === 'paint_green' || instr.type === 'paint_blue')) {
        executedPaintSlots.push(slotKey);
      }
    }

    // Count how many paints are unnecessary
    let unnecessaryPaintCount = 0;
    const originalGridCopy = createOriginalGrid(grid, originalColors);
    for (const paintSlot of executedPaintSlots) {
      const skipSet = new Set([paintSlot]);
      const testResult = runSimulation(program, config, {
        skipPaintSlots: skipSet,
        fixedGrid: originalGridCopy,
        fixedStartPos: startPos,
        fixedStartDir: startDir,
        skipPaintCheck: true, // Prevent infinite recursion
      });

      if (testResult.success) {
        unnecessaryPaintCount++;
        if (unnecessaryPaintCount > config.maxUnnecessaryPaints) {
          break;
        }
      }
    }

    if (unnecessaryPaintCount > config.maxUnnecessaryPaints) {
      return {
        success: false,
        errorType: 'unnecessaryPaint',
        grid,
        originalGrid: createOriginalGrid(grid, originalColors),
        robotPath,
        turnPositions,
        executedSlots,
        executedConditionals: executedConditionalSlots.size,
        paintRevisits: paintRevisitCount,
        tilesWerePainted: paintedTiles.size > 0,
        calledFunctions,
        visitedColors,
        stepCount,
        maxStackDepth,
        maxSelfCalls: executedSelfCallSlots.size,
        pathTraceInstructions,
        finalPosition: robotPos,
        finalDirection: robotDir,
        startDirection: startDir,
      };
    }
  }

  return {
    success: true,
    errorType: null,
    grid,
    originalGrid: createOriginalGrid(grid, originalColors),
    robotPath,
    turnPositions,
    executedSlots,
    executedConditionals: executedConditionalSlots.size,
    paintRevisits: paintRevisitCount,
    tilesWerePainted: paintedTiles.size > 0,
    calledFunctions,
    visitedColors,
    stepCount,
    maxStackDepth,
    maxSelfCalls: executedSelfCallSlots.size,
    pathTraceInstructions,
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
  density: number;
  minStackDepth: number;
  minSelfCalls: number;
  pathTraceRatio: number;
  minConditionals: number;
  minPaintRevisits: number;
  unnecessaryPaint: number;
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
      density: 0,
      minStackDepth: 0,
      minSelfCalls: 0,
      pathTraceRatio: 0,
      minConditionals: 0,
      minPaintRevisits: 0,
      unnecessaryPaint: 0,
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
        console.log(`    Error breakdown: boundary=${errorCounts.boundary}, coverage=${errorCounts.coverage}, loop=${errorCounts.loop}, minTiles=${errorCounts.minTiles}, minBoundingBox=${errorCounts.minBoundingBox}, minTurns=${errorCounts.minTurns}, minPathLength=${errorCounts.minPathLength}, density=${errorCounts.density}, minStackDepth=${errorCounts.minStackDepth}, minSelfCalls=${errorCounts.minSelfCalls}, pathTraceRatio=${errorCounts.pathTraceRatio}, minConditionals=${errorCounts.minConditionals}, minPaintRevisits=${errorCounts.minPaintRevisits}, unnecessaryPaint=${errorCounts.unnecessaryPaint}`);
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

      // Run simulation with error handling
      let result: SimulationResult;
      try {
        result = runSimulation(program, this.config);
      } catch (err) {
        // Handle stack overflow or other errors - just skip this attempt
        errorCounts.other++;
        continue;
      }

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
        case 'density': errorCounts.density++; break;
        case 'minStackDepth': errorCounts.minStackDepth++; break;
        case 'minSelfCalls': errorCounts.minSelfCalls++; break;
        case 'pathTraceRatio': errorCounts.pathTraceRatio++; break;
        case 'minConditionals': errorCounts.minConditionals++; break;
        case 'minPaintRevisits': errorCounts.minPaintRevisits++; break;
        case 'unnecessaryPaint': errorCounts.unnecessaryPaint++; break;
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
