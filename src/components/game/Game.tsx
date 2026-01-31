import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  pointerWithin,
  rectIntersection,
  useSensor,
  useSensors,
  PointerSensor,
  TouchSensor,
} from '@dnd-kit/core';
import type { CollisionDetection } from '@dnd-kit/core';
import type { DragEndEvent, DragStartEvent } from '@dnd-kit/core';

// Custom collision detection: prefer rectIntersection (overlap-based),
// fall back to pointerWithin. If neither finds a target, returns empty
// which triggers delete behavior for slot-to-slot drags.
const slotCollisionDetection: CollisionDetection = (args) => {
  // First check if the dragged element overlaps any droppable
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    return rectCollisions;
  }

  // Fall back to pointer-based detection
  return pointerWithin(args);
};
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp, CornerUpLeft, CornerUpRight, Circle, Paintbrush, Footprints, Turtle, Rabbit, HelpCircle, Trophy, XCircle, RotateCcw, AlertTriangle, Library, Share2 } from 'lucide-react';
import type { PuzzleConfig, FunctionName, TileColor, Instruction } from '../../engine/types';
import { useGameEngine } from '../../hooks/useGameEngine';
import { GameBoard } from './GameBoard';
import { InstructionPalette } from './InstructionPalette';
import { FunctionSlots } from './FunctionSlots';
import { ExecutionControls } from './ExecutionControls';
import { CallStack } from './CallStack';
import styles from './Game.module.css';

interface GameProps {
  puzzle: PuzzleConfig;
  onComplete?: (steps: number, instructions: number) => void;
  onNextPuzzle?: () => void;
  onBack?: () => void;
  onShare?: () => void;
  tutorialStep?: number; // For progressive disclosure and onboarding
}

// Paint icon for drag overlay - white brush with colored drop
function DragPaintIcon({ color }: { color: string }) {
  return (
    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Paintbrush size={22} style={{ color: 'white', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3))' }} />
      <div
        style={{
          position: 'absolute',
          bottom: -4,
          right: -3,
          width: 12,
          height: 12,
          borderRadius: '50% 50% 50% 0',
          transform: 'rotate(-45deg)',
          backgroundColor: color,
          border: '2px solid white',
          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
        }}
      />
    </div>
  );
}

function getDragOverlayIcon(type: string) {
  switch (type) {
    case 'forward':
      return <ArrowUp size={24} />;
    case 'left':
      return <CornerUpLeft size={24} />;
    case 'right':
      return <CornerUpRight size={24} />;
    case 'paint_red':
      return <DragPaintIcon color="#EF4444" />;
    case 'paint_green':
      return <DragPaintIcon color="#22C55E" />;
    case 'paint_blue':
      return <DragPaintIcon color="#3B82F6" />;
    case 'noop':
      return <Circle size={22} />;
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
      return <span style={{ fontSize: '1rem', fontWeight: 700 }}>{type.toUpperCase()}</span>;
    default:
      return null;
  }
}

