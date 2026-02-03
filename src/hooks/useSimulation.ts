import { useState, useCallback, useRef } from 'react';
import type {
  Direction,
  FunctionName,
  InstructionType,
  Position,
  Program,
  StackFrame,
  Tile,
  TileColor,
} from '../engine/types';
import type {
  SimulationConfig,
  SimulationState,
  ErrorCounts,
} from '../engine/simulationTypes';
import { DEFAULT_SIMULATION_CONFIG, createEmptySimulationState, createEmptyErrorCounts } from '../engine/simulationTypes';

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

const MAX_MUTATION_ATTEMPTS = 100;

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

// Generate random condition based on config
function getRandomCondition(conditionalPercent: number): TileColor | null {
  if (Math.random() * 100 >= conditionalPercent) return null; // Unconditional
  return getRandomElement(COLORS);
}

// Generate random instruction type based on weights
function getWeightedRandomInstruction(
  weights: SimulationConfig['instructionWeights'],
  slotsPerFunction: SimulationConfig['slotsPerFunction']
): InstructionType {
  // Only include functions that have slots
  const availableFunctions = FUNCTIONS.filter(fn => slotsPerFunction[fn] > 0);

  // If no functions have slots, set function call weight to 0
  const effectiveFunctionCallWeight = availableFunctions.length > 0 ? weights.functionCall : 0;

  const totalWeight = weights.forward + weights.turn + effectiveFunctionCallWeight + weights.paint;
  const roll = Math.random() * totalWeight;

  let cumulative = 0;

  // Forward
  cumulative += weights.forward;
  if (roll < cumulative) return 'forward';

  // Turn (left or right)
  cumulative += weights.turn;
  if (roll < cumulative) return Math.random() < 0.5 ? 'left' : 'right';

  // Function call (only to functions with slots)
  cumulative += effectiveFunctionCallWeight;
  if (roll < cumulative && availableFunctions.length > 0) {
    return getRandomElement(availableFunctions);
  }

  // Paint (red, green, blue)
  const paintInstructions: InstructionType[] = ['paint_red', 'paint_green', 'paint_blue'];
  return getRandomElement(paintInstructions);
}

// Generate random condition, optionally excluding a specific color
function getRandomConditionExcluding(
  conditionalPercent: number,
  excludeColor: TileColor | null
): TileColor | null {
  if (Math.random() * 100 >= conditionalPercent) return null; // Unconditional

  if (excludeColor === null) {
    return getRandomElement(COLORS);
  }

  // Exclude the specified color
  const availableColors = COLORS.filter(c => c !== excludeColor);
  return getRandomElement(availableColors);
}

