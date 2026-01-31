import type {
  Direction,
  ExecutionResult,
  FunctionName,
  GameState,
  Instruction,
  InstructionType,
  Position,
  Program,
  PuzzleConfig,
  StackFrame,
  Tile,
  TileColor,
} from './types';

const MAX_STEPS = 10000;

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

export class GameEngine {
  private puzzle: PuzzleConfig;
  private state: GameState;
  private program: Program;
  private stack: StackFrame[];
  private initialGrid: (Tile | null)[][];

  constructor(puzzle: PuzzleConfig) {
    this.puzzle = puzzle;
    this.initialGrid = this.deepCloneGrid(puzzle.grid);
    this.program = this.createEmptyProgram();
    this.stack = [];
    this.state = this.createInitialState();
  }

  private deepCloneGrid(grid: (Tile | null)[][]): (Tile | null)[][] {
    return grid.map(row =>
      row.map(tile => (tile ? { ...tile } : null))
    );
  }

  private createEmptyProgram(): Program {
    return {
      f1: new Array(this.puzzle.functionLengths.f1).fill(null),
      f2: new Array(this.puzzle.functionLengths.f2).fill(null),
      f3: new Array(this.puzzle.functionLengths.f3).fill(null),
      f4: new Array(this.puzzle.functionLengths.f4).fill(null),
      f5: new Array(this.puzzle.functionLengths.f5).fill(null),
    };
  }

  private createInitialState(): GameState {
    const grid = this.deepCloneGrid(this.initialGrid);
    let totalStars = 0;

    for (const row of grid) {
      for (const tile of row) {
        if (tile?.hasStar) {
          totalStars++;
        }
      }
    }

    return {
      robot: { ...this.puzzle.robotStart },
      grid,
      starsCollected: 0,
      totalStars,
      steps: 0,
      status: 'idle',
    };
  }

  public reset(): void {
    this.state = this.createInitialState();
    this.stack = [];
  }

  public setProgram(program: Program): void {
    this.program = program;
  }

  public getProgram(): Program {
    return this.program;
  }

  public setInstruction(
    functionName: FunctionName,
    index: number,
    instruction: Instruction | null
  ): void {
    if (index >= 0 && index < this.program[functionName].length) {
      this.program[functionName][index] = instruction;
    }
  }

  public getState(): GameState {
    return { ...this.state };
  }

  public getPuzzle(): PuzzleConfig {
    return this.puzzle;
  }

  public start(): void {
    if (this.state.status !== 'idle') {
      this.reset();
    }
    this.state.status = 'running';
    this.stack = [{ functionName: 'f1', instructionIndex: 0 }];
  }

  public pause(): void {
    if (this.state.status === 'running') {
      this.state.status = 'paused';
    }
  }

  public resume(): void {
    if (this.state.status === 'paused') {
      this.state.status = 'running';
    }
  }

  public step(): ExecutionResult {
    if (this.state.status !== 'running' && this.state.status !== 'paused') {
      return { state: this.getState(), finished: true, won: this.state.status === 'won' };
    }

    // Check max steps
    if (this.state.steps >= MAX_STEPS) {
      this.state.status = 'lost';
      return { state: this.getState(), finished: true, won: false };
    }

    // If stack is empty, re-push F1 (auto-loop)
    if (this.stack.length === 0) {
      this.stack.push({ functionName: 'f1', instructionIndex: 0 });
    }

    // Get current frame
    const frame = this.stack[this.stack.length - 1];
    const func = this.program[frame.functionName];

    // Safety check: if frame is already exhausted, pop it and return
    // (This should rarely happen since we clean up at the end of each step)
    if (frame.instructionIndex >= func.length) {
      this.stack.pop();
      if (this.stack.length === 0) {
        this.stack.push({ functionName: 'f1', instructionIndex: 0 });
      }
      return { state: this.getState(), finished: false, won: false };
    }

    const instruction = func[frame.instructionIndex];
    frame.instructionIndex++;

    // Skip null instructions
    if (!instruction) {
      return this.step();
    }

    // Check condition
    if (instruction.condition !== null) {
      const currentTile = this.getTileAtRobot();
      if (!currentTile || currentTile.color !== instruction.condition) {
        return this.step(); // Condition not met, skip
      }
    }

    // Execute instruction
    this.executeInstruction(instruction.type);
    this.state.steps++;

    // Check win/lose conditions
    const currentTile = this.getTileAtRobot();
    if (!currentTile) {
      this.state.status = 'lost';
      return { state: this.getState(), finished: true, won: false };
    }

    // Collect star if present
    if (currentTile.hasStar) {
      currentTile.hasStar = false;
      this.state.starsCollected++;

      if (this.state.starsCollected === this.state.totalStars) {
        this.state.status = 'won';
        return { state: this.getState(), finished: true, won: true };
      }
    }

    // Pop frames that have reached their end immediately
    // This ensures getCurrentPosition() returns the next instruction to execute,
    // not a stale position past the end of a completed function
    while (this.stack.length > 0) {
      const topFrame = this.stack[this.stack.length - 1];
      const topFunc = this.program[topFrame.functionName];

      if (topFrame.instructionIndex < topFunc.length) {
        break; // This frame has more instructions
      }

      // Pop the exhausted frame - execution returns to caller
      this.stack.pop();
    }

    // If stack became empty (F1 completed), re-push F1 to continue the loop
    if (this.stack.length === 0) {
      this.stack.push({ functionName: 'f1', instructionIndex: 0 });
    }

    return { state: this.getState(), finished: false, won: false };
  }

