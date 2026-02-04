import { motion } from 'framer-motion';
import { Play, Pause, SkipForward, SkipBack, RotateCcw } from 'lucide-react';
import styles from './ExecutionControls.module.css';

interface ExecutionControlsProps {
  isRunning: boolean;
  isPaused: boolean;
  isComplete: boolean;
  canBackstep: boolean;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStep: () => void;
  onBackstep: () => void;
  onReset: () => void;
}

export function ExecutionControls({
  isRunning,
  isPaused,
  isComplete,
  canBackstep,
  onStart,
  onPause,
  onResume,
  onStep,
  onBackstep,
  onReset,
}: ExecutionControlsProps) {
  const handlePlay = () => {
    if (!isRunning) {
      onStart();
    } else if (isPaused) {
      onResume();
    }
  };

  const canPlay = !isRunning || isPaused;
  const canPause = isRunning && !isPaused;

  return (
    <div className={styles.container}>
      <div className={styles.labeledButton}>
        <motion.button
          id="reset-button"
          className={`${styles.button} ${styles.resetButton}`}
          onClick={onReset}
          whileTap={{ scale: 0.95 }}
          title="Reset puzzle"
        >
          <RotateCcw size={18} className={styles.resetIcon} />
        </motion.button>
        <span className={styles.buttonLabel}>Reset</span>
      </div>

      <div className={styles.labeledButton}>
        <motion.button
          id="play-button"
          className={`${styles.button} ${styles.primary}`}
          onClick={handlePlay}
          whileTap={{ scale: 0.95 }}
          disabled={isComplete || !canPlay}
          title="Run your program"
        >
          <Play size={20} className={styles.icon} />
        </motion.button>
        <span className={styles.buttonLabel}>Play</span>
      </div>

      <div className={styles.labeledButton}>
        <motion.button
          className={`${styles.button} ${styles.primary}`}
          onClick={onPause}
          whileTap={{ scale: 0.95 }}
          disabled={!canPause}
          title="Pause execution"
        >
          <Pause size={20} className={styles.icon} />
        </motion.button>
        <span className={styles.buttonLabel}>Pause</span>
      </div>

      <div className={styles.labeledButton}>
        <motion.button
          className={styles.button}
          onClick={onBackstep}
          whileTap={{ scale: 0.95 }}
          disabled={!canBackstep || (isRunning && !isPaused)}
          title="Go back one step"
        >
          <SkipBack size={18} className={styles.icon} />
        </motion.button>
        <span className={styles.buttonLabel}>Back</span>
      </div>

      <div className={styles.labeledButton}>
        <motion.button
          id="step-button"
          className={styles.button}
          onClick={onStep}
          whileTap={{ scale: 0.95 }}
          disabled={isRunning && !isPaused}
          title="Execute one instruction"
        >
          <SkipForward size={18} className={styles.icon} />
        </motion.button>
        <span className={styles.buttonLabel}>Step</span>
      </div>
    </div>
  );
}
