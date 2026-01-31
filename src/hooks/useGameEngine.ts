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
  const initialDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasRunningRef = useRef(false);

  // Auto-step when running
  useEffect(() => {
    if (isRunning && !isPaused) {
      // Check if this is a fresh start (not resuming from pause)
      const isFreshStart = !wasRunningRef.current;
      wasRunningRef.current = true;

      if (isFreshStart) {
        // Wait one full step duration before first execution
        // This lets the user see which instruction will execute first (NEXT indicator)
        initialDelayRef.current = setTimeout(() => {
          step();
          // Then continue with regular interval
          intervalRef.current = setInterval(() => {
            step();
          }, speed);
        }, speed);
      } else {
        // Resuming from pause - start interval immediately
        intervalRef.current = setInterval(() => {
          step();
        }, speed);
      }

      return () => {
        if (initialDelayRef.current) {
          clearTimeout(initialDelayRef.current);
          initialDelayRef.current = null;
        }
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
      };
    } else if (!isRunning) {
      // Reset the fresh start tracking when stopped
      wasRunningRef.current = false;
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
