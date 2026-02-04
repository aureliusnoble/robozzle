import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Loader2 } from 'lucide-react';
import type { PuzzleConfig, Program } from '../../engine/types';
import { getSkinImageById } from '../../data/skins';
import { Game } from './Game';
import styles from './SolutionViewer.module.css';

interface SolutionViewerProps {
  puzzle: PuzzleConfig;
  username: string;
  onLoadSolution: () => Promise<{ program: Program; selectedSkin: string } | null>;
  onClose: () => void;
}

export function SolutionViewer({
  puzzle,
  username,
  onLoadSolution,
  onClose,
}: SolutionViewerProps) {
  const [program, setProgram] = useState<Program | null>(null);
  const [skinImage, setSkinImage] = useState<string | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadSolution() {
      setIsLoading(true);
      setError(null);

      try {
        const result = await onLoadSolution();
        if (result) {
          setProgram(result.program);
          setSkinImage(getSkinImageById(result.selectedSkin));
        } else {
          setError('Failed to load solution');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load solution');
      } finally {
        setIsLoading(false);
      }
    }

    loadSolution();
  }, [onLoadSolution]);

  return (
    <AnimatePresence>
      <motion.div
        className={styles.overlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className={styles.modal}
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.header}>
            <h2 className={styles.title}>
              {username}'s Solution
            </h2>
            <button className={styles.closeButton} onClick={onClose}>
              <X size={20} />
            </button>
          </div>

          <div className={styles.content}>
            {isLoading && (
              <div className={styles.loading}>
                <Loader2 size={32} className={styles.spinner} />
                <p>Loading solution...</p>
              </div>
            )}

            {error && (
              <div className={styles.error}>
                <p>{error}</p>
                <button className={styles.retryButton} onClick={onClose}>
                  Close
                </button>
              </div>
            )}

            {!isLoading && !error && program && (
              <div className={styles.gameWrapper}>
                <p className={styles.readOnlyNotice}>
                  Read-only mode - press Play to watch the solution
                </p>
                <Game
                  puzzle={puzzle}
                  displayTitle={puzzle.title}
                  initialProgram={program}
                  readOnly={true}
                  skinImage={skinImage}
                />
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