  private getTileAtRobot(): Tile | null {
    const { x, y } = this.state.robot.position;
    if (y < 0 || y >= this.state.grid.length) return null;
    if (x < 0 || x >= this.state.grid[0].length) return null;
    return this.state.grid[y][x];
  }

  private executeInstruction(type: InstructionType): void {
    switch (type) {
      case 'forward':
        this.moveForward();
        break;
      case 'left':
        this.state.robot.direction = TURN_LEFT[this.state.robot.direction];
        break;
      case 'right':
        this.state.robot.direction = TURN_RIGHT[this.state.robot.direction];
        break;
      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        this.stack.push({ functionName: type, instructionIndex: 0 });
        break;
      case 'paint_red':
        this.paintTile('red');
        break;
      case 'paint_green':
        this.paintTile('green');
        break;
      case 'paint_blue':
        this.paintTile('blue');
        break;
      case 'noop':
        // Do nothing
        break;
    }
  }

  private moveForward(): void {
    const delta = DIRECTION_DELTAS[this.state.robot.direction];
    this.state.robot.position = {
      x: this.state.robot.position.x + delta.x,
      y: this.state.robot.position.y + delta.y,
    };
  }

  private paintTile(color: TileColor): void {
    const tile = this.getTileAtRobot();
    if (tile) {
      tile.color = color;
    }
  }

  // Run until completion or max steps
  public runToCompletion(): ExecutionResult {
    this.start();
    let result: ExecutionResult;

    do {
      result = this.step();
    } while (!result.finished);

    return result;
  }

  // Count instructions used in program
  public countInstructions(): number {
    let count = 0;
    for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      for (const instruction of this.program[funcName]) {
        if (instruction !== null) {
          count++;
        }
      }
    }
    return count;
  }

  // Get current stack depth (for debugging/visualization)
  public getStackDepth(): number {
    return this.stack.length;
  }

  // Get the full call stack (for visualization)
  // If running/paused and stack is empty, F1 will auto-loop, so show F1
  public getCallStack(): StackFrame[] {
    if (this.stack.length === 0 && (this.state.status === 'running' || this.state.status === 'paused')) {
      return [{ functionName: 'f1', instructionIndex: 0 }];
    }
    return this.stack.map(frame => ({ ...frame }));
  }

  // Get current execution position (the instruction about to execute)
  // If running/paused and stack is empty, F1 will auto-loop, so show F1
  public getCurrentPosition(): { functionName: FunctionName; index: number } | null {
    if (this.stack.length === 0) {
      if (this.state.status === 'running' || this.state.status === 'paused') {
        return { functionName: 'f1', index: 0 };
      }
      return null;
    }
    const frame = this.stack[this.stack.length - 1];
    // Return the current index (not -1) since this is what will execute next
    return { functionName: frame.functionName, index: frame.instructionIndex };
  }

  // Create a snapshot of current state for backstep
  public createSnapshot(): { state: GameState; stack: StackFrame[] } {
    return {
      state: {
        ...this.state,
        robot: { ...this.state.robot, position: { ...this.state.robot.position } },
        grid: this.deepCloneGrid(this.state.grid),
      },
      stack: this.stack.map(frame => ({ ...frame })),
    };
  }

  // Restore from a snapshot
  public restoreSnapshot(snapshot: { state: GameState; stack: StackFrame[] }): void {
    this.state = {
      ...snapshot.state,
      robot: { ...snapshot.state.robot, position: { ...snapshot.state.robot.position } },
      grid: this.deepCloneGrid(snapshot.state.grid),
    };
    this.stack = snapshot.stack.map(frame => ({ ...frame }));
  }
}