// Generate random instruction type, optionally excluding opposite turn
function getWeightedRandomInstructionExcluding(
  weights: SimulationConfig['instructionWeights'],
  slotsPerFunction: SimulationConfig['slotsPerFunction'],
  excludeOppositeTurn: 'left' | 'right' | null
): InstructionType {
  // Only include functions that have slots
  const availableFunctions = FUNCTIONS.filter(fn => slotsPerFunction[fn] > 0);

  // If no functions have slots, set function call weight to 0
  const effectiveFunctionCallWeight = availableFunctions.length > 0 ? weights.functionCall : 0;

  // Adjust turn weight if we need to exclude one direction
  let effectiveTurnWeight = weights.turn;
  if (excludeOppositeTurn !== null) {
    effectiveTurnWeight = weights.turn / 2; // Only one turn direction available
  }

  const totalWeight = weights.forward + effectiveTurnWeight + effectiveFunctionCallWeight + weights.paint;
  const roll = Math.random() * totalWeight;

  let cumulative = 0;

  // Forward
  cumulative += weights.forward;
  if (roll < cumulative) return 'forward';

  // Turn (left or right, excluding opposite if specified)
  cumulative += effectiveTurnWeight;
  if (roll < cumulative) {
    if (excludeOppositeTurn === 'left') return 'left'; // Exclude right, return left
    if (excludeOppositeTurn === 'right') return 'right'; // Exclude left, return right
    return Math.random() < 0.5 ? 'left' : 'right';
  }

  // Function call (only to functions with slots)
  cumulative += effectiveFunctionCallWeight;
  if (roll < cumulative && availableFunctions.length > 0) {
    return getRandomElement(availableFunctions);
  }

  // Paint (red, green, blue)
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

      // Determine what to exclude based on previous instruction
      let excludeOppositeTurn: 'left' | 'right' | null = null;
      let excludeColor: TileColor | null = null;

      if (prevInstruction) {
        // If previous was unconditional turn, exclude opposite turn for unconditional
        if (prevInstruction.condition === null) {
          if (prevInstruction.type === 'left') excludeOppositeTurn = 'left'; // Exclude right
          else if (prevInstruction.type === 'right') excludeOppositeTurn = 'right'; // Exclude left
        }
        // If previous had a condition, exclude same color
        if (prevInstruction.condition !== null) {
          excludeColor = prevInstruction.condition;
        }
      }

      // Generate condition first to know if we need to apply turn exclusion
      let condition = getRandomConditionExcluding(config.conditionalPercent, excludeColor);

      // Only exclude opposite turn if this instruction is also unconditional
      const applyTurnExclusion = condition === null ? excludeOppositeTurn : null;
      let type = getWeightedRandomInstructionExcluding(
        config.instructionWeights,
        config.slotsPerFunction,
        applyTurnExclusion
      );

      // Don't allow unconditional F1 call in last slot of F1 (creates infinite loop)
      const isLastSlot = i === slots - 1;
      if (fn === 'f1' && isLastSlot && type === 'f1' && condition === null) {
        // Either make it conditional or change the instruction
        if (Math.random() < 0.5) {
          condition = getRandomElement(COLORS);
        } else {
          // Generate a different instruction type
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

function cloneProgram(program: Program): Program {
  return {
    f1: program.f1.map(i => i ? { ...i } : null),
    f2: program.f2.map(i => i ? { ...i } : null),
    f3: program.f3.map(i => i ? { ...i } : null),
    f4: program.f4.map(i => i ? { ...i } : null),
    f5: program.f5.map(i => i ? { ...i } : null),
  };
}

function parseSlotKey(key: string): { fn: FunctionName; idx: number } {
  const [fn, idxStr] = key.split('-');
  return { fn: fn as FunctionName, idx: parseInt(idxStr, 10) };
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

// Calculate minimum turns needed between two directions
function getTurnsBetween(from: Direction, to: Direction): number {
  if (from === to) return 0;
  const dirs: Direction[] = ['up', 'right', 'down', 'left'];
  const fromIdx = dirs.indexOf(from);
  const toIdx = dirs.indexOf(to);
  const diff = Math.abs(fromIdx - toIdx);
  return diff === 3 ? 1 : diff; // 3 means 1 turn the other way (e.g., up to left)
}

// Get opposite direction
function getOppositeDirection(dir: Direction): Direction {
  switch (dir) {
    case 'up': return 'down';
    case 'down': return 'up';
    case 'left': return 'right';
    case 'right': return 'left';
  }
}

// Check if two directions are 90 degrees apart (a turn)
function is90DegreeTurn(entry: Direction, exit: Direction): boolean {
  // A 90-degree turn means exit is neither same as entry nor opposite
  return exit !== entry && exit !== getOppositeDirection(entry);
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
// This considers entry and exit directions at each tile
function calculatePathTraceInstructions(robotPath: Position[], startDirection: Direction): number {
  if (robotPath.length < 2) return 0;

  let instructions = 0;
  let currentDir = startDirection;

  for (let i = 1; i < robotPath.length; i++) {
    const prev = robotPath[i - 1];
    const curr = robotPath[i];

    // Calculate direction needed for this move
    const moveDir = getDirectionBetween(prev, curr);

    // Count turns needed to face this direction
    const turns = getTurnsBetween(currentDir, moveDir);
    instructions += turns;

    // Count the forward
    instructions += 1;

    // Update current direction
    currentDir = moveDir;
  }

  return instructions;
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
        color: originalColor ?? tile.color, // Use original color if tracked, otherwise current
      };
    })
  );
}

interface SimulationResult {
  success: boolean;
  errorType: 'boundary' | 'coverage' | 'loop' | 'minTiles' | 'minBoundingBox' | 'minTurns' | 'density' | 'incomplete' | 'minStackDepth' | 'minSelfCalls' | 'pathTraceRatio' | 'minPathLength' | 'minConditionals' | 'minPaintRevisits' | 'unnecessaryPaint' | null;
  grid: (Tile | null)[][];
  originalGrid: (Tile | null)[][]; // Grid with original colors before any paint operations
  robotPath: Position[];
  turnPositions: Position[];
  executedSlots: Set<string>;
  executedConditionals: number; // Number of conditional instructions that executed
  paintRevisits: number; // Count of valid paint-revisit events
  tilesWerePainted: boolean; // Whether any tiles were painted during execution
  calledFunctions: Set<FunctionName>;
  visitedColors: TileColor[];
  stepCount: number;
  maxStackDepth: number; // Maximum stack depth reached during execution
  maxSelfCalls: number; // Maximum self-calls (recursive calls) by any function
  pathTraceInstructions: number; // Number of instructions needed to trace the path naively
  finalPosition: Position;
  finalDirection: Direction;
  startDirection: Direction;
  boundarySlot: string | null; // The slot that caused the boundary error (if any)
  recentForwards: string[]; // Recent forward instructions before boundary (for smarter mutation)
}

function runSimulation(
  program: Program,
  config: SimulationConfig,
  options?: {
    skipPaintSlots?: Set<string>; // Paint slots to skip during this run
    fixedGrid?: (Tile | null)[][]; // Use this grid instead of generating new one
    fixedStartPos?: Position;
    fixedStartDir?: Direction;
  }
): SimulationResult {
  const grid = options?.fixedGrid
    ? options.fixedGrid.map(row => row.map(tile => tile ? { ...tile } : null))
    : createEmptyGrid(config.gridSize);
  const center = Math.floor(config.gridSize / 2);

  // Place starting tile at center with random weighted color (only if not using fixed grid)
  let startColor: TileColor;
  if (options?.fixedGrid) {
    // Find start color from fixed grid
    const startX = options.fixedStartPos?.x ?? center;
    const startY = options.fixedStartPos?.y ?? center;
    startColor = grid[startY][startX]?.color ?? 'red';
  } else {
    startColor = getWeightedRandomColor(config.colorRatios);
    grid[center][center] = {
      color: startColor,
      hasStar: false,
    };
  }

  // Robot starts at center facing random direction (or use fixed values)
  let robotPos: Position = options?.fixedStartPos ?? { x: center, y: center };
  let robotDir: Direction = options?.fixedStartDir ?? getRandomElement(DIRECTIONS);

  // Store initial state for loop detection
  const startPos = { ...robotPos };
  const startDir = robotDir;

  const robotPath: Position[] = [{ ...robotPos }];
  const turnPositions: Position[] = []; // Positions where robot made 90-degree turns
  let currentTileEntryDirection: Direction | null = null; // Direction robot entered current tile
  const executedSlots = new Set<string>();
  const calledFunctions = new Set<FunctionName>(['f1']); // F1 is always called initially
  const visitedColors: TileColor[] = [startColor];
  const recentForwards: string[] = []; // Track recent forward slots for boundary analysis
  const MAX_RECENT_FORWARDS = 5;

  // Track original colors of tiles (before any paint operations)
  const originalColors = new Map<string, TileColor>();
  originalColors.set(`${robotPos.x},${robotPos.y}`, startColor);

  // Stack-based execution
  const stack: StackFrame[] = [{ functionName: 'f1', instructionIndex: 0 }];
  let stepCount = 0;
  let loopIterations = 0; // Safety counter to prevent infinite loops
  const MAX_LOOP_ITERATIONS = config.maxSteps * 100; // Allow many iterations but not infinite
  let maxStackDepth = 1; // Track maximum stack depth reached

  // Track unique self-call slots (instructions where a function calls itself)
  const executedSelfCallSlots = new Set<string>();

  // Track paint-revisits: tiles that were painted, left, revisited, and had matching conditional execute
  const paintedTiles = new Map<string, TileColor>(); // position -> painted color
  const leftPaintedTiles = new Set<string>(); // tiles where we painted and then left
  let paintRevisitCount = 0;
  const executedConditionalSlots = new Set<string>(); // Unique conditional slots that executed

  while (stepCount < config.maxSteps && loopIterations < MAX_LOOP_ITERATIONS) {
    loopIterations++;
    // Auto-loop F1 when stack empties (matches GameEngine behavior)
    if (stack.length === 0) {
      stack.push({ functionName: 'f1', instructionIndex: 0 });
    }

    const frame = stack[stack.length - 1];
    const func = program[frame.functionName];

    // Check if function exhausted
    if (frame.instructionIndex >= func.length) {
      stack.pop();
      continue;
    }

    const instruction = func[frame.instructionIndex];
    const slotKey = `${frame.functionName}-${frame.instructionIndex}`;
    frame.instructionIndex++;

    // Skip null instructions
    if (!instruction) {
      continue;
    }

    // Check condition
    const currentTile = grid[robotPos.y]?.[robotPos.x];
    if (instruction.condition !== null) {
      if (!currentTile || currentTile.color !== instruction.condition) {
        continue; // Condition not met, skip
      }
    }

    // Mark slot as executed
    executedSlots.add(slotKey);
    stepCount++;

    // Track unique conditional slots that executed
    if (instruction.condition !== null) {
      executedConditionalSlots.add(slotKey);

      // Check for paint-revisit: on a tile that was painted, left, and now revisited
      // with a conditional matching the painted color
      const posKey = `${robotPos.x},${robotPos.y}`;
      if (leftPaintedTiles.has(posKey) && paintedTiles.get(posKey) === instruction.condition) {
        paintRevisitCount++;
      }
    }

    // Check if we can terminate early (coverage met and avg executions within limit)
    let totalSlots = 0;
    for (const fn of FUNCTIONS) {
      totalSlots += config.slotsPerFunction[fn];
    }
    const currentCoverage = totalSlots > 0 ? (executedSlots.size / totalSlots) * 100 : 100;
    const avgExecutions = executedSlots.size > 0 ? stepCount / executedSlots.size : 0;

    if (currentCoverage >= config.minCoveragePercent && avgExecutions >= config.maxAvgExecutionsPerSlot) {
      // Coverage met and avg executions reached - break to run success checks
      break;
    }

    // Execute instruction
    switch (instruction.type) {
      case 'forward': {
        // Track this forward for boundary analysis
        recentForwards.push(slotKey);
        if (recentForwards.length > MAX_RECENT_FORWARDS) {
          recentForwards.shift();
        }

        // Track leaving a painted tile (for paint-revisit tracking)
        const currentPosKey = `${robotPos.x},${robotPos.y}`;
        if (paintedTiles.has(currentPosKey)) {
          leftPaintedTiles.add(currentPosKey);
        }

        const delta = DIRECTION_DELTAS[robotDir];
        const newPos: Position = {
          x: robotPos.x + delta.x,
          y: robotPos.y + delta.y,
        };

        // Check boundary
        if (
          newPos.x < 0 ||
          newPos.x >= config.gridSize ||
          newPos.y < 0 ||
          newPos.y >= config.gridSize
        ) {
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
            boundarySlot: slotKey, // The forward that caused the boundary error
            recentForwards: [...recentForwards],
          };
        }

        // Place tile if empty
        if (!grid[newPos.y][newPos.x]) {
          const newColor = getWeightedRandomColor(config.colorRatios);
          grid[newPos.y][newPos.x] = {
            color: newColor,
            hasStar: false,
          };
          // Track the original color (before any paint operations)
          originalColors.set(`${newPos.x},${newPos.y}`, newColor);
        }

        // Check for 90-degree turn: exit direction differs from both entry and opposite of entry
        if (currentTileEntryDirection !== null && is90DegreeTurn(currentTileEntryDirection, robotDir)) {
          // Record the position where the turn happened (before moving)
          turnPositions.push({ ...robotPos });
        }

        robotPos = newPos;
        // Record entry direction for the new tile
        currentTileEntryDirection = robotDir;
        robotPath.push({ ...robotPos });

        // Track visited color
        const tileColor = grid[robotPos.y][robotPos.x]?.color;
        if (tileColor) {
          visitedColors.push(tileColor);
        }

        // Check for loop - returned to start position and orientation
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
            boundarySlot: null,
            recentForwards: [],
          };
        }
        break;
      }

      case 'left':
        robotDir = TURN_LEFT[robotDir];
        // Check for loop - returned to start position and orientation
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
            boundarySlot: null,
            recentForwards: [],
          };
        }
        break;

      case 'right':
        robotDir = TURN_RIGHT[robotDir];
        // Check for loop - returned to start position and orientation
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
            boundarySlot: null,
            recentForwards: [],
          };
        }
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5': {
        calledFunctions.add(instruction.type);
        // Check for self-call (recursive call) - track unique slots
        if (frame.functionName === instruction.type) {
          executedSelfCallSlots.add(slotKey);
        }
        stack.push({ functionName: instruction.type, instructionIndex: 0 });
        // Track maximum stack depth
        if (stack.length > maxStackDepth) {
          maxStackDepth = stack.length;
        }
        break;
      }

      case 'paint_red':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          // Only count as a paint if it actually changes the color
          if (currentTile.color !== 'red') {
            currentTile.color = 'red';
            visitedColors.push('red');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'red');
          }
        }
        break;

      case 'paint_green':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          // Only count as a paint if it actually changes the color
          if (currentTile.color !== 'green') {
            currentTile.color = 'green';
            visitedColors.push('green');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'green');
          }
        }
        break;

      case 'paint_blue':
        if (currentTile && !options?.skipPaintSlots?.has(slotKey)) {
          // Only count as a paint if it actually changes the color
          if (currentTile.color !== 'blue') {
            currentTile.color = 'blue';
            visitedColors.push('blue');
            paintedTiles.set(`${robotPos.x},${robotPos.y}`, 'blue');
          }
        }
        break;
    }
  }

  // Check coverage against threshold
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
      boundarySlot: null,
      recentForwards: [],
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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Check minimum bounding box (width OR height must be at least minBoundingBox)
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
      boundarySlot: null,
      recentForwards: [],
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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Check density - count tiles with 3+ adjacent neighbors
  let denseTileCount = 0;
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      if (grid[y][x] !== null) {
        // Count adjacent tiles (up, down, left, right)
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
      boundarySlot: null,
      recentForwards: [],
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
      boundarySlot: null,
      recentForwards: [],
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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Calculate path trace instructions
  const pathTraceInstructions = calculatePathTraceInstructions(robotPath, startDir);
  const pathLength = robotPath.length - 1; // Number of forward moves

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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Check path trace ratio - path must require at least minPathTraceRatio * totalSlots instructions
  // (totalSlots was already calculated above)
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
      boundarySlot: null,
      recentForwards: [],
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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Check minimum paint-revisits
  // If minPaintRevisits > 0, require at least 1 paint that actually changed a tile color AND the revisit count
  // paintedTiles only tracks paints that changed the tile color (not painting same color)
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
      boundarySlot: null,
      recentForwards: [],
    };
  }

  // Check if paint instructions meet the necessity requirement
  // maxUnnecessaryPaints: -1 = disabled, 0 = all must be necessary, N = up to N can be unnecessary
  if (config.maxUnnecessaryPaints >= 0 && paintedTiles.size > 0) {
    // Find all executed paint slots
    const executedPaintSlots: string[] = [];
    for (const slotKey of executedSlots) {
      const [fn, idx] = slotKey.split('-');
      const instr = program[fn as FunctionName]?.[parseInt(idx)];
      if (instr && (instr.type === 'paint_red' || instr.type === 'paint_green' || instr.type === 'paint_blue')) {
        executedPaintSlots.push(slotKey);
      }
    }

    // Count how many paints are unnecessary (can be removed while still solving)
    let unnecessaryPaintCount = 0;
    const originalGridCopy = createOriginalGrid(grid, originalColors);
    for (const paintSlot of executedPaintSlots) {
      const skipSet = new Set([paintSlot]);
      const testResult = runSimulation(program, config, {
        skipPaintSlots: skipSet,
        fixedGrid: originalGridCopy,
        fixedStartPos: startPos,
        fixedStartDir: startDir,
      });

      if (testResult.success) {
        unnecessaryPaintCount++;
        // Early exit if we've exceeded the limit
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
        boundarySlot: null,
        recentForwards: [],
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
    boundarySlot: null,
    recentForwards: [],
  };
}

// Get most common color from visited colors (excludes null)
function getMostCommonColor(visitedColors: TileColor[]): 'red' | 'green' | 'blue' {
  const counts: Record<'red' | 'green' | 'blue', number> = { red: 0, green: 0, blue: 0 };
  for (const color of visitedColors) {
    if (color !== null) counts[color]++;
  }

  let maxColor: 'red' | 'green' | 'blue' = 'red';
  let maxCount = 0;
  for (const color of COLORS) {
    if (counts[color] > maxCount) {
      maxCount = counts[color];
      maxColor = color;
    }
  }
  return maxColor;
}

// Find slots that are blocked by an unconditional function call before them
function findBlockedByUnconditionalCall(program: Program, config: SimulationConfig): Set<string> {
  const blockedSlots = new Set<string>();

  for (const fn of FUNCTIONS) {
    let foundUnconditionalCall = false;
    for (let i = 0; i < config.slotsPerFunction[fn]; i++) {
      const instr = program[fn][i];
      if (foundUnconditionalCall) {
        // This slot is blocked by an earlier unconditional function call
        blockedSlots.add(`${fn}-${i}`);
      } else if (instr && instr.condition === null && FUNCTIONS.includes(instr.type as FunctionName)) {
        // This is an unconditional function call - slots after it may be blocked
        foundUnconditionalCall = true;
      }
    }
  }

  return blockedSlots;
}

// Smart mutation that targets unexecuted slots
function smartMutate(
  program: Program,
  config: SimulationConfig,
  result: SimulationResult
): Program {
  const newProgram = cloneProgram(program);

  // Build list of all slots
  const allSlots: string[] = [];
  for (const fn of FUNCTIONS) {
    for (let i = 0; i < config.slotsPerFunction[fn]; i++) {
      allSlots.push(`${fn}-${i}`);
    }
  }

  // Find unexecuted slots
  const unexecutedSlots = allSlots.filter(s => !result.executedSlots.has(s));

  // Find uncalled functions (that have slots)
  const uncalledFunctions = FUNCTIONS.filter(
    fn => config.slotsPerFunction[fn] > 0 && !result.calledFunctions.has(fn)
  );

  // Find slots blocked by unconditional function calls
  const blockedByCall = findBlockedByUnconditionalCall(program, config);

  const mostCommonColor = getMostCommonColor(result.visitedColors);

  // BOUNDARY-SPECIFIC STRATEGIES
  // If we hit a boundary, prioritize mutating the forward that caused it
  if (result.errorType === 'boundary' && result.boundarySlot) {
    const { fn, idx } = parseSlotKey(result.boundarySlot);
    const instr = newProgram[fn][idx];

    if (instr && Math.random() < 0.6) {
      // 60% chance to directly mutate the offending forward
      const roll = Math.random();

      if (roll < 0.35) {
        // 35%: Change to a turn instruction
        newProgram[fn][idx] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: instr.condition,
        };
        return newProgram;
      } else if (roll < 0.65) {
        // 30%: Make it conditional (so it won't always execute)
        if (instr.condition === null) {
          newProgram[fn][idx] = { ...instr, condition: mostCommonColor };
          return newProgram;
        }
      } else if (roll < 0.85) {
        // 20%: Change to a different color condition
        const otherColors = COLORS.filter(c => c !== instr.condition);
        newProgram[fn][idx] = { ...instr, condition: getRandomElement(otherColors) };
        return newProgram;
      }
      // 15%: Fall through to other strategies
    }

    // Also consider mutating recent forwards that led up to the boundary
    if (result.recentForwards.length > 1 && Math.random() < 0.3) {
      // Pick one of the earlier forwards (not the last one which directly caused it)
      const earlierForwards = result.recentForwards.slice(0, -1);
      const targetSlot = getRandomElement(earlierForwards);
      const { fn: targetFn, idx: targetIdx } = parseSlotKey(targetSlot);
      const targetInstr = newProgram[targetFn][targetIdx];

      if (targetInstr) {
        // Change it to a turn to alter the path
        newProgram[targetFn][targetIdx] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: targetInstr.condition,
        };
        return newProgram;
      }
    }
  }

  // MIN_PAINT_REVISITS-SPECIFIC STRATEGIES
  // Need more revisits to painted tiles with matching conditional instructions
  if (result.errorType === 'minPaintRevisits' && Math.random() < 0.8) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy 1: Add paint instructions to create more painted tiles
    if (Math.random() < 0.3) {
      const executedNonPaint = executedSlotsList.filter(slotKey => {
        const { fn, idx } = parseSlotKey(slotKey);
        const instr = program[fn][idx];
        return instr && !instr.type.startsWith('paint_');
      });

      if (executedNonPaint.length > 0) {
        const targetSlot = getRandomElement(executedNonPaint);
        const { fn, idx } = parseSlotKey(targetSlot);
        const instr = newProgram[fn][idx];
        if (instr) {
          const paintTypes: InstructionType[] = ['paint_red', 'paint_green', 'paint_blue'];
          newProgram[fn][idx] = {
            type: getRandomElement(paintTypes),
            condition: instr.condition,
          };
          return newProgram;
        }
      }
    }

    // Strategy 2: Add conditional instructions matching common colors
    // This helps when revisiting painted tiles
    if (Math.random() < 0.4) {
      if (unexecutedSlots.length > 0) {
        const targetSlot = getRandomElement(unexecutedSlots);
        const { fn, idx } = parseSlotKey(targetSlot);
        // Add a conditional forward/turn that will execute when on the painted color
        newProgram[fn][idx] = {
          type: Math.random() < 0.7 ? 'forward' : (Math.random() < 0.5 ? 'left' : 'right'),
          condition: mostCommonColor,
        };
        return newProgram;
      }
    }

    // Strategy 3: Add turns after paint instructions to help robot come back
    const executedPaints = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.type.startsWith('paint_');
    });

    if (executedPaints.length > 0 && Math.random() < 0.35) {
      // Find a slot after a paint instruction and make it a turn
      const paintSlot = getRandomElement(executedPaints);
      const { fn, idx } = parseSlotKey(paintSlot);
      if (idx + 1 < config.slotsPerFunction[fn]) {
        newProgram[fn][idx + 1] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: null,
        };
        return newProgram;
      }
    }

    // Strategy 4: Add self-call to create loops that revisit tiles
    if (Math.random() < 0.3) {
      const functionsWithSlots = FUNCTIONS.filter(fn => config.slotsPerFunction[fn] > 0);
      if (functionsWithSlots.length > 0 && unexecutedSlots.length > 0) {
        const targetSlot = getRandomElement(unexecutedSlots);
        const { fn, idx } = parseSlotKey(targetSlot);
        // Make a self-call to create a loop
        newProgram[fn][idx] = {
          type: fn,
          condition: mostCommonColor,
        };
        return newProgram;
      }
    }

    // Strategy 5: Convert unconditional instructions to conditional ones
    // so they'll execute when on painted tiles
    const executedUnconditional = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.condition === null;
    });

    if (executedUnconditional.length > 0 && Math.random() < 0.4) {
      const targetSlot = getRandomElement(executedUnconditional);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          ...instr,
          condition: mostCommonColor,
        };
        return newProgram;
      }
    }
  }

  // MIN_CONDITIONALS-SPECIFIC STRATEGIES
  // If not enough conditional instructions executed, add conditions to instructions
  if (result.errorType === 'minConditionals' && Math.random() < 0.8) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy 1: Find executed unconditional instructions and add conditions
    const executedUnconditional = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.condition === null;
    });

    if (executedUnconditional.length > 0 && Math.random() < 0.6) {
      const targetSlot = getRandomElement(executedUnconditional);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        // Add a condition that matches the most common visited color
        newProgram[fn][idx] = {
          ...instr,
          condition: mostCommonColor,
        };
        return newProgram;
      }
    }

    // Strategy 2: Change condition of unexecuted conditional to match visited colors
    const unexecutedConditional = unexecutedSlots.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.condition !== null;
    });

    if (unexecutedConditional.length > 0 && Math.random() < 0.5) {
      const targetSlot = getRandomElement(unexecutedConditional);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          ...instr,
          condition: mostCommonColor,
        };
        return newProgram;
      }
    }

    // Strategy 3: Make an unexecuted slot a conditional instruction
    if (unexecutedSlots.length > 0) {
      const targetSlot = getRandomElement(unexecutedSlots);
      const { fn, idx } = parseSlotKey(targetSlot);
      newProgram[fn][idx] = {
        type: getWeightedRandomInstruction(config.instructionWeights, config.slotsPerFunction),
        condition: mostCommonColor,
      };
      return newProgram;
    }
  }

  // MIN_TILES-SPECIFIC STRATEGIES
  // If not enough tiles were placed, we need more forward moves to new positions
  // Tiles are created when robot moves forward to an empty position
  if (result.errorType === 'minTiles' && Math.random() < 0.8) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy 1: Convert executed non-forward instructions to forwards
    // More forwards = more potential tiles
    const executedNonForwards = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.type !== 'forward' && !FUNCTIONS.includes(instr.type as FunctionName);
    });

    if (executedNonForwards.length > 0 && Math.random() < 0.4) {
      const targetSlot = getRandomElement(executedNonForwards);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          type: 'forward',
          condition: instr.condition,
        };
        return newProgram;
      }
    }

    // Strategy 2: Add turns between forwards to explore new directions
    // Without turns, robot just goes in a line and may hit boundary quickly
    const executedForwards = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr?.type === 'forward';
    });

    // If we have many forwards but few tiles, we might be revisiting positions
    // Add turns to explore new areas
    if (executedForwards.length > 3 && Math.random() < 0.35) {
      // Find a forward and change it to a turn
      const targetSlot = getRandomElement(executedForwards);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: instr.condition,
        };
        return newProgram;
      }
    }

    // Strategy 3: Make conditional forwards unconditional
    for (const fn of FUNCTIONS) {
      for (let i = 0; i < config.slotsPerFunction[fn]; i++) {
        const instr = program[fn][i];
        if (instr && instr.type === 'forward' && instr.condition !== null) {
          if (Math.random() < 0.25) {
            newProgram[fn][i] = { ...instr, condition: null };
            return newProgram;
          }
        }
      }
    }

    // Strategy 4: Add function calls to extend execution
    // More execution = more chances for forwards to run
    if (Math.random() < 0.3) {
      const functionsWithSlots = FUNCTIONS.filter(fn => config.slotsPerFunction[fn] > 0);
      if (functionsWithSlots.length > 0 && unexecutedSlots.length > 0) {
        const targetSlot = getRandomElement(unexecutedSlots);
        const { fn, idx } = parseSlotKey(targetSlot);
        const targetFn = getRandomElement(functionsWithSlots);
        newProgram[fn][idx] = {
          type: targetFn,
          condition: null, // Unconditional to ensure it executes
        };
        return newProgram;
      }
    }

    // Strategy 5: Change unexecuted slots to forward-turn patterns
    if (unexecutedSlots.length >= 2 && Math.random() < 0.4) {
      // Pick two adjacent unexecuted slots and make them forward + turn
      for (const fn of FUNCTIONS) {
        for (let i = 0; i < config.slotsPerFunction[fn] - 1; i++) {
          const slot1 = `${fn}-${i}`;
          const slot2 = `${fn}-${i + 1}`;
          if (!result.executedSlots.has(slot1) && !result.executedSlots.has(slot2)) {
            newProgram[fn][i] = { type: 'forward', condition: null };
            newProgram[fn][i + 1] = { type: Math.random() < 0.5 ? 'left' : 'right', condition: null };
            return newProgram;
          }
        }
      }
    }

    // Strategy 6: Single unexecuted slot - make it unconditional forward
    if (unexecutedSlots.length > 0) {
      const targetSlot = getRandomElement(unexecutedSlots);
      const { fn, idx } = parseSlotKey(targetSlot);
      newProgram[fn][idx] = {
        type: 'forward',
        condition: null,
      };
      return newProgram;
    }
  }

  // PATH_TRACE_RATIO-SPECIFIC STRATEGIES
  // If path trace ratio is too low, we need a longer/more complex path
  // This is similar to minPathLength but also benefits from more turns
  if (result.errorType === 'pathTraceRatio' && Math.random() < 0.7) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy: Add more forwards (increases path length)
    if (Math.random() < 0.5) {
      // Convert non-movement executed instructions to forwards
      const executedNonMovement = executedSlotsList.filter(slotKey => {
        const { fn, idx } = parseSlotKey(slotKey);
        const instr = program[fn][idx];
        return instr && instr.type !== 'forward' && instr.type !== 'left' && instr.type !== 'right' && !FUNCTIONS.includes(instr.type as FunctionName);
      });

      if (executedNonMovement.length > 0) {
        const targetSlot = getRandomElement(executedNonMovement);
        const { fn, idx } = parseSlotKey(targetSlot);
        const instr = newProgram[fn][idx];
        if (instr) {
          newProgram[fn][idx] = {
            type: 'forward',
            condition: instr.condition,
          };
          return newProgram;
        }
      }
    }

    // Strategy: Add more turns (each turn adds to trace instructions)
    if (Math.random() < 0.5) {
      const executedNonTurns = executedSlotsList.filter(slotKey => {
        const { fn, idx } = parseSlotKey(slotKey);
        const instr = program[fn][idx];
        return instr && instr.type !== 'left' && instr.type !== 'right';
      });

      if (executedNonTurns.length > 0) {
        const targetSlot = getRandomElement(executedNonTurns);
        const { fn, idx } = parseSlotKey(targetSlot);
        const instr = newProgram[fn][idx];
        if (instr) {
          newProgram[fn][idx] = {
            type: Math.random() < 0.5 ? 'left' : 'right',
            condition: instr.condition,
          };
          return newProgram;
        }
      }
    }

    // Strategy: Make unexecuted slots unconditional forwards or turns
    if (unexecutedSlots.length > 0) {
      const targetSlot = getRandomElement(unexecutedSlots);
      const { fn, idx } = parseSlotKey(targetSlot);
      newProgram[fn][idx] = {
        type: Math.random() < 0.7 ? 'forward' : (Math.random() < 0.5 ? 'left' : 'right'),
        condition: null,
      };
      return newProgram;
    }
  }

  // MIN_PATH_LENGTH-SPECIFIC STRATEGIES
  // If the path is too short, add more forward instructions
  if (result.errorType === 'minPathLength' && Math.random() < 0.7) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy: Convert executed non-forward instructions to forwards
    const executedNonForwards = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr && instr.type !== 'forward' && !FUNCTIONS.includes(instr.type as FunctionName);
    });

    if (executedNonForwards.length > 0 && Math.random() < 0.5) {
      const targetSlot = getRandomElement(executedNonForwards);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          type: 'forward',
          condition: instr.condition,
        };
        return newProgram;
      }
    }

    // Strategy: Make conditional forwards unconditional
    for (const fn of FUNCTIONS) {
      for (let i = 0; i < config.slotsPerFunction[fn]; i++) {
        const instr = program[fn][i];
        if (instr && instr.type === 'forward' && instr.condition !== null) {
          if (Math.random() < 0.3) {
            newProgram[fn][i] = { ...instr, condition: null };
            return newProgram;
          }
        }
      }
    }

    // Strategy: Change unexecuted slots to unconditional forwards
    if (unexecutedSlots.length > 0) {
      const targetSlot = getRandomElement(unexecutedSlots);
      const { fn, idx } = parseSlotKey(targetSlot);
      newProgram[fn][idx] = {
        type: 'forward',
        condition: null,
      };
      return newProgram;
    }
  }

  // MIN_TURNS-SPECIFIC STRATEGIES
  // If we don't have enough turns in the path, add more turn instructions
  if (result.errorType === 'minTurns' && Math.random() < 0.7) {
    const executedSlotsList = Array.from(result.executedSlots);

    // Strategy: Find executed forward instructions and convert some to turns
    const executedForwards = executedSlotsList.filter(slotKey => {
      const { fn, idx } = parseSlotKey(slotKey);
      const instr = program[fn][idx];
      return instr?.type === 'forward';
    });

    if (executedForwards.length > 0 && Math.random() < 0.5) {
      // Convert a forward to a turn
      const targetSlot = getRandomElement(executedForwards);
      const { fn, idx } = parseSlotKey(targetSlot);
      const instr = newProgram[fn][idx];
      if (instr) {
        newProgram[fn][idx] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: instr.condition,
        };
        return newProgram;
      }
    }

    // Strategy: Find non-turn executed instructions and insert a turn before/after
    // by changing an adjacent unexecuted slot to a turn
    if (unexecutedSlots.length > 0 && Math.random() < 0.5) {
      // Find unexecuted slots that are adjacent to executed slots
      const adjacentUnexecuted = unexecutedSlots.filter(slotKey => {
        const { fn, idx } = parseSlotKey(slotKey);
        const prevKey = `${fn}-${idx - 1}`;
        const nextKey = `${fn}-${idx + 1}`;
        return result.executedSlots.has(prevKey) || result.executedSlots.has(nextKey);
      });

      if (adjacentUnexecuted.length > 0) {
        const targetSlot = getRandomElement(adjacentUnexecuted);
        const { fn, idx } = parseSlotKey(targetSlot);
        // Make it an unconditional turn so it will execute
        newProgram[fn][idx] = {
          type: Math.random() < 0.5 ? 'left' : 'right',
          condition: null, // Unconditional to ensure it executes
        };
        return newProgram;
      }
    }

    // Strategy: Find conditional turn instructions and make them unconditional
    for (const fn of FUNCTIONS) {
      for (let i = 0; i < config.slotsPerFunction[fn]; i++) {
        const instr = program[fn][i];
        if (instr && (instr.type === 'left' || instr.type === 'right') && instr.condition !== null) {
          if (Math.random() < 0.3) {
            newProgram[fn][i] = { ...instr, condition: null };
            return newProgram;
          }
        }
      }
    }

    // Strategy: Replace a random executed non-turn instruction with a turn
    if (executedSlotsList.length > 0) {
      const nonTurnExecuted = executedSlotsList.filter(slotKey => {
        const { fn, idx } = parseSlotKey(slotKey);
        const instr = program[fn][idx];
        return instr && instr.type !== 'left' && instr.type !== 'right';
      });

      if (nonTurnExecuted.length > 0) {
        const targetSlot = getRandomElement(nonTurnExecuted);
        const { fn, idx } = parseSlotKey(targetSlot);
        const instr = newProgram[fn][idx];
        if (instr) {
          newProgram[fn][idx] = {
            type: Math.random() < 0.5 ? 'left' : 'right',
            condition: instr.condition,
          };
          return newProgram;
        }
      }
    }
  }

  // Strategy 0 (25% chance): If a slot is blocked by an unconditional function call before it,
  // make that function call conditional so later slots can execute
  const unexecutedBlockedSlots = unexecutedSlots.filter(s => blockedByCall.has(s));
  if (unexecutedBlockedSlots.length > 0 && Math.random() < 0.25) {
    const slotKey = getRandomElement(unexecutedBlockedSlots);
    const { fn, idx } = parseSlotKey(slotKey);

    // Find the unconditional function call before this slot
    for (let i = idx - 1; i >= 0; i--) {
      const instr = newProgram[fn][i];
      if (instr && instr.condition === null && FUNCTIONS.includes(instr.type as FunctionName)) {
        // Make this call conditional
        newProgram[fn][i] = { ...instr, condition: mostCommonColor };
        return newProgram;
      }
    }
  }

  // Strategy 1 (35% chance): Make an unexecuted slot unconditional
  // This directly addresses "instruction was reached but condition didn't match"
  if (unexecutedSlots.length > 0 && Math.random() < 0.35) {
    const slotKey = getRandomElement(unexecutedSlots);
    const { fn, idx } = parseSlotKey(slotKey);
    const instr = newProgram[fn][idx];

    if (instr && instr.condition !== null) {
      // Make it unconditional
      newProgram[fn][idx] = { ...instr, condition: null };
      return newProgram;
    }
  }

  // Strategy 2 (25% chance): If a function was never called, make a call to it unconditional
  // This addresses "entire function was never executed"
  if (uncalledFunctions.length > 0 && Math.random() < 0.4) {
    const targetFn = getRandomElement(uncalledFunctions);

    // Find all call instructions to this function that are conditional
    const callSlots: { fn: FunctionName; idx: number }[] = [];
    for (const fn of FUNCTIONS) {
      for (let i = 0; i < program[fn].length; i++) {
        const instr = program[fn][i];
        if (instr?.type === targetFn && instr.condition !== null) {
          callSlots.push({ fn, idx: i });
        }
      }
    }

    if (callSlots.length > 0) {
      // Make one of these calls unconditional
      const slot = getRandomElement(callSlots);
      const instr = newProgram[slot.fn][slot.idx]!;
      newProgram[slot.fn][slot.idx] = { ...instr, condition: null };
      return newProgram;
    }

    // No conditional calls exist - add an unconditional call in an executed slot
    const executedSlotsList = Array.from(result.executedSlots);
    if (executedSlotsList.length > 0) {
      const slotKey = getRandomElement(executedSlotsList);
      const { fn, idx } = parseSlotKey(slotKey);
      newProgram[fn][idx] = { type: targetFn, condition: null };
      return newProgram;
    }
  }

  // Strategy 3 (20% chance): Change an unexecuted slot's condition to match most common color
  if (unexecutedSlots.length > 0 && Math.random() < 0.5) {
    const slotKey = getRandomElement(unexecutedSlots);
    const { fn, idx } = parseSlotKey(slotKey);
    const instr = newProgram[fn][idx];

    if (instr && instr.condition !== mostCommonColor) {
      newProgram[fn][idx] = { ...instr, condition: mostCommonColor };
      return newProgram;
    }
  }

  // Strategy 4: Fallback - random mutation on an unexecuted slot
  if (unexecutedSlots.length > 0) {
    const slotKey = getRandomElement(unexecutedSlots);
    const { fn, idx } = parseSlotKey(slotKey);

    // Use config for conditional chance
    const condition = getRandomCondition(config.conditionalPercent);
    newProgram[fn][idx] = {
      type: getWeightedRandomInstruction(config.instructionWeights, config.slotsPerFunction),
      condition,
    };
    return newProgram;
  }

  // Strategy 5: Pure random mutation (all slots executed but hit boundary)
  const slotKey = getRandomElement(allSlots);
  const { fn, idx } = parseSlotKey(slotKey);
  const condition = getRandomCondition(config.conditionalPercent);
  newProgram[fn][idx] = {
    type: getWeightedRandomInstruction(config.instructionWeights, config.slotsPerFunction),
    condition,
  };
  return newProgram;
}

