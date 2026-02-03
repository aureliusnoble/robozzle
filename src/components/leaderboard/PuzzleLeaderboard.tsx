import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Eye, Lock, X } from 'lucide-react';
import type { PuzzleLeaderboardEntry } from '../../engine/types';
import { formatTimeDiff } from '../../lib/scoring';
import styles from './PuzzleLeaderboard.module.css';

interface PuzzleLeaderboardProps {
  entries: PuzzleLeaderboardEntry[];
  currentUsername?: string;
  currentUserId?: string | null;
  hasSubmitted: boolean;
  isLoading?: boolean;
  onViewSolution?: (userId: string | null, username: string) => void;
}

function getMedalColor(rank: number): string | null {
  switch (rank) {
    case 1: return '#FFD700'; // Gold
    case 2: return '#C0C0C0'; // Silver
    case 3: return '#CD7F32'; // Bronze
    default: return null;
  }
}

export function PuzzleLeaderboard({
  entries,
  currentUsername,
  currentUserId,
  hasSubmitted,
  isLoading,
  onViewSolution,
}: PuzzleLeaderboardProps) {
  const [showLockedPopup, setShowLockedPopup] = useState(false);

  if (isLoading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading leaderboard...</div>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <Trophy size={40} className={styles.emptyIcon} />
          <p>No solutions yet.</p>
          <p className={styles.emptySubtext}>Be the first to solve it!</p>
        </div>
      </div>
    );
  }

  const handleViewClick = (userId: string | null, username: string, isCurrentUser: boolean) => {
    if (isCurrentUser) return;

    if (!hasSubmitted) {
      setShowLockedPopup(true);
      return;
    }

    onViewSolution?.(userId, username);
  };

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Leaderboard</h3>

      <div className={styles.header}>
        <span className={styles.headerRank}>#</span>
        <span className={styles.headerName}>Player</span>
        <span className={styles.headerInstr}>Instr</span>
        <span className={styles.headerSteps}>Steps</span>
        <span className={styles.headerTime}>Time</span>
        <span className={styles.headerAction}></span>
      </div>

      <div className={styles.list}>
        {entries.map((entry, index) => {
          const isCurrentUser = entry.userId === currentUserId ||
            (entry.username === currentUsername && entry.username !== 'Anonymous');
          const medalColor = getMedalColor(entry.rank);

          return (
            <motion.div
              key={`${entry.userId || 'anon'}-${index}`}
              className={`${styles.entry} ${isCurrentUser ? styles.currentUser : ''} ${entry.isLate ? styles.lateEntry : ''}`}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <span className={styles.rank}>
                {medalColor ? (
                  <Medal size={18} style={{ color: medalColor }} />
                ) : (
                  entry.rank
                )}
              </span>
              <span className={styles.name}>
                {entry.username}
                {isCurrentUser && <span className={styles.youBadge}>You</span>}
                {entry.isLate && <span className={styles.lateBadge}>Late</span>}
              </span>
              <span className={styles.instructions}>{entry.instructionsUsed}</span>
              <span className={styles.steps}>{entry.steps}</span>
              <span className={styles.time}>{formatTimeDiff(entry.submittedAt)}</span>
              <span className={styles.action}>
                {!isCurrentUser && (
                  <button
                    className={`${styles.viewButton} ${!hasSubmitted ? styles.viewButtonLocked : ''}`}
                    onClick={() => handleViewClick(entry.userId, entry.username, isCurrentUser)}
                    title={hasSubmitted ? 'View solution' : 'Submit to unlock'}
                  >
                    {hasSubmitted ? <Eye size={14} /> : <Lock size={14} />}
                  </button>
                )}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Ranked by: Instructions → Steps → Time
        </p>
      </div>

      {/* Locked popup */}
      <AnimatePresence>
        {showLockedPopup && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowLockedPopup(false)}
          >
            <motion.div
              className={styles.popup}
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.popupClose}
                onClick={() => setShowLockedPopup(false)}
              >
                <X size={18} />
              </button>
              <Lock size={32} className={styles.popupIcon} />
              <h4 className={styles.popupTitle}>Solutions Locked</h4>
              <p className={styles.popupText}>
                Submit your solution to this puzzle to view other players' solutions.
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
