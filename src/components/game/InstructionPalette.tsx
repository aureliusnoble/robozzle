import type { ReactNode } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { motion } from 'framer-motion';
import { ArrowUp, CornerUpLeft, CornerUpRight, Circle, Paintbrush } from 'lucide-react';
import type { InstructionType, TileColor } from '../../engine/types';
import styles from './InstructionPalette.module.css';

interface InstructionPaletteProps {
  allowedInstructions: InstructionType[];
  onColorSelect?: (color: TileColor | null) => void;
  selectedColor: TileColor | null;
  disabled?: boolean;
  tutorialStep?: number; // For progressive disclosure
}

// Paint icon with white brush and colored paint drop for clarity
function PaintIcon({ color, size = 22 }: { color: string; size?: number }) {
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

function getInstructionIcon(type: InstructionType): ReactNode {
  switch (type) {
    case 'forward':
      return <ArrowUp size={26} />;
    case 'left':
      return <CornerUpLeft size={26} />;
    case 'right':
      return <CornerUpRight size={26} />;
    case 'paint_red':
      return <PaintIcon color="#EF4444" size={22} />;
    case 'paint_green':
      return <PaintIcon color="#22C55E" size={22} />;
    case 'paint_blue':
      return <PaintIcon color="#3B82F6" size={22} />;
    case 'noop':
      return <Circle size={22} />;
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

const INSTRUCTION_LABELS: Record<InstructionType, string> = {
  forward: 'Move Forward',
  left: 'Turn Left',
  right: 'Turn Right',
  f1: 'Call F1',
  f2: 'Call F2',
  f3: 'Call F3',
  f4: 'Call F4',
  f5: 'Call F5',
  paint_red: 'Paint Red',
  paint_green: 'Paint Green',
  paint_blue: 'Paint Blue',
  noop: 'No-op',
};

interface DraggableInstructionProps {
  type: InstructionType;
  color: TileColor | null;
  disabled?: boolean;
}

function DraggableInstruction({ type, color, disabled }: DraggableInstructionProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `palette-${type}-${color || 'none'}`,
    data: { type, condition: color },
    disabled,
  });

  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
      }
    : undefined;

  return (
    <motion.div
      id={`palette-${type}`}
      ref={setNodeRef}
      className={`${styles.instruction} ${isDragging ? styles.dragging : ''} ${disabled ? styles.disabled : ''}`}
      style={style}
      {...(disabled ? {} : listeners)}
      {...attributes}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      title={INSTRUCTION_LABELS[type]}
      data-color={color}
    >
      <span className={styles.icon}>{getInstructionIcon(type)}</span>
      {color && (
        <div
          className={styles.colorIndicator}
          style={{
            backgroundColor:
              color === 'red' ? '#F87171' : color === 'green' ? '#4ADE80' : '#60A5FA',
          }}
        />
      )}
    </motion.div>
  );
}

export function InstructionPalette({
  allowedInstructions,
  onColorSelect,
  selectedColor,
  disabled,
  tutorialStep,
}: InstructionPaletteProps) {
  // Determine which colors are in the puzzle (for conditional instructions)
  const hasColoredTiles = allowedInstructions.some(i =>
    i.startsWith('paint_') || ['forward', 'left', 'right'].includes(i)
  );

  // Progressive disclosure: hide color selector until Tutorial 2+
  const showColorSelector = tutorialStep === undefined || tutorialStep >= 2;

  return (
    <div id="instruction-palette" className={`${styles.container} ${disabled ? styles.disabled : ''}`}>
      {/* All available instructions in a simple grid */}
      <div className={styles.instructionsGrid}>
        {allowedInstructions.map(type => (
          <DraggableInstruction
            key={type}
            type={type}
            color={selectedColor}
            disabled={disabled}
          />
        ))}
      </div>

      {/* Color condition selector - only show if there are movement/function instructions */}
      {/* Progressive disclosure: hidden until Tutorial 2 */}
      {hasColoredTiles && showColorSelector && (
        <div id="color-condition-selector" className={styles.conditionBar}>
          <span className={styles.conditionLabel}>Run on:</span>
          <div className={styles.conditionButtons}>
            <button
              className={`${styles.conditionButton} ${selectedColor === null ? styles.selected : ''}`}
              onClick={() => onColorSelect?.(null)}
              title="Always run"
            >
              Any
            </button>
            <button
              className={`${styles.conditionButton} ${styles.redCondition} ${selectedColor === 'red' ? styles.selected : ''}`}
              onClick={() => onColorSelect?.('red')}
              title="Only run on red tiles"
            >
              <span className={styles.colorDot} style={{ backgroundColor: '#EF4444' }} />
            </button>
            <button
              className={`${styles.conditionButton} ${styles.greenCondition} ${selectedColor === 'green' ? styles.selected : ''}`}
              onClick={() => onColorSelect?.('green')}
              title="Only run on green tiles"
            >
              <span className={styles.colorDot} style={{ backgroundColor: '#22C55E' }} />
            </button>
            <button
              className={`${styles.conditionButton} ${styles.blueCondition} ${selectedColor === 'blue' ? styles.selected : ''}`}
              onClick={() => onColorSelect?.('blue')}
              title="Only run on blue tiles"
            >
              <span className={styles.colorDot} style={{ backgroundColor: '#3B82F6' }} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
