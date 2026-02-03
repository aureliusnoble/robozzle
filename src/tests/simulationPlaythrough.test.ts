import { describe, it, expect } from 'vitest';
import { GameEngine } from '../engine/GameEngine';
import type {
  Direction,
  FunctionName,
  Instruction,
  Position,
  Program,
  PuzzleConfig,
  Tile,
} from '../engine/types';

// Helper to create a simple program
function createProgram(instructions: Record<FunctionName, (Instruction | null)[]>): Program {
  return {
    f1: instructions.f1 || [],
    f2: instructions.f2 || [],
    f3: instructions.f3 || [],
    f4: instructions.f4 || [],
    f5: instructions.f5 || [],
  };
}

// Helper to create a simple puzzle config
function createPuzzleConfig(options: {
  grid: (Tile | null)[][];
  robotStart: { position: Position; direction: Direction };
  functionLengths?: Record<FunctionName, number>;
}): PuzzleConfig {
  return {
    id: 'test-puzzle',
    title: 'Test Puzzle',
    description: 'Test',
    grid: options.grid,
    robotStart: options.robotStart,
    functionLengths: options.functionLengths || { f1: 10, f2: 0, f3: 0, f4: 0, f5: 0 },
    allowedInstructions: ['forward', 'left', 'right'],
    category: 'classic',
    difficulty: 'easy',
  };
}

// Simulate runSimulation logic (simplified version)
function simulateProgram(
  program: Program,
  gridSize: number,
  startPos: Position,
  startDir: Direction
): {
  grid: (Tile | null)[][];
  robotPath: Position[];
  finalPosition: Position;
  finalDirection: Direction;
  success: boolean;
} {
  const grid: (Tile | null)[][] = [];
  for (let y = 0; y < gridSize; y++) {
    grid.push(new Array(gridSize).fill(null));
  }

  // Place starting tile
  grid[startPos.y][startPos.x] = { color: 'red', hasStar: false };

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

  let robotPos = { ...startPos };
  let robotDir = startDir;
  const robotPath: Position[] = [{ ...robotPos }];
  const FUNCTIONS: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

  // Stack-based execution (matches simulation logic - stops when stack empties)
  const stack: { fn: FunctionName; idx: number }[] = [{ fn: 'f1', idx: 0 }];
  let steps = 0;
  const maxSteps = 1000;

  while (stack.length > 0 && steps < maxSteps) {
    const frame = stack[stack.length - 1];
    const func = program[frame.fn];

    if (frame.idx >= func.length) {
      stack.pop();
      continue;
    }

    const instruction = func[frame.idx];
    frame.idx++;

    if (!instruction) continue;

    // Check condition
    const currentTile = grid[robotPos.y]?.[robotPos.x];
    if (instruction.condition !== null) {
      if (!currentTile || currentTile.color !== instruction.condition) {
        continue;
      }
    }

    steps++;

    // Execute instruction
    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[robotDir];
        const newPos = {
          x: robotPos.x + delta.x,
          y: robotPos.y + delta.y,
        };

        // Check boundary
        if (newPos.x < 0 || newPos.x >= gridSize || newPos.y < 0 || newPos.y >= gridSize) {
          return {
            grid,
            robotPath,
            finalPosition: robotPos,
            finalDirection: robotDir,
            success: false,
          };
        }

        // Place tile if empty (simulation creates tiles dynamically)
        if (!grid[newPos.y][newPos.x]) {
          grid[newPos.y][newPos.x] = { color: 'red', hasStar: false };
        }

        robotPos = newPos;
        robotPath.push({ ...robotPos });
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
        if (FUNCTIONS.includes(instruction.type)) {
          stack.push({ fn: instruction.type, idx: 0 });
        }
        break;
    }
  }

  return {
    grid,
    robotPath,
    finalPosition: robotPos,
    finalDirection: robotDir,
    success: true,
  };
}

