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

  // History for backstep
  history: Snapshot[];

  // Actions
  loadPuzzle: (puzzle: PuzzleConfig) => void;
  setInstruction: (func: FunctionName, index: number, instruction: Instruction | null) => void;
  clearFunction: (func: FunctionName) => void;
  clearProgram: () => void;

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
    });
  },

  setInstruction: (func: FunctionName, index: number, instruction: Instruction | null) => {
    const { engine } = get();
    if (!engine) return;

    engine.setInstruction(func, index, instruction);
    set({ program: engine.getProgram() });
  },

  clearFunction: (func: FunctionName) => {
    const { engine, program } = get();
    if (!engine || !program) return;

    const length = program[func].length;
    for (let i = 0; i < length; i++) {
      engine.setInstruction(func, i, null);
    }
    set({ program: engine.getProgram() });
  },

  clearProgram: () => {
    const { engine, program } = get();
    if (!engine || !program) return;

    for (const func of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      const length = program[func].length;
      for (let i = 0; i < length; i++) {
        engine.setInstruction(func, i, null);
      }
    }
    set({ program: engine.getProgram() });
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
    set({ speed: Math.max(50, Math.min(1000, speed)) });
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
