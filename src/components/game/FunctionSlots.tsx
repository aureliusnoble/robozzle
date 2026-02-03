import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { useDroppable, useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { ArrowUp, CornerUpLeft, CornerUpRight, Circle, Paintbrush, Undo2, Trash2 } from 'lucide-react';
import type { FunctionName, Instruction, Program, TileColor } from '../../engine/types';
import styles from './FunctionSlots.module.css';

interface FunctionSlotsProps {
  program: Program;
  functionLengths: Record<FunctionName, number>;
  currentFunction: FunctionName;
  executionPosition: { functionName: FunctionName; index: number } | null;
  currentTileColor?: TileColor | null; // Color of tile robot is currently on
  stepCount?: number; // Number of steps executed (to hide LAST on first step)
  disabled?: boolean;
  tutorialStep?: number; // For progressive disclosure
  canUndo?: boolean; // Whether undo is available
  onFunctionSelect: (func: FunctionName) => void;
  onSlotClick: (func: FunctionName, index: number) => void;
  onSlotLongPress: (func: FunctionName, index: number) => void;
  onUndo?: () => void;
  onClearAll?: () => void;
}

// Paint icon with white brush and colored paint drop for clarity
function PaintIcon({ color, size = 18 }: { color: string; size?: number }) {
  return (
    <div className={styles.paintIcon}>
      <Paintbrush size={size} className={styles.paintBrush} />
      <div
        className={styles.paintDrop}
        style={{ backgroundColor: color }}
      />
    </div>
  );
}

function getInstructionIcon(type: string): ReactNode {
  switch (type) {
    case 'forward':
      return <ArrowUp size={22} />;
    case 'left':
      return <CornerUpLeft size={22} />;
    case 'right':
      return <CornerUpRight size={22} />;
    case 'paint_red':
      return <PaintIcon color="#EF4444" size={18} />;
    case 'paint_green':
      return <PaintIcon color="#22C55E" size={18} />;
    case 'paint_blue':
      return <PaintIcon color="#3B82F6" size={18} />;
    case 'noop':
      return <Circle size={18} />;
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
      return <span className={styles.funcLabel}>{type.toUpperCase()}</span>;
    default:
      return null;
  }
}

interface DroppableSlotProps {
  func: FunctionName;
  index: number;
  instruction: Instruction | null;
  isExecuting: boolean; // Last executed instruction
  isUpNext: boolean; // Next instruction to execute
  willSkip: boolean; // Instruction will be skipped (condition won't match)
  disabled?: boolean;
  onClick: () => void;
}

// Separate draggable component for instructions in slots
function DraggableSlotInstruction({
  func,
  index,
  instruction,
  disabled,
  onClick,
}: {
  func: FunctionName;
  index: number;
  instruction: Instruction;
  disabled?: boolean;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging, transform } = useDraggable({
    id: `slot-drag-${func}-${index}`,
    data: {
      type: instruction.type,
      condition: instruction.condition,
      fromSlot: { func, index },
    },
    disabled,
  });

  const wasDragging = useRef(false);

  useEffect(() => {
    if (isDragging) {
      wasDragging.current = true;
    }
  }, [isDragging]);

  const handleClick = () => {
    if (wasDragging.current) {
      wasDragging.current = false;
      return;
    }
    onClick();
  };

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  return (
    <motion.div
      ref={setNodeRef}
      className={`${styles.instruction} ${isDragging ? styles.dragging : ''}`}
      data-color={instruction.condition}
      style={style}
      onClick={disabled ? undefined : handleClick}
      {...(disabled ? {} : listeners)}
      {...attributes}
    >
      <span className={styles.icon}>{getInstructionIcon(instruction.type)}</span>
      {instruction.condition && (
        <div
          className={styles.conditionDot}
          style={{
            backgroundColor:
              instruction.condition === 'red'
                ? '#F87171'
                : instruction.condition === 'green'
                ? '#4ADE80'
                : '#60A5FA',
          }}
        />
      )}
    </motion.div>
  );
}

function DroppableSlot({
  func,
  index,
  instruction,
  isExecuting,
  isUpNext,
  willSkip,
  disabled,
  onClick,
}: DroppableSlotProps) {
  // Slot is only droppable
  const { isOver, setNodeRef } = useDroppable({
    id: `slot-${func}-${index}`,
    data: { func, index },
    disabled,
  });

  // Build class list - allow both executing (LAST) and upNext (NEXT) to show together
  const classNames = [
    styles.slot,
    isOver && styles.dragOver,
    isExecuting && styles.executing,
    isUpNext && styles.upNext,
    willSkip && styles.willSkip,
    disabled && styles.disabled,
  ].filter(Boolean).join(' ');

  return (
    <div
      ref={setNodeRef}
      className={classNames}
      data-color={instruction?.condition}
    >
      {instruction ? (
        <DraggableSlotInstruction
          func={func}
          index={index}
          instruction={instruction}
          disabled={disabled}
          onClick={onClick}
        />
      ) : (
        <div className={styles.emptySlot} />
      )}
    </div>
  );
}

export function FunctionSlots({
  program,
  functionLengths,
  currentFunction,
  executionPosition,
  currentTileColor,
  stepCount = 0,
  disabled,
  tutorialStep,
  canUndo,
  onFunctionSelect,
  onSlotClick,
  onSlotLongPress,
  onUndo,
  onClearAll,
}: FunctionSlotsProps) {
  const functions: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];

  // Filter active functions based on function lengths
  let activeFunctions = functions.filter(f => functionLengths[f] > 0);

  // Progressive disclosure: hide F2+ tabs until Tutorial 3 (Functions)
  if (tutorialStep !== undefined && tutorialStep < 3) {
    activeFunctions = activeFunctions.filter(f => f === 'f1');
  }

  // Track the previous execution function to detect when we switch functions
  const prevExecutingFunction = useRef<FunctionName | null>(null);

  // Auto-switch to the executing function when execution moves to a different function
  // This triggers on every position change, ensuring we always show the active function
  const currentExecutingFunction = executionPosition?.functionName ?? null;

  useEffect(() => {
    if (!currentExecutingFunction) {
      prevExecutingFunction.current = null;
      return;
    }

    // Always switch to the executing function when position updates
    // This ensures we catch function returns (F2 -> F1) even when rapid
    onFunctionSelect(currentExecutingFunction);
    prevExecutingFunction.current = currentExecutingFunction;
  }, [currentExecutingFunction, executionPosition?.index, onFunctionSelect]);

  // Determine which function tab is executing
  const executingFunction = executionPosition?.functionName;

  // executionPosition.index points to the next instruction to be CHECKED
  // Due to the engine incrementing before executing, after a step:
  // - index points to what will be checked next
  // - index - 1 is approximately what just executed (but not always accurate with skips)

  const funcLength = program[currentFunction].length;

  // Helper: check if an instruction will execute (no condition or condition matches tile)
  const willExecute = (instruction: Instruction | null): boolean => {
    if (!instruction) return false;
    if (!instruction.condition) return true; // No condition = always executes
    return instruction.condition === currentTileColor; // Condition must match current tile
  };

  // Calculate "NEXT" - the instruction that will actually EXECUTE (skipping conditional skips)
  const getNextSlotIndex = (): number | null => {
    if (!executionPosition || executionPosition.functionName !== currentFunction) {
      return null;
    }

    let idx = executionPosition.index;

    // Search from current position, wrapping around for F1
    const maxIterations = funcLength * 2; // Prevent infinite loop
    let iterations = 0;

    while (iterations < maxIterations) {
      // If past the end, handle looping
      if (idx >= funcLength) {
        if (currentFunction === 'f1') {
          idx = 0; // F1 loops back
        } else {
          return null; // Other functions return to caller
        }
      }

      const instruction = program[currentFunction][idx];

      // Found a non-null instruction that will execute
      if (instruction && willExecute(instruction)) {
        return idx;
      }

      // Skip null slots or instructions with non-matching conditions
      idx++;
      iterations++;
    }

    return null;
  };

  // Calculate "NOW" - the instruction that just executed
  const getExecutingSlotIndex = (): number | null => {
    // Don't show LAST on the very first instruction - there's no "previous" to compare to
    if (stepCount <= 1) {
      return null;
    }

    if (!executionPosition || executionPosition.functionName !== currentFunction) {
      return null;
    }

    const idx = executionPosition.index;

    // If index is 0 and we're in F1 while running, F1 may have just looped
    // In that case, the last instruction was just checked/executed
    if (idx === 0) {
      if (currentFunction === 'f1' && disabled) {
        // F1 just looped - find the last non-null instruction
        for (let i = funcLength - 1; i >= 0; i--) {
          if (program[currentFunction][i] !== null) {
            return i;
          }
        }
      }
      return null;
    }

    // If index is within bounds, the previous instruction just executed
    if (idx > 0 && idx <= funcLength) {
      const prevIndex = idx - 1;
      if (program[currentFunction][prevIndex] !== null) {
        return prevIndex;
      }
    }

    // If past the end (idx > funcLength), the last instruction in the function just executed
    if (idx > funcLength) {
      // Find last non-null instruction
      for (let i = funcLength - 1; i >= 0; i--) {
        if (program[currentFunction][i] !== null) {
          return i;
        }
      }
    }

    // If idx === funcLength, the last instruction (idx - 1) just executed
    if (idx === funcLength) {
      const lastIdx = funcLength - 1;
      if (lastIdx >= 0 && program[currentFunction][lastIdx] !== null) {
        return lastIdx;
      }
    }

    return null;
  };

  const nextSlotIndex = getNextSlotIndex();
  const executingSlotIndex = getExecutingSlotIndex();

  // Calculate if an instruction will be skipped (condition won't match current tile)
  const getWillSkip = (index: number): boolean => {
    // Only show skip indicator when running
    if (!disabled) return false;

    const instruction = program[currentFunction][index];
    if (!instruction || !instruction.condition) return false;

    // Will skip if condition doesn't match current tile color
    return instruction.condition !== currentTileColor;
  };

  return (
    <div className={`${styles.container} ${disabled ? styles.running : ''}`}>
      {/* Function tabs */}
      <div id="function-tabs" className={styles.tabs}>
        {activeFunctions.map(func => (
          <button
            key={func}
            id={`function-tab-${func}`}
            className={`${styles.tab} ${currentFunction === func ? styles.active : ''} ${executingFunction === func ? styles.executing : ''}`}
            onClick={() => onFunctionSelect(func)}
          >
            {func === 'f1' ? (
              <span className={styles.f1Label}>F1 <span className={styles.loopIcon}>↻</span></span>
            ) : (
              func.toUpperCase()
            )}
            <span className={styles.slotCount}>
              ({program[func].filter(i => i !== null).length}/{functionLengths[func]})
            </span>
          </button>
        ))}
      </div>

      {/* Slots for current function */}
      <div
        id={`function-slots-${currentFunction}`}
        className={`${styles.slots} ${currentFunction === 'f1' ? styles.slotsF1 : ''} ${disabled ? styles.slotsDisabled : ''}`}
      >
        {program[currentFunction].map((instruction, index) => (
          <DroppableSlot
            key={index}
            func={currentFunction}
            index={index}
            instruction={instruction}
            isExecuting={index === executingSlotIndex}
            isUpNext={index === nextSlotIndex}
            willSkip={getWillSkip(index)}
            disabled={disabled}
            onClick={() => onSlotClick(currentFunction, index)}
          />
        ))}
      </div>

      {/* Action buttons */}
      <div className={styles.actionButtons}>
        {onUndo && (
          <button
            className={`${styles.actionButton} ${styles.undoButton}`}
            onClick={onUndo}
            title="Undo last change"
            disabled={disabled || !canUndo}
          >
            <Undo2 size={16} />
            Undo
          </button>
        )}
        <button
          className={`${styles.actionButton} ${styles.clearButton}`}
          onClick={() => onSlotLongPress(currentFunction, -1)}
          title={`Clear ${currentFunction.toUpperCase()}`}
          disabled={disabled}
        >
          Clear {currentFunction.toUpperCase()}
        </button>
        {onClearAll && (
          <button
            className={`${styles.actionButton} ${styles.clearAllButton}`}
            onClick={onClearAll}
            title="Clear all functions"
            disabled={disabled}
          >
            <Trash2 size={16} />
            Clear All
          </button>
        )}
      </div>
    </div>
  );
}