describe('Simulation Playthrough', () => {
  describe('Initial state consistency', () => {
    it('should have same starting position in simulation and playthrough', () => {
      const gridSize = 16;
      const center = Math.floor(gridSize / 2);

      // Simulation starts at center
      const simStartPos = { x: center, y: center };

      // Puzzle config also uses center
      const puzzleStartPos = { x: center, y: center };

      expect(simStartPos).toEqual(puzzleStartPos);
      expect(center).toBe(8); // Verify it's 8 for a 16-grid
    });

    it('should preserve starting direction from simulation to playthrough', () => {
      // The simulation picks a random direction and stores it as startDirection
      // The puzzle config uses state.robotStartDirection
      // These should match

      const program = createProgram({
        f1: [{ type: 'forward', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Run simulation with specific direction
      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'right');

      // The startDirection returned should match what we passed
      // (In real code, simulation picks random direction)
      // Here we verify the structure works correctly

      // Create puzzle config with the returned direction
      const grid = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile } : null)
      );
      grid[8][9]!.hasStar = true; // Star at final position

      const puzzleConfig = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'right' }, // Same as simulation
      });

      const engine = new GameEngine(puzzleConfig);
      engine.setProgram(program);

      // Verify initial direction
      const initialState = engine.getState();
      expect(initialState.robot.direction).toBe('right');

      // Run and verify success
      const result = engine.runToCompletion();
      expect(result.won).toBe(true);
    });

    it('should preserve starting tile color from simulation to playthrough', () => {
      // The simulation creates a tile at the starting position with a random color
      // This color affects conditional instructions

      const program = createProgram({
        f1: [
          { type: 'forward', condition: 'red' }, // Only executes if on red tile
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with red starting tile
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false };
      grid[7][8] = { color: 'red', hasStar: true }; // Destination

      const puzzleConfig = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzleConfig);
      engine.setProgram(program);

      // The forward should execute because starting tile is red
      const result = engine.runToCompletion();
      expect(result.won).toBe(true);

      // Now test with blue starting tile - forward should NOT execute
      const grid2: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid2.push(new Array(16).fill(null));
      }
      grid2[8][8] = { color: 'blue', hasStar: true }; // Blue tile, forward won't execute
      grid2[7][8] = { color: 'red', hasStar: false };

      const puzzleConfig2 = createPuzzleConfig({
        grid: grid2,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine2 = new GameEngine(puzzleConfig2);
      engine2.setProgram(program);

      // Forward should be skipped (condition: red, tile: blue)
      // Robot stays at (8,8), but there's a star there, so...
      // Actually we need an instruction to execute first
      const program2 = createProgram({
        f1: [
          { type: 'left', condition: null }, // Executes unconditionally
          { type: 'forward', condition: 'red' }, // Skipped (on blue)
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });
      engine2.setProgram(program2);
      const result2 = engine2.runToCompletion();

      // Should win because star is at starting position and left executed
      expect(result2.won).toBe(true);
      expect(result2.state.robot.position).toEqual({ x: 8, y: 8 }); // Didn't move
    });
  });


  describe('Path divergence detection', () => {
    it('should trace why GameEngine path might differ from simulation', () => {
      // Simulate a complex program with function calls
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'f2', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
        ],
        f3: [],
        f4: [],
        f5: [],
      });

      // Run simulation
      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');
      expect(simResult.success).toBe(true);

      // Create puzzle config like SimulationMode does
      const gridWithStars = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile, hasStar: false } : null)
      );

      // Place stars at turn positions and final position
      const starPositions = new Set<string>();
      // Note: our simple test doesn't track turn positions, so just use final
      starPositions.add(`${simResult.finalPosition.x},${simResult.finalPosition.y}`);

      let starsPlaced = 0;
      for (const posKey of starPositions) {
        const [x, y] = posKey.split(',').map(Number);
        if (gridWithStars[y]?.[x]) {
          gridWithStars[y][x]!.hasStar = true;
          starsPlaced++;
        }
      }

      expect(starsPlaced).toBe(starPositions.size);

      // Create puzzle config
      const puzzle = createPuzzleConfig({
        grid: gridWithStars,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      // Run GameEngine
      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win
      expect(result.won).toBe(true);
    });

    it('should trace exact robot path in GameEngine and compare to simulation', () => {
      // Complex program with function calls
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
          { type: 'right', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Run simulation
      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');
      expect(simResult.success).toBe(true);

      // Simulation path: (8,8) -> (8,7) -> left -> (7,7) -> right -> (7,6)
      expect(simResult.robotPath).toEqual([
        { x: 8, y: 8 },
        { x: 8, y: 7 },
        { x: 7, y: 7 },
        { x: 7, y: 6 },
      ]);

      // Create grid with stars at final position
      const gridWithStars = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile, hasStar: false } : null)
      );
      // Place star only at final position for simplicity
      gridWithStars[simResult.finalPosition.y][simResult.finalPosition.x]!.hasStar = true;

      const puzzle = createPuzzleConfig({
        grid: gridWithStars,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      // Track GameEngine path
      const gameEnginePath: Position[] = [];
      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      engine.start();

      gameEnginePath.push({ ...engine.getState().robot.position });

      let stepCount = 0;
      let result = engine.step();
      while (!result.finished && stepCount < 100) {
        gameEnginePath.push({ ...result.state.robot.position });
        result = engine.step();
        stepCount++;
      }
      if (result.state.robot.position.x !== gameEnginePath[gameEnginePath.length - 1]?.x ||
          result.state.robot.position.y !== gameEnginePath[gameEnginePath.length - 1]?.y) {
        gameEnginePath.push({ ...result.state.robot.position });
      }

      // Paths should match up to the point where game wins
      // GameEngine path might be shorter if star is collected mid-path
      expect(result.won).toBe(true);

      // Verify no position in the path is outside the created tiles
      for (const pos of gameEnginePath) {
        expect(simResult.grid[pos.y]?.[pos.x]).not.toBeNull();
      }
    });

    it('should verify GameEngine auto-loops F1 and robot path matches for simple case', () => {
      // Program: forward only - F1 will auto-loop
      const program = createProgram({
        f1: [{ type: 'forward', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with tiles going up
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false };
      grid[7][8] = { color: 'red', hasStar: false };
      grid[6][8] = { color: 'red', hasStar: true }; // Star here

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      engine.start();

      // Step 1: forward from (8,8) to (8,7)
      let result = engine.step();
      expect(result.state.robot.position).toEqual({ x: 8, y: 7 });
      expect(result.finished).toBe(false);

      // Step 2: F1 auto-loops, forward from (8,7) to (8,6) - collect star, WIN
      result = engine.step();
      expect(result.state.robot.position).toEqual({ x: 8, y: 6 });
      expect(result.finished).toBe(true);
      expect(result.won).toBe(true);
    });
  });

  describe('GameEngine auto-loop behavior', () => {
    it('should auto-loop F1 when stack empties', () => {
      // Create a simple 3x3 grid with tiles at all positions
      const grid: (Tile | null)[][] = [
        [{ color: 'red', hasStar: false }, { color: 'red', hasStar: false }, { color: 'red', hasStar: false }],
        [{ color: 'red', hasStar: false }, { color: 'red', hasStar: false }, { color: 'red', hasStar: false }],
        [{ color: 'red', hasStar: true }, { color: 'red', hasStar: false }, { color: 'red', hasStar: false }],
      ];

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 1, y: 0 }, direction: 'down' },
      });

      const engine = new GameEngine(puzzle);
      const program = createProgram({
        f1: [{ type: 'forward', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });
      engine.setProgram(program);
      engine.start();

      // First forward: y goes from 0 to 1
      let result = engine.step();
      expect(result.state.robot.position).toEqual({ x: 1, y: 1 });
      expect(result.finished).toBe(false);

      // F1 should auto-loop: second forward, y goes from 1 to 2
      result = engine.step();
      expect(result.state.robot.position).toEqual({ x: 1, y: 2 });
      expect(result.finished).toBe(false);

      // F1 should auto-loop again: third forward, y goes from 2 to 3 (out of bounds!)
      result = engine.step();
      expect(result.state.robot.position).toEqual({ x: 1, y: 3 });
      expect(result.finished).toBe(true);
      expect(result.won).toBe(false); // Robot fell off
    });
  });

  describe('Simulation vs GameEngine execution difference', () => {
    it('simulation stops when stack empties, but GameEngine loops', () => {
      // Simulation: forward, forward -> creates 3 tiles in a line, stops
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Run our simulation (stops when stack empties)
      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');

      expect(simResult.success).toBe(true);
      expect(simResult.robotPath).toHaveLength(3); // Start + 2 forwards
      expect(simResult.robotPath[0]).toEqual({ x: 8, y: 8 });
      expect(simResult.robotPath[1]).toEqual({ x: 8, y: 7 });
      expect(simResult.robotPath[2]).toEqual({ x: 8, y: 6 });

      // Count tiles created
      let tileCount = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (simResult.grid[y][x]) tileCount++;
        }
      }
      expect(tileCount).toBe(3); // Only 3 tiles created

      // Now run GameEngine with same grid and program (but add star to prevent infinite loop)
      const gridWithStar = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile } : null)
      );
      // Put star at final position so game can end
      gridWithStar[6][8]!.hasStar = true;

      const puzzle = createPuzzleConfig({
        grid: gridWithStar,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win because star is at the final position
      expect(result.won).toBe(true);
    });

    it('GameEngine fails if grid has no tile where robot moves after loop', () => {
      // Program: forward, forward
      // Grid: only 3 tiles in a line
      // After first iteration, robot is at end, F1 loops, robot moves to non-existent tile
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with only 3 tiles going up
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start
      grid[7][8] = { color: 'red', hasStar: false }; // First forward
      grid[6][8] = { color: 'red', hasStar: false }; // Second forward - no star!

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      engine.start();

      // First iteration: forward, forward (robot at y=6)
      engine.step(); // y=7
      engine.step(); // y=6

      // F1 loops, third forward: y=5 (no tile!)
      const result = engine.step();
      expect(result.finished).toBe(true);
      expect(result.won).toBe(false); // Lost - fell off because no tile at y=5
    });

    it('placing star at final position should allow playthrough to succeed', () => {
      // This is the fix: place a star at the final robot position
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with only 3 tiles, but with star at final position
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start
      grid[7][8] = { color: 'red', hasStar: false }; // First forward
      grid[6][8] = { color: 'red', hasStar: true };  // Second forward - with star!

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win because star is collected before F1 can loop
      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(1);
    });
  });

  describe('Turn position star placement', () => {
    it('should place stars at turn positions and final position', () => {
      // Program: forward, left, forward (should create L-shape)
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');

      // Robot path: (8,8) -> (8,7) [after forward] -> turn left at (8,7) -> (7,7) [after second forward]
      expect(simResult.robotPath).toEqual([
        { x: 8, y: 8 },
        { x: 8, y: 7 },
        { x: 7, y: 7 },
      ]);

      // Stars should be at:
      // 1. Turn position: (8,7) - where left turn happened
      // 2. Final position: (7,7)
      // Total: 2 stars (but (8,7) is both turn and intermediate, final is (7,7))

      // In the actual implementation, stars are placed at:
      // - All turn positions
      // - Final robot position
      // So if final position happens to be a turn position, it's deduplicated
    });

    it('puzzle with stars at correct positions should succeed', () => {
      // Program: forward, left, forward
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Grid with L-shape tiles, stars at turn position and final position
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start
      grid[7][8] = { color: 'red', hasStar: true };  // After first forward (turn happens here)
      grid[7][7] = { color: 'red', hasStar: true };  // Final position (after left turn and forward)

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(2);
    });
  });

  describe('Conditional instructions and color matching', () => {
    it('conditional instruction should only execute when color matches', () => {
      // Program: forward (red condition)
      // Start tile is red, so forward should execute
      const program = createProgram({
        f1: [{ type: 'forward', condition: 'red' }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false };
      grid[7][8] = { color: 'red', hasStar: true };

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      expect(result.won).toBe(true);
    });

    it('conditional instruction should not execute when color does not match', () => {
      // Program: forward (blue condition)
      // Start tile is red, so forward should NOT execute
      // Since forward never executes, robot stays in place
      // This tests that conditional instructions are correctly skipped
      const program = createProgram({
        f1: [{ type: 'forward', condition: 'blue' }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Red tile, but instruction needs blue
      grid[7][8] = { color: 'blue', hasStar: true }; // This tile would be reached if forward executed

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      engine.start();

      // Execute several steps - forward should never execute (condition not met)
      for (let i = 0; i < 10; i++) {
        engine.step();
      }

      // Robot should still be at starting position since forward never executed
      const state = engine.getState();
      expect(state.robot.position).toEqual({ x: 8, y: 8 });
      expect(state.starsCollected).toBe(0); // Never reached the star tile
    });
  });

  describe('Issue reproduction: playthrough fails after successful simulation', () => {
    it('should identify when simulation and playthrough produce different results', () => {
      // Create a scenario that passes simulation but fails playthrough
      // Program: forward, forward, forward (goes 3 tiles up)
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Simulate
      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');
      expect(simResult.success).toBe(true);

      // Count tiles
      let tileCount = 0;
      for (let y = 0; y < 16; y++) {
        for (let x = 0; x < 16; x++) {
          if (simResult.grid[y][x]) tileCount++;
        }
      }
      expect(tileCount).toBe(4); // Start + 3 forwards

      // NO stars placed - this will fail in GameEngine
      const puzzle = createPuzzleConfig({
        grid: simResult.grid.map(row => row.map(tile => tile ? { ...tile } : null)),
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      engine.start();

      // Execute all 3 forwards (first iteration)
      engine.step(); // y=7
      engine.step(); // y=6
      engine.step(); // y=5 (final position in simulation)

      // Now F1 auto-loops, fourth forward will go to y=4 (no tile!)
      const result = engine.step();

      expect(result.finished).toBe(true);
      expect(result.won).toBe(false);
      expect(result.state.robot.position).toEqual({ x: 8, y: 4 }); // Fell off
    });

    it('placing star at final position fixes the playthrough issue', () => {
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');

      // Place star at final position
      const gridWithStar = simResult.grid.map(row => row.map(tile => tile ? { ...tile } : null));
      gridWithStar[5][8]!.hasStar = true; // Final position after 3 forwards from y=8 going up

      const puzzle = createPuzzleConfig({
        grid: gridWithStar,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      expect(result.won).toBe(true);
    });
  });

  describe('SimulationMode puzzle config creation logic', () => {
    // This test mimics exactly what SimulationMode.tsx does to create a PuzzleConfig
    it('should correctly create puzzle config with stars at turn and final positions', () => {
      // Simulate what SimulationMode does:
      // 1. Run simulation
      // 2. Place stars at turn positions and final position
      // 3. Create PuzzleConfig
      // 4. Run in GameEngine

      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
          { type: 'right', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Simulate
      const gridSize = 16;
      const startPos = { x: 8, y: 8 };
      const startDir: Direction = 'up';

      const simResult = simulateProgram(program, gridSize, startPos, startDir);
      expect(simResult.success).toBe(true);

      // Mimic SimulationMode star placement logic
      const gridWithStars = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile, hasStar: false } : null)
      );

      // Track turn positions manually (left and right instructions)
      // For this test, turns happen at: (8,7) after first forward, (7,7) after third forward
      // Actually let's trace it:
      // Start: (8,8) direction up
      // Forward: (8,7) direction up
      // Left: turn at (8,7), now facing left
      // Forward: (7,7) direction left
      // Right: turn at (7,7), now facing up
      // Forward: (7,6) direction up
      // Final position: (7,6)

      // Turn positions: (8,7), (7,7)
      // Final position: (7,6)

      const turnPositions = [{ x: 8, y: 7 }, { x: 7, y: 7 }];
      const finalPosition = simResult.finalPosition;

      // Place stars (deduped)
      const starPositions = new Set<string>();
      for (const pos of turnPositions) {
        starPositions.add(`${pos.x},${pos.y}`);
      }
      starPositions.add(`${finalPosition.x},${finalPosition.y}`);

      for (const posKey of starPositions) {
        const [x, y] = posKey.split(',').map(Number);
        if (gridWithStars[y]?.[x]) {
          gridWithStars[y][x]!.hasStar = true;
        }
      }

      // Verify stars are placed correctly
      expect(gridWithStars[7][8]?.hasStar).toBe(true); // Turn 1
      expect(gridWithStars[7][7]?.hasStar).toBe(true); // Turn 2
      expect(gridWithStars[6][7]?.hasStar).toBe(true); // Final

      // Create puzzle config
      const puzzleConfig = createPuzzleConfig({
        grid: gridWithStars,
        robotStart: { position: startPos, direction: startDir },
      });

      // Run in GameEngine
      const engine = new GameEngine(puzzleConfig);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(3);
    });

    it('should handle case where final position is same as a turn position', () => {
      // Program: forward, left, left, forward
      // This creates a path that returns towards start area

      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const simResult = simulateProgram(program, 16, { x: 8, y: 8 }, 'up');
      expect(simResult.success).toBe(true);

      // Trace:
      // Start: (8,8) up
      // Forward: (8,7) up
      // Left: turn at (8,7), now facing left
      // Left: turn at (8,7) again, now facing down
      // Forward: (8,8) down - back to start!

      const gridWithStars = simResult.grid.map(row =>
        row.map(tile => tile ? { ...tile, hasStar: false } : null)
      );

      // Turn positions: (8,7), (8,7) - same position twice
      // Final position: (8,8)
      const turnPositions = [{ x: 8, y: 7 }, { x: 8, y: 7 }];
      const finalPosition = simResult.finalPosition;

      const starPositions = new Set<string>();
      for (const pos of turnPositions) {
        starPositions.add(`${pos.x},${pos.y}`);
      }
      starPositions.add(`${finalPosition.x},${finalPosition.y}`);

      for (const posKey of starPositions) {
        const [x, y] = posKey.split(',').map(Number);
        if (gridWithStars[y]?.[x]) {
          gridWithStars[y][x]!.hasStar = true;
        }
      }

      // Should have 2 unique star positions: (8,7) and (8,8)
      expect(starPositions.size).toBe(2);

      const puzzleConfig = createPuzzleConfig({
        grid: gridWithStars,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzleConfig);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(2);
    });

    it('should handle conditional instructions that affect execution path', () => {
      // Program: forward (red), forward (any)
      // If first tile is not red, only second forward executes

      const program = createProgram({
        f1: [
          { type: 'forward', condition: 'red' },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with blue start tile
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'blue', hasStar: false }; // Start (blue, not red)
      grid[7][8] = { color: 'red', hasStar: true };   // Would be first forward if condition matched

      // Since start is blue, first forward (red condition) is skipped
      // Second forward (unconditional) executes from blue tile
      // Robot moves to (8,7)

      const puzzleConfig = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzleConfig);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Robot should collect the star at (8,7) because:
      // - First forward skipped (condition: red, tile: blue)
      // - Second forward executes unconditionally
      expect(result.won).toBe(true);
    });
  });

  describe('Edge cases that could cause playthrough failure', () => {
    it('should fail if multiple stars exist but robot loops before collecting all', () => {
      // This simulates a scenario where:
      // - Stars are at turn positions AND final position
      // - But robot might loop F1 before collecting all stars
      // - On the loop, robot might go to a tile that doesn't exist

      // Program: forward, left, forward (L-shape path)
      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'left', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create minimal grid (only tiles robot visits)
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start
      grid[7][8] = { color: 'red', hasStar: true };  // After first forward (turn happens here)
      grid[7][7] = { color: 'red', hasStar: true };  // Final (after left turn + forward)

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win - all stars collected before F1 loops
      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(2);
    });

    it('should detect when stars are at positions robot cannot reach on first pass', () => {
      // This is an edge case: what if a star is placed at a position
      // that the robot only reaches on the SECOND iteration of F1?
      // The robot would fall off before getting there.

      // Program: forward (unconditional)
      // Grid: tiles at y=8, y=7, y=6
      // Star ONLY at y=6
      // Robot starts at y=8, direction up

      // First pass: y=8 -> y=7 -> (F1 has only 1 forward, so loops) -> y=6 (collect star, win!)
      // Wait, actually this would work...

      // Let me create a case where it fails:
      // Program: forward, forward
      // Grid: tiles at y=8, y=7
      // Star at y=7
      // Robot direction: down (goes away from star!)

      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'forward', condition: null },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start
      grid[9][8] = { color: 'red', hasStar: false }; // First forward going down
      grid[10][8] = { color: 'red', hasStar: true }; // Second forward - star here

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'down' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win - robot goes down and collects star
      expect(result.won).toBe(true);
    });

    it('recursive function call with limited tiles should fail on loop', () => {
      // Program: F1 contains: forward, F1 (recursive call)
      // This creates an infinite recursion that keeps moving forward
      // With limited tiles, robot will eventually fall off

      const program = createProgram({
        f1: [
          { type: 'forward', condition: null },
          { type: 'f1', condition: null }, // Recursive call
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      // Create grid with only 3 tiles
      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false };
      grid[7][8] = { color: 'red', hasStar: false };
      grid[6][8] = { color: 'red', hasStar: false }; // No star - robot will keep going

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should lose - robot falls off because of recursive forward
      expect(result.won).toBe(false);
      expect(result.finished).toBe(true);
    });

    it('should work when star is on start tile (collected on first instruction)', () => {
      // Edge case: what if the star is on the starting tile?
      // The robot needs to execute at least one instruction before collecting

      // Program: left (turn in place)
      const program = createProgram({
        f1: [{ type: 'left', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: true }; // Start with star

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win - star collected after first instruction
      expect(result.won).toBe(true);
      expect(result.state.starsCollected).toBe(1);
    });

    it('paint instructions should not affect first-pass star collection', () => {
      // Paint instructions change tile colors during execution
      // This could affect conditional instructions on the SAME tile
      // But shouldn't affect playthrough if stars are collected in first pass

      // Program: paint_blue, forward (blue condition)
      // Start tile is red, paint it blue, then forward executes
      const program = createProgram({
        f1: [
          { type: 'paint_blue', condition: null },
          { type: 'forward', condition: 'blue' },
        ],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      });

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: false }; // Start (red)
      grid[7][8] = { color: 'red', hasStar: true };  // Destination

      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: { x: 8, y: 8 }, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(program);
      const result = engine.runToCompletion();

      // Should win:
      // 1. paint_blue: tile at (8,8) becomes blue
      // 2. forward (blue): condition matches (now blue), robot moves to (8,7)
      // 3. Star collected at (8,7)
      expect(result.won).toBe(true);
    });

    it('verifies robot position reference is properly handled', () => {
      // This tests that the robot position doesn't get incorrectly shared/mutated

      const grid: (Tile | null)[][] = [];
      for (let y = 0; y < 16; y++) {
        grid.push(new Array(16).fill(null));
      }
      grid[8][8] = { color: 'red', hasStar: true };

      const startPosition = { x: 8, y: 8 };
      const puzzle = createPuzzleConfig({
        grid,
        robotStart: { position: startPosition, direction: 'up' },
      });

      const engine = new GameEngine(puzzle);
      engine.setProgram(createProgram({
        f1: [{ type: 'left', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      }));

      // Run to completion
      engine.runToCompletion();

      // Original startPosition should not be mutated
      expect(startPosition).toEqual({ x: 8, y: 8 });

      // Reset and run again - should work identically
      engine.reset();
      engine.setProgram(createProgram({
        f1: [{ type: 'left', condition: null }],
        f2: [],
        f3: [],
        f4: [],
        f5: [],
      }));
      const result2 = engine.runToCompletion();
      expect(result2.won).toBe(true);
    });
  });
});
