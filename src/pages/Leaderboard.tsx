import { useState } from 'react';
import { motion } from 'framer-motion';
import { Bot, Flame } from 'lucide-react';
import { AllTimeLeaderboard } from '../components/leaderboard';
import { useLeaderboard, useUserStats } from '../hooks/useLeaderboard';
import { useAuthStore } from '../stores/authStore';
import styles from './Leaderboard.module.css';

type Tab = 'allTime' | 'stats';

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<Tab>('allTime');
  const { allTimeLeaderboard, isLoading } = useLeaderboard();
  const { user, isAuthenticated } = useAuthStore();
  const userStats = useUserStats(user?.id || null);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Leaderboard</h1>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'allTime' ? styles.active : ''}`}
          onClick={() => setActiveTab('allTime')}
        >
          All-Time
        </button>
        {isAuthenticated && (
          <button
            className={`${styles.tab} ${activeTab === 'stats' ? styles.active : ''}`}
            onClick={() => setActiveTab('stats')}
          >
            My Stats
          </button>
        )}
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'allTime' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <AllTimeLeaderboard
              entries={allTimeLeaderboard}
              currentUsername={user?.username}
              isLoading={isLoading}
            />
          </motion.div>
        )}

        {activeTab === 'stats' && isAuthenticated && user && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={styles.statsContainer}
          >
            {/* User profile card */}
            <div className={styles.profileCard}>
              <div className={styles.profileHeader}>
                <Bot size={40} className={styles.profileAvatar} />
                <div className={styles.profileInfo}>
                  <h2 className={styles.profileName}>{user.username}</h2>
                  <p className={styles.profileJoined}>
                    Joined {new Date(user.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <div className={styles.profileStats}>
                <div className={styles.profileStat}>
                  <span className={styles.profileStatValue}>{user.totalPoints}</span>
                  <span className={styles.profileStatLabel}>Total Points</span>
                </div>
                <div className={styles.profileStat}>
                  <span className={styles.profileStatValue}>{user.puzzlesSolved}</span>
                  <span className={styles.profileStatLabel}>Puzzles Solved</span>
                </div>
                <div className={styles.profileStat}>
                  <span className={styles.profileStatValue}>
                    <Flame size={18} className={styles.streakIcon} />
                    {user.currentStreak}
                  </span>
                  <span className={styles.profileStatLabel}>Current Streak</span>
                </div>
                <div className={styles.profileStat}>
                  <span className={styles.profileStatValue}>{user.longestStreak}</span>
                  <span className={styles.profileStatLabel}>Best Streak</span>
                </div>
              </div>
            </div>

            {/* Detailed stats */}
            {userStats && (
              <div className={styles.detailedStats}>
                <h3 className={styles.sectionTitle}>Performance</h3>
                <div className={styles.statGrid}>
                  <div className={styles.statCard}>
                    <span className={styles.statCardValue}>{userStats.totalSolutions}</span>
                    <span className={styles.statCardLabel}>Solutions Submitted</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statCardValue}>{userStats.averageInstructions}</span>
                    <span className={styles.statCardLabel}>Avg Instructions</span>
                  </div>
                  <div className={styles.statCard}>
                    <span className={styles.statCardValue}>{userStats.averageSteps}</span>
                    <span className={styles.statCardLabel}>Avg Steps</span>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
