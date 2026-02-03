import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import type {
  Direction,
  FunctionName,
  Instruction,
  InstructionType,
  Position,
  Program,
  PuzzleConfig,
  StackFrame,
  Tile,
  TileColor,
} from '../engine/types';

// Copy the simulation logic to test it directly
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
const COLORS: TileColor[] = ['red', 'green', 'blue'];
const FUNCTIONS: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

function getRandomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function createEmptyGrid(size: number): (Tile | null)[][] {
  const grid: (Tile | null)[][] = [];
  for (let y = 0; y < size; y++) {
    grid.push(new Array(size).fill(null));
  }
  return grid;
}

interface SimulationConfig {
  slotsPerFunction: Record<FunctionName, number>;
  maxSteps: number;
  gridSize: number;
  includePaint?: boolean; // Whether to include paint instructions
  maxAvgExecutionsPerSlot?: number; // Max average times each slot can execute
  minCoveragePercent?: number; // Minimum percentage of slots that must execute
}

interface SimulationResult {
  success: boolean;
  grid: (Tile | null)[][];
  originalGrid: (Tile | null)[][]; // Grid before any paint operations
  robotPath: Position[];
  turnPositions: Position[];
  finalPosition: Position;
  finalDirection: Direction;
  startDirection: Direction;
  program: Program;
  stepCount: number;
  errorReason?: string;
  hasPaintInstructions: boolean;
  paintOperationsCount: number;
}

function generateRandomProgram(config: SimulationConfig): Program {
  const program: Program = { f1: [], f2: [], f3: [], f4: [], f5: [] };
  const baseInstructionTypes: InstructionType[] = ['forward', 'left', 'right', 'f1', 'f2', 'f3', 'f4', 'f5'];
  const paintInstructionTypes: InstructionType[] = ['paint_red', 'paint_green', 'paint_blue'];

  const instructionTypes = config.includePaint
    ? [...baseInstructionTypes, ...paintInstructionTypes]
    : baseInstructionTypes;

  for (const fn of FUNCTIONS) {
    const slots = config.slotsPerFunction[fn];
    program[fn] = [];

    for (let i = 0; i < slots; i++) {
      // Filter out functions with 0 slots
      const availableTypes = instructionTypes.filter(t => {
        if (['f1', 'f2', 'f3', 'f4', 'f5'].includes(t)) {
          return config.slotsPerFunction[t as FunctionName] > 0;
        }
        return true;
      });

      const instruction: Instruction = {
        type: getRandomElement(availableTypes),
        condition: Math.random() < 0.7 ? getRandomElement(COLORS) : null,
      };
      program[fn].push(instruction);
    }
  }

  return program;
}

function cloneGrid(grid: (Tile | null)[][]): (Tile | null)[][] {
  return grid.map(row => row.map(tile => tile ? { ...tile } : null));
}