export interface UseSimulationReturn {
  state: SimulationState;
  config: SimulationConfig;
  setConfig: (config: SimulationConfig) => void;
  start: () => void;
  stop: () => void;
  reset: () => void;
  totalSlots: number;
}

export function useSimulation(): UseSimulationReturn {
  const [state, setState] = useState<SimulationState>(createEmptySimulationState);
  const [config, setConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG);
  const runningRef = useRef(false);

  const totalSlots =
    config.slotsPerFunction.f1 +
    config.slotsPerFunction.f2 +
    config.slotsPerFunction.f3 +
    config.slotsPerFunction.f4 +
    config.slotsPerFunction.f5;

  const stop = useCallback(() => {
    runningRef.current = false;
    setState(prev => ({
      ...prev,
      status: prev.status === 'running' || prev.status === 'retrying' ? 'idle' : prev.status,
    }));
  }, []);

  const reset = useCallback(() => {
    runningRef.current = false;
    setState(createEmptySimulationState());
  }, []);

  const start = useCallback(() => {
    if (runningRef.current) return;
    runningRef.current = true;

    const triedConfigurations = new Set<string>();
    let currentProgram: Program | null = null;
    let lastResult: SimulationResult | null = null;
    let errorCounts: ErrorCounts = createEmptyErrorCounts();

    const runIteration = () => {
      if (!runningRef.current) return;

      // Auto-restart if we've hit the retry limit - start completely fresh
      if (triedConfigurations.size >= config.autoRestartAfter) {
        triedConfigurations.clear();
        currentProgram = null;
        lastResult = null;
        errorCounts = createEmptyErrorCounts();
      }

      let program: Program;
      let programKey: string;

      if (currentProgram && lastResult && !lastResult.success) {
        // Use smart mutation based on last result
        let attempts = 0;
        program = smartMutate(currentProgram, config, lastResult);
        programKey = serializeProgram(program);

        while (triedConfigurations.has(programKey) && attempts < MAX_MUTATION_ATTEMPTS) {
          program = smartMutate(currentProgram, config, lastResult);
          programKey = serializeProgram(program);
          attempts++;
        }

        if (attempts >= MAX_MUTATION_ATTEMPTS) {
          // Exhausted smart mutations, generate fresh program
          currentProgram = null;
          lastResult = null;
          setTimeout(runIteration, 0);
          return;
        }
      } else {
        // Generate fresh random program
        let attempts = 0;
        program = generateRandomProgram(config);
        programKey = serializeProgram(program);

        while (triedConfigurations.has(programKey) && attempts < MAX_MUTATION_ATTEMPTS) {
          program = generateRandomProgram(config);
          programKey = serializeProgram(program);
          attempts++;
        }

        if (attempts >= MAX_MUTATION_ATTEMPTS) {
          setState(prev => ({
            ...prev,
            status: 'exhausted',
            triedConfigurations,
            errorCounts,
          }));
          runningRef.current = false;
          return;
        }
      }

      triedConfigurations.add(programKey);

      // Run simulation
      const result = runSimulation(program, config);
      currentProgram = program;
      lastResult = result;

      if (result.success) {
        setState({
          status: 'success',
          program,
          grid: result.grid,
          originalGrid: result.originalGrid,
          robotPosition: result.finalPosition,
          robotDirection: result.finalDirection,
          robotStartDirection: result.startDirection,
          robotPath: result.robotPath,
          turnPositions: result.turnPositions,
          executedSlots: result.executedSlots,
          triedConfigurations,
          retryCount: triedConfigurations.size - 1,
          stepCount: result.stepCount,
          maxStackDepth: result.maxStackDepth,
          maxSelfCalls: result.maxSelfCalls,
          pathTraceInstructions: result.pathTraceInstructions,
          errorType: null,
          errorCounts,
        });
        runningRef.current = false;
        return;
      }

      // Increment error count for this error type
      if (result.errorType) {
        errorCounts[result.errorType]++;
      }

      // Update state to show current progress
      setState({
        status: 'retrying',
        program,
        grid: result.grid,
        originalGrid: result.originalGrid,
        robotPosition: result.finalPosition,
        robotDirection: result.finalDirection,
        robotStartDirection: result.startDirection,
        robotPath: result.robotPath,
        turnPositions: result.turnPositions,
        executedSlots: result.executedSlots,
        triedConfigurations,
        retryCount: triedConfigurations.size - 1,
        stepCount: result.stepCount,
        maxStackDepth: result.maxStackDepth,
        maxSelfCalls: result.maxSelfCalls,
        pathTraceInstructions: result.pathTraceInstructions,
        errorType: result.errorType,
        errorCounts,
      });

      // Continue the loop
      setTimeout(runIteration, 0);
    };

    setState(prev => ({
      ...prev,
      status: 'running',
    }));

    runIteration();
  }, [config]);

  return {
    state,
    config,
    setConfig,
    start,
    stop,
    reset,
    totalSlots,
  };
}
