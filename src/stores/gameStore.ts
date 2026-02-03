import { create } from 'zustand';
import { GameEngine } from '../engine/GameEngine';
import type {
  FunctionName,
  GameState,
  Instruction,
  Program,
  PuzzleConfig,
  StackFrame,
} from '../engine/types';

type Snapshot = { state: GameState; stack: StackFrame[] };

// Deep clone a program for history
function cloneProgram(program: Program): Program {
  return {
    f1: program.f1.map(i => i ? { ...i } : null),
    f2: program.f2.map(i => i ? { ...i } : null),
    f3: program.f3.map(i => i ? { ...i } : null),
    f4: program.f4.map(i => i ? { ...i } : null),
    f5: program.f5.map(i => i ? { ...i } : null),
  };
}

interface GameStore {
  // Current puzzle state
  currentPuzzle: PuzzleConfig | null;
  engine: GameEngine | null;
  gameState: GameState | null;
  program: Program | null;

  // Execution state
  isRunning: boolean;
  isPaused: boolean;
  speed: number; // ms per step

  // History for backstep (execution)
  history: Snapshot[];

  // History for program undo (editing)
  programHistory: Program[];

  // Actions
  loadPuzzle: (puzzle: PuzzleConfig) => void;
  setInstruction: (func: FunctionName, index: number, instruction: Instruction | null) => void;
  clearFunction: (func: FunctionName) => void;
  clearProgram: () => void;
  undoProgramChange: () => void;
  canUndoProgram: () => boolean;

  // Execution controls
  start: () => void;
  pause: () => void;
  resume: () => void;
  step: () => { finished: boolean; won: boolean };
  backstep: () => void;
  reset: () => void;
  setSpeed: (speed: number) => void;
  getCurrentPosition: () => { functionName: FunctionName; index: number } | null;
  getCallStack: () => StackFrame[];
  canBackstep: () => boolean;

  // Program management
  getProgram: () => Program | null;
  setProgram: (program: Program) => void;
}

export const useGameStore = create<GameStore>()((set, get) => ({
  currentPuzzle: null,
  engine: null,
  gameState: null,
  program: null,
  isRunning: false,
  isPaused: false,
  speed: 1000, // Default to slowest speed for beginners
  history: [],
  programHistory: [],

  loadPuzzle: (puzzle: PuzzleConfig) => {
    const engine = new GameEngine(puzzle);
    set({
      currentPuzzle: puzzle,
      engine,
      gameState: engine.getState(),
      program: engine.getProgram(),
      isRunning: false,
      isPaused: false,
      history: [],
      programHistory: [],
    });
  },

  setInstruction: (func: FunctionName, index: number, instruction: Instruction | null) => {
    const { engine, program, programHistory } = get();
    if (!engine || !program) return;

    // Save current program to history before making changes
    const newHistory = [...programHistory, cloneProgram(program)].slice(-50); // Keep last 50 changes

    engine.setInstruction(func, index, instruction);
    set({ program: engine.getProgram(), programHistory: newHistory });
  },

  clearFunction: (func: FunctionName) => {
    const { engine, program, programHistory } = get();
    if (!engine || !program) return;

    // Check if function is already empty
    const hasInstructions = program[func].some(i => i !== null);
    if (!hasInstructions) return;

    // Save current program to history before clearing
    const newHistory = [...programHistory, cloneProgram(program)].slice(-50);

    const length = program[func].length;
    for (let i = 0; i < length; i++) {
      engine.setInstruction(func, i, null);
    }
    set({ program: engine.getProgram(), programHistory: newHistory });
  },

  clearProgram: () => {
    const { engine, program, programHistory } = get();
    if (!engine || !program) return;

    // Check if program is already empty
    const hasInstructions = ['f1', 'f2', 'f3', 'f4', 'f5'].some(
      f => program[f as FunctionName].some(i => i !== null)
    );
    if (!hasInstructions) return;

    // Save current program to history before clearing
    const newHistory = [...programHistory, cloneProgram(program)].slice(-50);

    for (const func of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      const length = program[func].length;
      for (let i = 0; i < length; i++) {
        engine.setInstruction(func, i, null);
      }
    }
    set({ program: engine.getProgram(), programHistory: newHistory });
  },

  undoProgramChange: () => {
    const { engine, programHistory } = get();
    if (!engine || programHistory.length === 0) return;

    // Pop the last program state
    const newHistory = [...programHistory];
    const previousProgram = newHistory.pop()!;

    // Restore the program
    engine.setProgram(previousProgram);
    set({ program: engine.getProgram(), programHistory: newHistory });
  },

  canUndoProgram: () => {
    const { programHistory } = get();
    return programHistory.length > 0;
  },

  start: () => {
    const { engine } = get();
    if (!engine) return;

    engine.start();
    set({
      isRunning: true,
      isPaused: false,
      gameState: engine.getState(),
      history: [], // Clear history on start
    });
  },

  pause: () => {
    const { engine } = get();
    if (!engine) return;

    engine.pause();
    set({ isPaused: true });
  },

  resume: () => {
    const { engine } = get();
    if (!engine) return;

    engine.resume();
    set({ isPaused: false });
  },

  step: () => {
    const { engine, history } = get();
    if (!engine) return { finished: true, won: false };

    // Save snapshot before stepping (for backstep)
    const snapshot = engine.createSnapshot();

    const result = engine.step();
    set({
      gameState: engine.getState(),
      history: [...history, snapshot],
    });

    if (result.finished) {
      set({ isRunning: false });
    }

    return { finished: result.finished, won: result.won };
  },

  backstep: () => {
    const { engine, history } = get();
    if (!engine || history.length === 0) return;

    // Pop the last snapshot
    const newHistory = [...history];
    const snapshot = newHistory.pop()!;

    // Restore the engine state
    engine.restoreSnapshot(snapshot);

    set({
      gameState: engine.getState(),
      history: newHistory,
    });
  },

  reset: () => {
    const { engine } = get();
    if (!engine) return;

    engine.reset();
    set({
      gameState: engine.getState(),
      isRunning: false,
      isPaused: false,
      history: [],
    });
  },

  setSpeed: (speed: number) => {
    set({ speed: Math.max(25, Math.min(1000, speed)) });
  },

  getProgram: () => {
    const { engine } = get();
    return engine?.getProgram() || null;
  },

  setProgram: (program: Program) => {
    const { engine } = get();
    if (!engine) return;

    engine.setProgram(program);
    set({ program: engine.getProgram() });
  },

  getCurrentPosition: () => {
    const { engine } = get();
    return engine?.getCurrentPosition() || null;
  },

  getCallStack: () => {
    const { engine } = get();
    return engine?.getCallStack() || [];
  },

  canBackstep: () => {
    const { history } = get();
    return history.length > 0;
  },
}));
