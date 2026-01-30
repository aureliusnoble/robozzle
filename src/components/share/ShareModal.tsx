import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, PuzzleConfig } from '../../engine/types';
import { generateShareText, shareResult, copyToClipboard } from '../../lib/shareGenerator';
import styles from './ShareModal.module.css';

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzle: PuzzleConfig;
  gameState: GameState;
  instructionsUsed: number;
  date: string;
  rank?: number;
}

export function ShareModal({
  isOpen,
  onClose,
  puzzle,
  gameState,
  instructionsUsed,
  date,
  rank,
}: ShareModalProps) {
  const [copied, setCopied] = useState(false);
  const shareText = generateShareText(puzzle, gameState, instructionsUsed, date, rank);

  const handleShare = async () => {
    const success = await shareResult(shareText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleCopy = async () => {
    const success = await copyToClipboard(shareText);
    if (success) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className={styles.overlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={styles.modal}
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
          >
            <div className={styles.header}>
              <h2 className={styles.title}>Share Your Result</h2>
              <button className={styles.closeButton} onClick={onClose}>
                ✕
              </button>
            </div>

            <div className={styles.preview}>
              <pre className={styles.shareText}>{shareText}</pre>
            </div>

            <div className={styles.actions}>
              <button className={styles.shareButton} onClick={handleShare}>
                {'share' in navigator ? '📤 Share' : '📋 Copy'}
              </button>
              {'share' in navigator && (
                <button className={styles.copyButton} onClick={handleCopy}>
                  📋 Copy
                </button>
              )}
            </div>

            <AnimatePresence>
              {copied && (
                <motion.div
                  className={styles.copiedMessage}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                >
                  Copied to clipboard!
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
