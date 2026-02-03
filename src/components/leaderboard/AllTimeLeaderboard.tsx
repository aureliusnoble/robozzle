import { motion } from 'framer-motion';
import { Trophy, Medal, Flame } from 'lucide-react';
import styles from './AllTimeLeaderboard.module.css';

interface AllTimeEntry {
  rank: number;
  username: string;
  totalPoints: number;
  puzzlesSolved: number;
  currentStreak: number;
}

interface AllTimeLeaderboardProps {
  entries: AllTimeEntry[];
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

export function AllTimeLeaderboard({
  entries,
  currentUsername,
  isLoading,
}: AllTimeLeaderboardProps) {
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
          <p>No players yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>All-Time Leaderboard</h3>

      <div className={styles.header}>
        <span className={styles.headerRank}>#</span>
        <span className={styles.headerName}>Player</span>
        <span className={styles.headerPoints}>Points</span>
        <span className={styles.headerSolved}>Solved</span>
        <span className={styles.headerStreak}>Streak</span>
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
              transition={{ delay: index * 0.03 }}
            >
              <span className={styles.rank}>
                {medalColor ? (
                  <Medal size={18} style={{ color: medalColor }} />
                ) : (
                  entry.rank
                )}
              </span>
              <span className={styles.name}>
                <span className={styles.nameText}>{entry.username}</span>
                {isCurrentUser && <span className={styles.youBadge}>You</span>}
              </span>
              <span className={styles.points}>{entry.totalPoints.toLocaleString()}</span>
              <span className={styles.solved}>{entry.puzzlesSolved}</span>
              <span className={styles.streak}>
                {entry.currentStreak > 0 && <Flame size={14} className={styles.streakIcon} />}
                {entry.currentStreak}
              </span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
