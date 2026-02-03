import { motion } from 'framer-motion';
import { Trophy, Medal, Eye } from 'lucide-react';
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

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Leaderboard</h3>

      <div className={styles.header}>
        <span className={styles.headerRank}>#</span>
        <span className={styles.headerName}>Player</span>
        <span className={styles.headerInstr}>Instr</span>
        <span className={styles.headerSteps}>Steps</span>
        <span className={styles.headerTime}>Time</span>
        {hasSubmitted && onViewSolution && (
          <span className={styles.headerAction}></span>
        )}
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
              {hasSubmitted && onViewSolution && (
                <span className={styles.action}>
                  {!isCurrentUser && (
                    <button
                      className={styles.viewButton}
                      onClick={() => onViewSolution(entry.userId, entry.username)}
                      title="View solution"
                    >
                      <Eye size={14} />
                    </button>
                  )}
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Ranked by: Instructions (primary) → Steps → Time
        </p>
        {!hasSubmitted && (
          <p className={styles.footerHint}>
            Submit your solution to view others
          </p>
        )}
      </div>
    </div>
  );
}
