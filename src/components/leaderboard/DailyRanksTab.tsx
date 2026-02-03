import { motion } from 'framer-motion';
import { Calendar, Trophy, Medal } from 'lucide-react';
import { useMonthlyRankings } from '../../hooks/useMonthlyRankings';
import type { MonthlyDailyRankingEntry } from '../../engine/types';
import styles from './DailyRanksTab.module.css';

interface DailyRanksTabProps {
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

function RankingList({
  title,
  entries,
  currentUsername,
  icon,
}: {
  title: string;
  entries: MonthlyDailyRankingEntry[];
  currentUsername?: string;
  icon: React.ReactNode;
}) {
  if (entries.length === 0) {
    return (
      <div className={styles.listContainer}>
        <h3 className={styles.listTitle}>
          {icon}
          {title}
        </h3>
        <div className={styles.empty}>
          <p>No rankings yet this month</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.listContainer}>
      <h3 className={styles.listTitle}>
        {icon}
        {title}
      </h3>

      <div className={styles.header}>
        <span className={styles.headerRank}>#</span>
        <span className={styles.headerName}>Player</span>
        <span className={styles.headerPoints}>Points</span>
        <span className={styles.headerCompletions}>Days</span>
      </div>

      <div className={styles.list}>
        {entries.map((entry, index) => {
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
              <span className={styles.points}>{entry.totalPoints}</span>
              <span className={styles.completions}>{entry.completions}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

export function DailyRanksTab({ currentUsername }: DailyRanksTabProps) {
  const {
    selectedMonth,
    setSelectedMonth,
    easyRankings,
    challengeRankings,
    isLoading,
    availableMonths,
    formatMonth,
  } = useMonthlyRankings();

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Calendar size={24} />
          Monthly Daily Rankings
        </h2>
        <p className={styles.subtitle}>
          Points are awarded based on your final placement each day
        </p>
      </div>

      {/* Month selector */}
      <div className={styles.monthSelector}>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className={styles.monthSelect}
        >
          {availableMonths.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </select>
      </div>

      {isLoading ? (
        <div className={styles.loading}>Loading rankings...</div>
      ) : (
        <div className={styles.rankings}>
          <RankingList
            title="Easy Daily"
            entries={easyRankings}
            currentUsername={currentUsername}
            icon={<span className={styles.easyIcon}>E</span>}
          />
          <RankingList
            title="Challenge Daily"
            entries={challengeRankings}
            currentUsername={currentUsername}
            icon={<Trophy size={18} className={styles.challengeIcon} />}
          />
        </div>
      )}

      <div className={styles.footer}>
        <p>Points: 1st=100, 2nd=75, 3rd=60, 4th=50, 5th=45, 6th-10th=40-36, ...</p>
        <p>Only same-day submissions count towards monthly rankings</p>
      </div>
    </div>
  );
}