function runSimulation(program: Program, config: SimulationConfig): SimulationResult {
  const grid = createEmptyGrid(config.gridSize);
  const center = Math.floor(config.gridSize / 2);

  // Place starting tile
  const startColor = getRandomElement(COLORS);
  grid[center][center] = { color: startColor, hasStar: false };

  let robotPos: Position = { x: center, y: center };
  let robotDir: Direction = getRandomElement(DIRECTIONS);
  const startDir = robotDir;
  const startPos = { ...robotPos };

  const robotPath: Position[] = [{ ...robotPos }];
  const turnPositions: Position[] = [];

  // Track paint operations
  let hasPaintInstructions = false;
  let paintOperationsCount = 0;

  // Check if program has paint instructions
  for (const fn of FUNCTIONS) {
    for (const instr of program[fn]) {
      if (instr && (instr.type === 'paint_red' || instr.type === 'paint_green' || instr.type === 'paint_blue')) {
        hasPaintInstructions = true;
        break;
      }
    }
  }

  // Save original grid state before any paint operations
  // We'll update this after tiles are placed but before paints
  let originalGrid: (Tile | null)[][] | null = null;
  let firstPaintDone = false;

  const stack: StackFrame[] = [{ functionName: 'f1', instructionIndex: 0 }];
  const executedSlots = new Set<string>();
  let stepCount = 0;

  // Calculate total slots for coverage check
  let totalSlots = 0;
  for (const fn of FUNCTIONS) {
    totalSlots += config.slotsPerFunction[fn];
  }
  const minCoveragePercent = config.minCoveragePercent ?? 80;
  const maxAvgExec = config.maxAvgExecutionsPerSlot ?? 1;

  while (stepCount < config.maxSteps) {
    // Auto-loop F1 when stack empties (matches GameEngine behavior)
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

    // Check condition
    const currentTile = grid[robotPos.y]?.[robotPos.x];
    if (instruction.condition !== null) {
      if (!currentTile || currentTile.color !== instruction.condition) {
        continue;
      }
    }

    executedSlots.add(slotKey);
    stepCount++;

    // Check if we can terminate early (coverage met and avg executions within limit)
    const currentCoverage = totalSlots > 0 ? (executedSlots.size / totalSlots) * 100 : 100;
    const avgExecutions = executedSlots.size > 0 ? stepCount / executedSlots.size : 0;
    if (currentCoverage >= minCoveragePercent && avgExecutions >= maxAvgExec) {
      break;
    }

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[robotDir];
        const newPos = {
          x: robotPos.x + delta.x,
          y: robotPos.y + delta.y,
        };

        // Check boundary
        if (newPos.x < 0 || newPos.x >= config.gridSize || newPos.y < 0 || newPos.y >= config.gridSize) {
          return {
            success: false,
            grid,
            originalGrid: originalGrid || cloneGrid(grid),
            robotPath,
            turnPositions,
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
            program,
            stepCount,
            errorReason: 'boundary',
            hasPaintInstructions,
            paintOperationsCount,
          };
        }

        // Place tile if empty
        if (!grid[newPos.y][newPos.x]) {
          grid[newPos.y][newPos.x] = { color: getRandomElement(COLORS), hasStar: false };
        }

        robotPos = newPos;
        robotPath.push({ ...robotPos });

        // Check for loop
        if (stepCount > 1 && robotPos.x === startPos.x && robotPos.y === startPos.y && robotDir === startDir) {
          return {
            success: false,
            grid,
            originalGrid: originalGrid || cloneGrid(grid),
            robotPath,
            turnPositions,
            finalPosition: robotPos,
            finalDirection: robotDir,
            startDirection: startDir,
            program,
            stepCount,
            errorReason: 'loop',
            hasPaintInstructions,
            paintOperationsCount,
          };
        }
        break;
      }

      case 'left':
        turnPositions.push({ ...robotPos });
        robotDir = TURN_LEFT[robotDir];
        break;

      case 'right':
        turnPositions.push({ ...robotPos });
        robotDir = TURN_RIGHT[robotDir];
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        stack.push({ functionName: instruction.type, instructionIndex: 0 });
        break;

      case 'paint_red':
      case 'paint_green':
      case 'paint_blue': {
        // Save original grid before first paint
        if (!firstPaintDone) {
          originalGrid = cloneGrid(grid);
          firstPaintDone = true;
        }
        const tile = grid[robotPos.y]?.[robotPos.x];
        if (tile) {
          const newColor = instruction.type === 'paint_red' ? 'red' :
                          instruction.type === 'paint_green' ? 'green' : 'blue';
          tile.color = newColor;
          paintOperationsCount++;
        }
        break;
      }
    }
  }

  // If no paint was done, original grid is the current grid
  if (!originalGrid) {
    originalGrid = cloneGrid(grid);
  }

  // Check minimum requirements (relaxed for testing)
  let tileCount = 0;
  for (let y = 0; y < config.gridSize; y++) {
    for (let x = 0; x < config.gridSize; x++) {
      if (grid[y][x]) tileCount++;
    }
  }

  if (tileCount < 3) {
    return {
      success: false,
      grid,
      originalGrid,
      robotPath,
      turnPositions,
      finalPosition: robotPos,
      finalDirection: robotDir,
      startDirection: startDir,
      program,
      stepCount,
      errorReason: 'too few tiles',
      hasPaintInstructions,
      paintOperationsCount,
    };
  }

  return {
    success: true,
    grid,
    originalGrid,
    robotPath,
    turnPositions,
    finalPosition: robotPos,
    finalDirection: robotDir,
    startDirection: startDir,
    program,
    stepCount,
    hasPaintInstructions,
    paintOperationsCount,
  };
}

