import { motion } from 'framer-motion';
import { Trophy, Medal } from 'lucide-react';
import type { LeaderboardEntry } from '../../engine/types';
import { formatTimeDiff } from '../../lib/scoring';
import styles from './DailyLeaderboard.module.css';

interface DailyLeaderboardProps {
  entries: LeaderboardEntry[];
  currentUsername?: string;
  isLoading?: boolean;
}

function getMedalColor(rank: number): string | null {
  switch (rank) {
    case 1: return '#FFD700'; // Gold
    case 2: return '#C0C0C0'; // Silver
    case 3: return '#CD7F32'; // Bronze
    default: return null;
  }
}

export function DailyLeaderboard({
  entries,
  currentUsername,
  isLoading,
}: DailyLeaderboardProps) {
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
          <p>No solutions yet today.</p>
          <p className={styles.emptySubtext}>Be the first to solve it!</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>Today's Leaderboard</h3>

      <div className={styles.header}>
        <span className={styles.headerRank}>#</span>
        <span className={styles.headerName}>Player</span>
        <span className={styles.headerInstr}>Instr</span>
        <span className={styles.headerSteps}>Steps</span>
        <span className={styles.headerTime}>Time</span>
      </div>

      <div className={styles.list}>
        {entries.map((entry, index) => {
          const isCurrentUser = entry.username === currentUsername;
          const medalColor = getMedalColor(entry.rank);

          return (
            <motion.div
              key={entry.username}
              className={`${styles.entry} ${isCurrentUser ? styles.currentUser : ''}`}
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
              </span>
              <span className={styles.instructions}>{entry.instructionsUsed}</span>
              <span className={styles.steps}>{entry.steps}</span>
              <span className={styles.time}>{formatTimeDiff(entry.completedAt)}</span>
            </motion.div>
          );
        })}
      </div>

      <div className={styles.footer}>
        <p className={styles.footerText}>
          Ranked by: Instructions (primary) → Steps → Time
        </p>
      </div>
    </div>
  );
}
