// Bounded program verifier with cycle detection
// Replaces the unbounded execution from solver.ts

import type {
  Direction,
  FunctionName,
  Program,
  PuzzleConfig,
  Tile,
  Position,
} from '../../src/engine/types';

// Execution result status
export type ExecutionStatus = 'solved' | 'fell' | 'timeout' | 'cycle';

// Result of running a program
export interface ExecutionResult {
  status: ExecutionStatus;
  starsCollected: number;
  totalStars: number;
  tilesVisited: number;
  steps: number;
  solved: boolean;
}

// Direction deltas
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

// Direction to index for state hashing
const DIR_INDEX: Record<Direction, number> = {
  up: 0,
  right: 1,
  down: 2,
  left: 3,
};

// Create a compact state hash for cycle detection
// State includes: position, direction, remaining stars (as bitmask), stack state
function createStateHash(
  x: number,
  y: number,
  dir: Direction,
  starsRemaining: Uint8Array,
  stackTop: string
): string {
  // Compact representation: "x,y,d,stars,stack"
  // Stars as hex string for compactness
  let starsHex = '';
  for (let i = 0; i < starsRemaining.length; i++) {
    starsHex += starsRemaining[i].toString(16).padStart(2, '0');
  }
  return `${x},${y},${DIR_INDEX[dir]},${starsHex},${stackTop}`;
}

// Run a program with cycle detection and bounded steps
export function runProgram(
  puzzle: PuzzleConfig,
  program: Program,
  maxSteps: number = 500
): ExecutionResult {
  // Clone grid for star tracking
  const grid: (Tile | null)[][] = puzzle.grid.map(row =>
    row.map(tile => (tile ? { ...tile } : null))
  );

  // Count and index stars for bitmask tracking
  const starPositions: Array<{ x: number; y: number }> = [];
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.hasStar) {
        starPositions.push({ x, y });
      }
    }
  }
  const totalStars = starPositions.length;

  // Stars remaining as byte array (each byte = 8 stars)
  const starsRemaining = new Uint8Array(Math.ceil(totalStars / 8));
  // Initialize all stars as present
  for (let i = 0; i < totalStars; i++) {
    starsRemaining[Math.floor(i / 8)] |= 1 << (i % 8);
  }

  // Map star positions to indices
  const starIndex = new Map<string, number>();
  for (let i = 0; i < starPositions.length; i++) {
    const { x, y } = starPositions[i];
    starIndex.set(`${x},${y}`, i);
  }

  // Robot state
  let pos = { ...puzzle.robotStart.position };
  let dir = puzzle.robotStart.direction;
  let starsCollected = 0;

  // Track visited tiles
  const visitedTiles = new Set<string>();
  visitedTiles.add(`${pos.x},${pos.y}`);

  // Cycle detection: track seen states
  const seenStates = new Set<string>();

  // Execution stack: array of [functionName, index]
  // Using array as stack with push/pop is O(1) at the end
  const stack: Array<[FunctionName, number]> = [['f1', 0]];
  let steps = 0;

  while (stack.length > 0 && steps < maxSteps) {
    // Get current instruction without removing from stack
    const [funcName, idx] = stack[stack.length - 1];
    const func = program[funcName];

    // If past end of function, pop and continue
    if (idx >= func.length) {
      stack.pop();

      // F1 auto-loop: if stack empty, restart F1
      if (funcName === 'f1' && stack.length === 0) {
        stack.push(['f1', 0]);
      }
      continue;
    }

    // Advance index in current function
    stack[stack.length - 1] = [funcName, idx + 1];

    const instruction = func[idx];
    if (!instruction) continue; // Skip null slots

    // Check color condition
    const tile = grid[pos.y]?.[pos.x];
    if (instruction.condition !== null) {
      if (!tile || tile.color !== instruction.condition) {
        continue; // Condition not met, skip instruction
      }
    }

    // Cycle detection before executing
    // Create stack signature (top 3 elements for efficiency)
    const stackSig =
      stack.length <= 3
        ? stack.map(([f, i]) => `${f}:${i}`).join('|')
        : stack
            .slice(-3)
            .map(([f, i]) => `${f}:${i}`)
            .join('|');
    const stateHash = createStateHash(pos.x, pos.y, dir, starsRemaining, stackSig);

    if (seenStates.has(stateHash)) {
      // Cycle detected - we're in an infinite loop with no progress
      return {
        status: 'cycle',
        starsCollected,
        totalStars,
        tilesVisited: visitedTiles.size,
        steps,
        solved: false,
      };
    }
    seenStates.add(stateHash);

    // Execute instruction
    steps++;

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[dir];
        const newX = pos.x + delta.x;
        const newY = pos.y + delta.y;
        const newTile = grid[newY]?.[newX];

        if (!newTile) {
          // Fell off the grid
          return {
            status: 'fell',
            starsCollected,
            totalStars,
            tilesVisited: visitedTiles.size,
            steps,
            solved: false,
          };
        }

        pos = { x: newX, y: newY };
        visitedTiles.add(`${pos.x},${pos.y}`);

        // Collect star if present
        if (newTile.hasStar) {
          newTile.hasStar = false;
          starsCollected++;

          // Update stars remaining bitmask
          const sIdx = starIndex.get(`${newX},${newY}`);
          if (sIdx !== undefined) {
            starsRemaining[Math.floor(sIdx / 8)] &= ~(1 << (sIdx % 8));
          }

          // Check if solved
          if (starsCollected === totalStars) {
            return {
              status: 'solved',
              starsCollected,
              totalStars,
              tilesVisited: visitedTiles.size,
              steps,
              solved: true,
            };
          }
        }
        break;
      }

      case 'left':
        dir = TURN_LEFT[dir];
        break;

      case 'right':
        dir = TURN_RIGHT[dir];
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        // Push function call to stack
        stack.push([instruction.type, 0]);
        break;

      case 'paint_red':
        if (tile) tile.color = 'red';
        break;

      case 'paint_green':
        if (tile) tile.color = 'green';
        break;

      case 'paint_blue':
        if (tile) tile.color = 'blue';
        break;

      case 'noop':
        break;
    }
  }

  // Ran out of steps
  return {
    status: 'timeout',
    starsCollected,
    totalStars,
    tilesVisited: visitedTiles.size,
    steps,
    solved: false,
  };
}