function createPuzzleConfig(simResult: SimulationResult, gridSize: number): PuzzleConfig {
  const center = Math.floor(gridSize / 2);

  // Clone ORIGINAL grid (before any paint operations) and add stars
  // This ensures conditional instructions work correctly during playback
  const gridWithStars = simResult.originalGrid.map(row =>
    row.map(tile => tile ? { ...tile, hasStar: false } : null)
  );

  // Place stars at turn positions and final position
  const starPositions = new Set<string>();
  for (const pos of simResult.turnPositions) {
    starPositions.add(`${pos.x},${pos.y}`);
  }
  starPositions.add(`${simResult.finalPosition.x},${simResult.finalPosition.y}`);

  for (const posKey of starPositions) {
    const [x, y] = posKey.split(',').map(Number);
    if (gridWithStars[y]?.[x]) {
      gridWithStars[y][x]!.hasStar = true;
    }
  }

  return {
    id: 'test-puzzle',
    title: 'Test',
    description: 'Test',
    grid: gridWithStars,
    robotStart: {
      position: { x: center, y: center },
      direction: simResult.startDirection,
    },
    functionLengths: { f1: 5, f2: 5, f3: 5, f4: 5, f5: 5 },
    allowedInstructions: ['forward', 'left', 'right', 'f1', 'f2', 'f3', 'f4', 'f5'],
    category: 'classic',
    difficulty: 'medium',
  };
}

function runPlayback(puzzle: PuzzleConfig, program: Program, maxSteps = 10000): {
  won: boolean;
  lost: boolean;
  steps: number;
  finalPosition: Position;
  pathTaken: Position[];
  failureReason?: string;
  lastInstruction?: string;
} {
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);
  engine.start();

  const pathTaken: Position[] = [{ ...engine.getState().robot.position }];
  let steps = 0;
  while (steps < maxSteps) {
    const state = engine.getState();
    if (state.status !== 'running' && state.status !== 'paused') {
      break;
    }

    const result = engine.step();
    steps++;
    pathTaken.push({ ...result.state.robot.position });

    if (result.finished) {
      return {
        won: result.won,
        lost: !result.won,
        steps,
        finalPosition: result.state.robot.position,
        pathTaken,
        failureReason: result.won ? undefined : 'fell off or max steps',
      };
    }
  }

  return {
    won: false,
    lost: true,
    steps,
    finalPosition: engine.getState().robot.position,
    pathTaken,
    failureReason: 'max steps reached',
  };
}