export function Game({ puzzle, onComplete, onNextPuzzle, onBack, onShare, tutorialStep }: GameProps) {
  // Configure drag sensors with activation constraint
  // This allows clicks to work for color cycling, while drags need movement
  const pointerSensor = useSensor(PointerSensor, {
    activationConstraint: {
      distance: 8, // Must move 8px before drag activates
    },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: {
      delay: 150, // Small delay for touch to distinguish from tap
      tolerance: 5,
    },
  });
  const sensors = useSensors(pointerSensor, touchSensor);

  const {
    gameState,
    program,
    isRunning,
    isPaused,
    isComplete,
    isFailed,
    speed,
    instructionsUsed,
    currentPosition,
    callStack,
    canBackstep,
    loadPuzzle,
    setInstruction,
    clearFunction,
    start,
    pause,
    resume,
    step,
    backstep,
    reset,
    setSpeed,
  } = useGameEngine();

  const [currentFunction, setCurrentFunction] = useState<FunctionName>('f1');
  const [selectedColor, setSelectedColor] = useState<TileColor | null>(null);
  const [activeDrag, setActiveDrag] = useState<{ type: string; condition: TileColor | null } | null>(null);
  const [showHint, setShowHint] = useState(false);

  // Ref and state for conditional horizontal scroll (only when tiles overflow, not padding)
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [needsHorizontalScroll, setNeedsHorizontalScroll] = useState(false);

  // Calculate tiles-only width (matching GameBoard constants)
  const tilesWidth = useMemo(() => {
    if (!gameState) return 0;

    const TILE_SIZE = 32;
    const TILE_GAP = 2;

    let minX = Infinity, maxX = -Infinity;
    gameState.grid.forEach((row) => {
      row.forEach((tile, x) => {
        if (tile !== null) {
          minX = Math.min(minX, x);
          maxX = Math.max(maxX, x);
        }
      });
    });

    if (minX === Infinity) return 0;
    return (maxX - minX + 1) * (TILE_SIZE + TILE_GAP) - TILE_GAP;
  }, [gameState]);

  // Check if tiles overflow container (ignoring padding)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || !tilesWidth) return;

    const checkOverflow = () => {
      const containerWidth = container.clientWidth;
      setNeedsHorizontalScroll(tilesWidth > containerWidth);
    };

    checkOverflow();

    const resizeObserver = new ResizeObserver(checkOverflow);
    resizeObserver.observe(container);

    return () => resizeObserver.disconnect();
  }, [tilesWidth]);

  // Disable editing while program is running
  const editingDisabled = isRunning;

  // Load puzzle on mount or change
  useEffect(() => {
    loadPuzzle(puzzle);
    setCurrentFunction('f1');
    setSelectedColor(null);

    // Center the board scroll after puzzle loads (wait for DOM to update)
    setTimeout(() => {
      const scrollContainer = document.getElementById('board-scroll-container');
      if (scrollContainer) {
        const scrollWidth = scrollContainer.scrollWidth;
        const clientWidth = scrollContainer.clientWidth;
        if (scrollWidth > clientWidth) {
          scrollContainer.scrollTo({
            left: (scrollWidth - clientWidth) / 2,
            behavior: 'auto' // Instant on initial load
          });
        }
      }
    }, 50);
  }, [puzzle, loadPuzzle]);

  // Handle completion
  useEffect(() => {
    if (isComplete && gameState && onComplete) {
      onComplete(gameState.steps, instructionsUsed);
    }
  }, [isComplete, gameState, instructionsUsed, onComplete]);

  // Handle drag start
  const handleDragStart = useCallback((event: DragStartEvent) => {
    if (editingDisabled) return;
    const activeData = event.active.data.current as { type: string; condition: TileColor | null } | undefined;
    if (activeData) {
      setActiveDrag(activeData);
    }
  }, [editingDisabled]);

  // Handle drag end
  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveDrag(null);
      if (editingDisabled) return;

      const { active, over } = event;

      const activeData = active.data.current as {
        type: string;
        condition: TileColor | null;
        fromSlot?: { func: FunctionName; index: number };
      } | undefined;
      if (!activeData) return;

      // If dropped outside any valid target and it came from a slot, delete it
      if (!over) {
        if (activeData.fromSlot) {
          setInstruction(activeData.fromSlot.func, activeData.fromSlot.index, null);
        }
        return;
      }

      const overData = over.data.current as { func?: FunctionName; index?: number } | undefined;
      // Validate that we have valid slot data with both func and index
      if (!overData || overData.func === undefined || overData.index === undefined) {
        // Dropped on something that's not a valid slot - if from slot, delete it
        if (activeData.fromSlot) {
          setInstruction(activeData.fromSlot.func, activeData.fromSlot.index, null);
        }
        return;
      }

      const instruction: Instruction = {
        type: activeData.type as Instruction['type'],
        condition: activeData.condition,
      };

      // Check if dragging from another slot (swap/move)
      if (activeData.fromSlot && program) {
        const sourceSlot = activeData.fromSlot;
        const targetInstruction = program[overData.func][overData.index];

        // If dropping on the same slot, do nothing
        if (sourceSlot.func === overData.func && sourceSlot.index === overData.index) {
          return;
        }

        // Set the target slot to the dragged instruction
        setInstruction(overData.func, overData.index, instruction);
        // Set the source slot to whatever was in the target (swap) or null (move)
        setInstruction(sourceSlot.func, sourceSlot.index, targetInstruction);
      } else {
        // Dragging from palette - just set the instruction
        setInstruction(overData.func, overData.index, instruction);
      }
    },
    [setInstruction, editingDisabled, program]
  );

  // Scroll to game board and center the board horizontally when starting execution
  const scrollToBoard = useCallback(() => {
    const board = document.getElementById('game-board');
    if (board) {
      board.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Also center the horizontal scroll of the board container
    const scrollContainer = document.getElementById('board-scroll-container');
    if (scrollContainer) {
      const scrollWidth = scrollContainer.scrollWidth;
      const clientWidth = scrollContainer.clientWidth;
      if (scrollWidth > clientWidth) {
        // Center the scroll position
        scrollContainer.scrollTo({
          left: (scrollWidth - clientWidth) / 2,
          behavior: 'smooth'
        });
      }
    }
  }, []);

  // Handle slot click - toggle color condition
  const handleSlotClick = useCallback(
    (func: FunctionName, index: number) => {
      if (editingDisabled || !program) return;

      const instruction = program[func][index];
      if (!instruction) return;

      // Cycle through colors: null -> red -> green -> blue -> null
      const colors: (TileColor | null)[] = [null, 'red', 'green', 'blue'];
      const currentIndex = colors.indexOf(instruction.condition);
      const nextColor = colors[(currentIndex + 1) % colors.length];

      setInstruction(func, index, { ...instruction, condition: nextColor });
    },
    [program, setInstruction, editingDisabled]
  );

  // Handle slot long press - delete instruction
  const handleSlotLongPress = useCallback(
    (func: FunctionName, index: number) => {
      if (editingDisabled) return;

      if (index === -1) {
        // Clear entire function
        clearFunction(func);
      } else {
        setInstruction(func, index, null);
      }
    },
    [setInstruction, clearFunction, editingDisabled]
  );

  // Handle play - scroll to board only if starting fresh (step 0)
  const handleStart = useCallback(() => {
    const isStartingFresh = !gameState || gameState.steps === 0;

    if (isStartingFresh) {
      scrollToBoard();
      // Wait for scroll to complete before starting
      setTimeout(() => {
        start();
      }, 400);
    } else {
      // Resuming - start immediately without scrolling
      start();
    }
  }, [start, scrollToBoard, gameState]);

  // Handle step - single step only, don't auto-run, no scrolling
  // First step after reset shows the starting position (NEXT indicator) without executing
  const handleStep = useCallback(() => {
    if (!isRunning) {
      // Starting fresh - show the first instruction as NEXT without executing
      start();
      pause();
      return; // Don't step yet - let user see which instruction will execute first
    }
    step();
  }, [isRunning, start, pause, step]);

  if (!gameState || !program) {
    return <div className={styles.loading}>Loading puzzle...</div>;
  }

  return (
    <div className={styles.container}>
      {/* Puzzle info */}
      <div className={styles.header}>
        <h2 className={styles.title}>{puzzle.title}</h2>
        {puzzle.author && (
          <p className={styles.author}>by {puzzle.author}</p>
        )}
        {puzzle.description && (
          <p className={styles.description}>{puzzle.description}</p>
        )}
        {puzzle.warning && (
          <div className={styles.warningBanner}>
            <AlertTriangle size={18} />
            <p>{puzzle.warning}</p>
          </div>
        )}
        {puzzle.hint && (
          <button
            className={`${styles.hintDropdown} ${showHint ? styles.hintOpen : ''}`}
            onClick={() => setShowHint(!showHint)}
          >
            <HelpCircle size={16} />
            <span>{showHint ? 'Hide Hint' : 'Show Hint'}</span>
          </button>
        )}
        {showHint && puzzle.hint && (
          <div className={styles.hintContent}>
            {puzzle.hint}
          </div>
        )}
      </div>

      {/* Game board */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        collisionDetection={slotCollisionDetection}
      >
        <div className={styles.gameArea}>
          {/* Board with steps on left and speed on right */}
          <div className={styles.boardWrapper}>
            <div className={styles.sidePanel}>
              <Footprints size={18} className={styles.sidePanelIcon} />
              <span className={styles.sidePanelValue}>{gameState.steps}</span>
              <span className={styles.sidePanelLabel}>Steps</span>
            </div>

            <div
              id="board-scroll-container"
              ref={scrollContainerRef}
              className={styles.boardScrollContainer}
              style={{ overflowX: needsHorizontalScroll ? 'auto' : 'visible' }}
            >
              <GameBoard puzzle={puzzle} gameState={gameState} />
            </div>

            <div className={styles.sidePanel}>
              <div className={styles.speedButtons}>
                <button
                  className={`${styles.speedButton} ${speed >= 1000 ? styles.speedActive : ''}`}
                  onClick={() => setSpeed(1000)}
                  title="Slow"
                >
                  <Turtle size={16} />
                </button>
                <button
                  className={`${styles.speedButton} ${speed === 500 ? styles.speedActive : ''}`}
                  onClick={() => setSpeed(500)}
                  title="Medium"
                >
                  <span className={styles.speedDot} />
                </button>
                <button
                  className={`${styles.speedButton} ${speed <= 250 ? styles.speedActive : ''}`}
                  onClick={() => setSpeed(100)}
                  title="Fast"
                >
                  <Rabbit size={16} />
                </button>
              </div>
              <span className={styles.sidePanelLabel}>Speed</span>
            </div>
          </div>

          {/* Execution controls */}
          <ExecutionControls
            isRunning={isRunning}
            isPaused={isPaused}
            isComplete={isComplete || isFailed}
            canBackstep={canBackstep}
            onStart={handleStart}
            onPause={pause}
            onResume={resume}
            onStep={handleStep}
            onBackstep={backstep}
            onReset={reset}
          />

          {/* Call stack visualization - always visible */}
          <CallStack stack={callStack} />

          {/* Programming interface */}
          <div className={styles.programming}>
            <FunctionSlots
              program={program}
              functionLengths={puzzle.functionLengths}
              currentFunction={currentFunction}
              executionPosition={currentPosition}
              currentTileColor={
                gameState.grid[gameState.robot.position.y]?.[gameState.robot.position.x]?.color
              }
              stepCount={gameState.steps}
              disabled={editingDisabled}
              tutorialStep={tutorialStep}
              onFunctionSelect={setCurrentFunction}
              onSlotClick={handleSlotClick}
              onSlotLongPress={handleSlotLongPress}
            />

            <InstructionPalette
              allowedInstructions={puzzle.allowedInstructions}
              selectedColor={selectedColor}
              onColorSelect={setSelectedColor}
              disabled={editingDisabled}
              tutorialStep={tutorialStep}
            />
          </div>
        </div>

        {/* Drag overlay - shows instruction under finger/cursor while dragging */}
        <DragOverlay dropAnimation={null}>
          {activeDrag && (
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: activeDrag.condition ? 'white' : '#1E293B',
                boxShadow: activeDrag.condition
                  ? '0 4px 12px rgba(0, 0, 0, 0.3)'
                  : '0 4px 12px rgba(0, 0, 0, 0.2), inset 0 1px 2px rgba(255, 255, 255, 0.4)',
                background: activeDrag.condition === 'red'
                  ? 'linear-gradient(135deg, #EF4444, #F87171)'
                  : activeDrag.condition === 'green'
                  ? 'linear-gradient(135deg, #10B981, #4ADE80)'
                  : activeDrag.condition === 'blue'
                  ? 'linear-gradient(135deg, #3B82F6, #60A5FA)'
                  : 'linear-gradient(135deg, rgba(239, 68, 68, 0.6), rgba(251, 191, 36, 0.6), rgba(34, 197, 94, 0.6), rgba(59, 130, 246, 0.6))',
                border: activeDrag.condition ? 'none' : '2px solid rgba(255, 255, 255, 0.5)',
                transform: 'scale(1.1)',
              }}
            >
              {getDragOverlayIcon(activeDrag.type)}
            </div>
          )}
        </DragOverlay>
      </DndContext>

      {/* Victory/Fail Modal - separate from game board for better sizing */}
      <AnimatePresence>
        {isComplete && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={styles.modalContent}
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
            >
              <Trophy size={56} className={styles.victoryIcon} />
              <h2 className={styles.modalTitle}>Solved!</h2>
              <p className={styles.modalStats}>
                Completed in {gameState.steps} steps using {instructionsUsed} instructions
              </p>
              <div className={styles.modalButtons}>
                {onShare && (
                  <button className={styles.shareButton} onClick={onShare}>
                    <Share2 size={18} />
                    Share
                  </button>
                )}
                <button className={styles.tryAgainButton} onClick={reset}>
                  <RotateCcw size={18} />
                  Try Again
                </button>
                {onBack && (
                  <button className={styles.backButton} onClick={onBack}>
                    <Library size={18} />
                    Back to Puzzles
                  </button>
                )}
                {onNextPuzzle && (
                  <button className={styles.nextButton} onClick={onNextPuzzle}>
                    Next Puzzle
                    <ArrowUp size={18} style={{ transform: 'rotate(90deg)' }} />
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}

        {isFailed && (
          <motion.div
            className={styles.modalOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className={`${styles.modalContent} ${styles.failModal}`}
              initial={{ scale: 0.8, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.8, y: 20 }}
            >
              <div className={styles.failIconWrapper}>
                <XCircle size={48} className={styles.failIcon} />
              </div>
              <h2 className={styles.modalTitle}>Robot Lost!</h2>
              <p className={styles.modalStats}>
                The robot fell off the board.
                <br />
                <span className={styles.modalHint}>Adjust your program and try again!</span>
              </p>
              <div className={styles.modalButtons}>
                <button className={styles.tryAgainButton} onClick={reset}>
                  <RotateCcw size={18} />
                  Try Again
                </button>
                {onBack && (
                  <button className={styles.backButton} onClick={onBack}>
                    <Library size={18} />
                    Back to Puzzles
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
