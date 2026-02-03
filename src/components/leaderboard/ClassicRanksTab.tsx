import { motion } from 'framer-motion';
import { Library, Medal, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useClassicLeaderboard } from '../../hooks/useClassicLeaderboard';
import styles from './ClassicRanksTab.module.css';

interface ClassicRanksTabProps {
  currentUsername?: string;
}

function getMedalColor(rank: number): string | null {
  switch (rank) {
    case 1: return '#FFD700';
    case 2: return '#C0C0C0';
    case 3: return '#CD7F32';
    default: return null;
  }
}

function MovementIndicator({ movement }: { movement: number | null }) {
  if (movement === null) {
    return <span className={styles.movementNew}>NEW</span>;
  }

  if (movement === 0) {
    return <Minus size={14} className={styles.movementStable} />;
  }

  if (movement > 0) {
    return (
      <span className={styles.movementUp}>
        <TrendingUp size={14} />
        {movement}
      </span>
    );
  }

  return (
    <span className={styles.movementDown}>
      <TrendingDown size={14} />
      {Math.abs(movement)}
    </span>
  );
}

export function ClassicRanksTab({ currentUsername }: ClassicRanksTabProps) {
  const { rankings, isLoading } = useClassicLeaderboard();

  return (
    <div className={styles.container}>
      <div className={styles.headerSection}>
        <h2 className={styles.title}>
          <Library size={24} />
          Classic Puzzle Rankings
        </h2>
        <p className={styles.subtitle}>
          Score based on puzzle difficulty and completion variety
        </p>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading rankings...</div>
      ) : rankings.length === 0 ? (
        <div className={styles.empty}>
          <p>No classic rankings yet</p>
          <p className={styles.emptyHint}>
            Complete classic puzzles to appear on the leaderboard
          </p>
        </div>
      ) : (
        <div className={styles.tableContainer}>
          <div className={styles.header}>
            <span className={styles.headerRank}>#</span>
            <span className={styles.headerName}>Player</span>
            <span className={styles.headerScore}>Score</span>
            <span className={styles.headerMovement}>Weekly</span>
          </div>

          <div className={styles.list}>
            {rankings.map((entry, index) => {
              const isCurrentUser = entry.username === currentUsername;
              const medalColor = getMedalColor(entry.rank);

              return (
                <motion.div
                  key={entry.userId}
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
                    {entry.username}
                    {isCurrentUser && <span className={styles.youBadge}>You</span>}
                  </span>
                  <span className={styles.score}>{entry.score.toFixed(1)}</span>
                  <span className={styles.movement}>
                    <MovementIndicator movement={entry.weeklyMovement} />
                  </span>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      <div className={styles.footer}>
        <div className={styles.formulaBox}>
          <h4>Scoring Formula</h4>
          <p>Score = S² × 10 × log₂(N+1) × penalty factor</p>
          <p className={styles.formulaNote}>
            S = star difficulty, N = puzzles at that level
          </p>
          <p className={styles.formulaNote}>
            Penalty reduces score if you've completed many easier puzzles
          </p>
        </div>
      </div>
    </div>
  );
}