describe('Simulation Playback Debug', () => {
  it('should generate simulations and test playback, debugging failures', () => {
    const config: SimulationConfig = {
      slotsPerFunction: { f1: 5, f2: 5, f3: 5, f4: 5, f5: 5 },
      maxSteps: 1000,
      gridSize: 16,
      minCoveragePercent: 80,
      maxAvgExecutionsPerSlot: 1,
    };

    let successfulSimulations = 0;
    let playbackSuccesses = 0;
    let playbackFailures = 0;
    let simulationsHittingMaxSteps = 0;
    const failures: Array<{
      simResult: SimulationResult;
      playbackResult: ReturnType<typeof runPlayback>;
      divergencePoint?: number;
    }> = [];

    // Generate simulations (reduced count for faster testing)
    for (let i = 0; i < 50; i++) {
      const program = generateRandomProgram(config);
      const simResult = runSimulation(program, config);

      if (!simResult.success) continue;

      // Track if simulation hit maxSteps (didn't naturally terminate)
      if (simResult.stepCount >= config.maxSteps - 1) {
        simulationsHittingMaxSteps++;
      }

      successfulSimulations++;

      // Create puzzle and run playback
      const puzzle = createPuzzleConfig(simResult, config.gridSize);
      const playbackResult = runPlayback(puzzle, program);

      if (playbackResult.won) {
        playbackSuccesses++;
      } else {
        playbackFailures++;

        // Find where paths diverge
        let divergencePoint = -1;
        const simPath = simResult.robotPath;
        const playPath = playbackResult.pathTaken;

        for (let j = 0; j < Math.min(simPath.length, playPath.length); j++) {
          if (simPath[j].x !== playPath[j].x || simPath[j].y !== playPath[j].y) {
            divergencePoint = j;
            break;
          }
        }

        // If no divergence found but playback is longer
        if (divergencePoint === -1 && playPath.length > simPath.length) {
          divergencePoint = simPath.length;
        }

        failures.push({
          simResult,
          playbackResult,
          divergencePoint,
        });
      }
    }

    console.log('\n=== SIMULATION PLAYBACK DEBUG RESULTS ===');
    console.log(`Successful simulations: ${successfulSimulations}`);
    console.log(`Simulations hitting maxSteps: ${simulationsHittingMaxSteps}`);
    console.log(`Playback successes: ${playbackSuccesses}`);
    console.log(`Playback failures: ${playbackFailures}`);
    console.log(`Failure rate: ${successfulSimulations > 0 ? ((playbackFailures / successfulSimulations) * 100).toFixed(1) : 0}%`);

    // Analyze first few failures
    if (failures.length > 0) {
      console.log('\n=== FAILURE ANALYSIS ===');
      for (let i = 0; i < Math.min(3, failures.length); i++) {
        const f = failures[i];
        console.log(`\n--- Failure ${i + 1} ---`);
        console.log(`Simulation steps: ${f.simResult.stepCount}`);
        console.log(`Simulation path length: ${f.simResult.robotPath.length}`);
        console.log(`Playback steps: ${f.playbackResult.steps}`);
        console.log(`Playback path length: ${f.playbackResult.pathTaken.length}`);
        console.log(`Divergence point: ${f.divergencePoint}`);

        if (f.divergencePoint !== undefined && f.divergencePoint >= 0) {
          console.log(`Simulation position at divergence: ${JSON.stringify(f.simResult.robotPath[f.divergencePoint])}`);
          console.log(`Playback position at divergence: ${JSON.stringify(f.playbackResult.pathTaken[f.divergencePoint])}`);
        }

        // Check if playback went beyond simulation
        if (f.playbackResult.pathTaken.length > f.simResult.robotPath.length) {
          console.log(`\n*** PLAYBACK WENT BEYOND SIMULATION ***`);
          console.log(`Extra positions visited:`);
          for (let j = f.simResult.robotPath.length; j < Math.min(f.simResult.robotPath.length + 5, f.playbackResult.pathTaken.length); j++) {
            const pos = f.playbackResult.pathTaken[j];
            const tile = f.simResult.grid[pos.y]?.[pos.x];
            console.log(`  Position ${j}: (${pos.x}, ${pos.y}) - Tile: ${tile ? tile.color : 'NULL'}`);
          }

          // Find where it fell off
          const lastPos = f.playbackResult.finalPosition;
          const lastTile = f.simResult.grid[lastPos.y]?.[lastPos.x];
          console.log(`\nFinal position: (${lastPos.x}, ${lastPos.y}) - Tile: ${lastTile ? lastTile.color : 'NULL (FELL OFF HERE)'}`);
        }

        // Log star positions
        const starPositions: string[] = [];
        for (const pos of f.simResult.turnPositions) {
          starPositions.push(`(${pos.x},${pos.y})`);
        }
        starPositions.push(`(${f.simResult.finalPosition.x},${f.simResult.finalPosition.y})`);
        console.log(`Star positions: ${[...new Set(starPositions)].join(', ')}`);
      }
    }

    // The test should help us identify the issue
    // For now, just report the results
    expect(successfulSimulations).toBeGreaterThan(0);

    // Log summary for debugging
    if (playbackFailures > 0) {
      console.log('\n=== SUMMARY ===');
      console.log('Failures are occurring. Check the analysis above to identify patterns.');
    }
  });
});
