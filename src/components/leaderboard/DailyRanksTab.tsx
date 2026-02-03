import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Trophy, Medal, Sparkles, ChevronLeft, ChevronRight } from 'lucide-react';
import { useMonthlyRankings } from '../../hooks/useMonthlyRankings';
import type { MonthlyDailyRankingEntry } from '../../engine/types';
import styles from './DailyRanksTab.module.css';

interface DailyRanksTabProps {
  currentUsername?: string;
}

type ChallengeTab = 'easy' | 'challenge';

function getMedalColor(rank: number): string | null {
  switch (rank) {
    case 1: return '#FFD700';
    case 2: return '#C0C0C0';
    case 3: return '#CD7F32';
    default: return null;
  }
}

function RankingList({
  entries,
  currentUsername,
}: {
  entries: MonthlyDailyRankingEntry[];
  currentUsername?: string;
}) {
  if (entries.length === 0) {
    return (
      <div className={styles.empty}>
        <Trophy size={40} className={styles.emptyIcon} />
        <p>No rankings yet this month</p>
      </div>
    );
  }

  return (
    <>
      <div className={styles.listHeader}>
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
    </>
  );
}

export function DailyRanksTab({ currentUsername }: DailyRanksTabProps) {
  const [activeTab, setActiveTab] = useState<ChallengeTab>('easy');
  const {
    selectedMonth,
    setSelectedMonth,
    easyRankings,
    challengeRankings,
    isLoading,
    availableMonths,
    formatMonth,
  } = useMonthlyRankings();

  const currentRankings = activeTab === 'easy' ? easyRankings : challengeRankings;

  // Get current month index for navigation
  const currentMonthIndex = availableMonths.indexOf(selectedMonth);
  const canGoBack = currentMonthIndex < availableMonths.length - 1;
  const canGoForward = currentMonthIndex > 0;

  const goToPreviousMonth = () => {
    if (canGoBack) {
      setSelectedMonth(availableMonths[currentMonthIndex + 1]);
    }
  };

  const goToNextMonth = () => {
    if (canGoForward) {
      setSelectedMonth(availableMonths[currentMonthIndex - 1]);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <Calendar size={24} />
          Monthly Rankings
        </h2>
      </div>

      {/* Month selector with arrows */}
      <div className={styles.monthSelector}>
        <button
          className={styles.monthNav}
          onClick={goToPreviousMonth}
          disabled={!canGoBack}
          aria-label="Previous month"
        >
          <ChevronLeft size={20} />
        </button>
        <span className={styles.monthLabel}>{formatMonth(selectedMonth)}</span>
        <button
          className={styles.monthNav}
          onClick={goToNextMonth}
          disabled={!canGoForward}
          aria-label="Next month"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* Challenge type tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'easy' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('easy')}
        >
          <Sparkles size={16} />
          Easy
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'challenge' ? styles.tabActive : ''}`}
          onClick={() => setActiveTab('challenge')}
        >
          <Trophy size={16} />
          Challenge
        </button>
      </div>

      {/* Rankings list */}
      <div className={styles.listContainer}>
        {isLoading ? (
          <div className={styles.loading}>Loading rankings...</div>
        ) : (
          <RankingList
            entries={currentRankings}
            currentUsername={currentUsername}
          />
        )}
      </div>

      <div className={styles.footer}>
        <p>Finishing higher each day grants more points</p>
        <p className={styles.footerNote}>Rankings update at end of day</p>
      </div>
    </div>
  );
}