// Simple verification: does the program solve the puzzle?
export function verifySolution(puzzle: PuzzleConfig, program: Program): boolean {
  return runProgram(puzzle, program).solved;
}

// Run program and collect execution metrics (for complexity checking)
export interface ExecutionMetrics {
  steps: number;
  instructions: number;
  stackDepth: number;
  conditionals: number;
  functionsUsed: number;
  tilesVisited: number;
  starsCollected: number;
  totalStars: number;
  solved: boolean;
}

// Count non-null instructions in program
function countInstructions(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst !== null) count++;
    }
  }
  return count;
}

// Measure execution with detailed metrics
export function measureExecution(
  puzzle: PuzzleConfig,
  program: Program,
  maxSteps: number = 500
): ExecutionMetrics {
  // Clone grid
  const grid: (Tile | null)[][] = puzzle.grid.map(row =>
    row.map(tile => (tile ? { ...tile } : null))
  );

  // Count stars
  let totalStars = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.hasStar) totalStars++;
    }
  }

  // Robot state
  let pos = { ...puzzle.robotStart.position };
  let dir = puzzle.robotStart.direction;
  let starsCollected = 0;
  const visited = new Set<string>();
  visited.add(`${pos.x},${pos.y}`);

  // Track functions used
  const functionsUsed = new Set<FunctionName>();

  // Track stack depth and conditionals
  let maxStackDepth = 0;
  let conditionalExecutions = 0;

  // Execution stack
  const stack: Array<[FunctionName, number]> = [['f1', 0]];
  let steps = 0;

  while (stack.length > 0 && steps < maxSteps) {
    // Track stack depth
    maxStackDepth = Math.max(maxStackDepth, stack.length);

    const [funcName, idx] = stack[stack.length - 1];
    functionsUsed.add(funcName);
    const func = program[funcName];

    if (idx >= func.length) {
      stack.pop();
      if (funcName === 'f1' && stack.length === 0) {
        stack.push(['f1', 0]);
      }
      continue;
    }

    stack[stack.length - 1] = [funcName, idx + 1];
    const instruction = func[idx];
    if (!instruction) continue;

    // Check color condition
    const tile = grid[pos.y]?.[pos.x];
    if (instruction.condition !== null) {
      conditionalExecutions++;
      if (!tile || tile.color !== instruction.condition) {
        continue;
      }
    }

    steps++;

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[dir];
        const newX = pos.x + delta.x;
        const newY = pos.y + delta.y;
        const newTile = grid[newY]?.[newX];

        if (!newTile) {
          return {
            steps,
            instructions: countInstructions(program),
            stackDepth: maxStackDepth,
            conditionals: conditionalExecutions,
            functionsUsed: functionsUsed.size,
            tilesVisited: visited.size,
            starsCollected,
            totalStars,
            solved: false,
          };
        }

        pos = { x: newX, y: newY };
        visited.add(`${pos.x},${pos.y}`);

        if (newTile.hasStar) {
          newTile.hasStar = false;
          starsCollected++;
          if (starsCollected === totalStars) {
            return {
              steps,
              instructions: countInstructions(program),
              stackDepth: maxStackDepth,
              conditionals: conditionalExecutions,
              functionsUsed: functionsUsed.size,
              tilesVisited: visited.size,
              starsCollected,
              totalStars,
              solved: true,
            };
          }
        }
        break;
      }

      case 'left':
        dir = TURN_LEFT[dir];
        break;

      case 'right':
        dir = TURN_RIGHT[dir];
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        stack.push([instruction.type, 0]);
        break;

      case 'paint_red':
        if (tile) tile.color = 'red';
        break;

      case 'paint_green':
        if (tile) tile.color = 'green';
        break;

      case 'paint_blue':
        if (tile) tile.color = 'blue';
        break;

      case 'noop':
        break;
    }
  }

  return {
    steps,
    instructions: countInstructions(program),
    stackDepth: maxStackDepth,
    conditionals: conditionalExecutions,
    functionsUsed: functionsUsed.size,
    tilesVisited: visited.size,
    starsCollected,
    totalStars,
    solved: false,
  };
}
