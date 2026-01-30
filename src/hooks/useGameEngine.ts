import { useCallback, useEffect, useRef } from 'react';
import { useGameStore } from '../stores/gameStore';

export function useGameEngine() {
  const {
    currentPuzzle,
    gameState,
    program,
    isRunning,
    isPaused,
    speed,
    loadPuzzle,
    setInstruction,
    clearFunction,
    clearProgram,
    start,
    pause,
    resume,
    step,
    backstep,
    reset,
    setSpeed,
    getCurrentPosition,
    getCallStack,
    canBackstep,
  } = useGameStore();

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-step when running
  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        step();
      }, speed);

      return () => {
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
        }
      };
    }
  }, [isRunning, isPaused, speed, step]);

  // Count instructions used
  const instructionsUsed = useCallback(() => {
    if (!program) return 0;
    let count = 0;
    for (const func of Object.values(program)) {
      for (const instr of func) {
        if (instr !== null) count++;
      }
    }
    return count;
  }, [program]);

  // Check if puzzle is complete
  const isComplete = gameState?.status === 'won';
  const isFailed = gameState?.status === 'lost';

  return {
    currentPuzzle,
    gameState,
    program,
    isRunning,
    isPaused,
    speed,
    isComplete,
    isFailed,
    instructionsUsed: instructionsUsed(),
    currentPosition: getCurrentPosition(),
    callStack: getCallStack(),
    canBackstep: canBackstep(),
    loadPuzzle,
    setInstruction,
    clearFunction,
    clearProgram,
    start,
    pause,
    resume,
    step,
    backstep,
    reset,
    setSpeed,
  };
}
