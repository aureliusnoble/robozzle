import { useState } from 'react';
import { motion } from 'framer-motion';
import { Calendar, Library, User } from 'lucide-react';
import { DailyRanksTab, ClassicRanksTab, MyStatsTab } from '../components/leaderboard';
import { useAuthStore } from '../stores/authStore';
import styles from './Leaderboard.module.css';

type Tab = 'daily' | 'classic' | 'stats';

export function Leaderboard() {
  const [activeTab, setActiveTab] = useState<Tab>('daily');
  const { user, progress } = useAuthStore();

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Rankings</h1>
      </header>

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          className={`${styles.tab} ${activeTab === 'daily' ? styles.active : ''}`}
          onClick={() => setActiveTab('daily')}
        >
          <Calendar size={16} />
          Daily
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'classic' ? styles.active : ''}`}
          onClick={() => setActiveTab('classic')}
        >
          <Library size={16} />
          Classic
        </button>
        <button
          className={`${styles.tab} ${activeTab === 'stats' ? styles.active : ''}`}
          onClick={() => setActiveTab('stats')}
        >
          <User size={16} />
          My Stats
        </button>
      </div>

      {/* Content */}
      <div className={styles.content}>
        {activeTab === 'daily' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <DailyRanksTab currentUsername={user?.username} />
          </motion.div>
        )}

        {activeTab === 'classic' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <ClassicRanksTab currentUsername={user?.username} />
          </motion.div>
        )}

        {activeTab === 'stats' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <MyStatsTab user={user} progress={progress} />
          </motion.div>
        )}
      </div>
    </div>
  );
}
