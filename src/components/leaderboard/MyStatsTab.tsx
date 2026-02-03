import { Star, Calendar, Flame, Trophy, Library, Award } from 'lucide-react';
import type { UserProfile, UserProgress } from '../../engine/types';
import styles from './MyStatsTab.module.css';

interface MyStatsTabProps {
  user: UserProfile | null;
  progress: UserProgress | null;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function StatCard({
  icon,
  label,
  value,
  subValue,
  color = '#6366F1',
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statIcon} style={{ color }}>
        {icon}
      </div>
      <div className={styles.statContent}>
        <span className={styles.statValue}>{value}</span>
        <span className={styles.statLabel}>{label}</span>
        {subValue && <span className={styles.statSubValue}>{subValue}</span>}
      </div>
    </div>
  );
}

export function MyStatsTab({ user, progress }: MyStatsTabProps) {
  if (!user) {
    return (
      <div className={styles.container}>
        <div className={styles.notLoggedIn}>
          <Trophy size={48} className={styles.notLoggedInIcon} />
          <h3>Sign in to view your stats</h3>
          <p>Track your progress, streaks, and rankings</p>
        </div>
      </div>
    );
  }

  const classicSolvedCount = progress?.classicSolved?.length || 0;
  const dailySolvedCount = progress?.dailySolved?.length || 0;

  return (
    <div className={styles.container}>
      {/* Profile header */}
      <div className={styles.profileHeader}>
        <div className={styles.avatar}>
          {user.username.charAt(0).toUpperCase()}
        </div>
        <div className={styles.profileInfo}>
          <h2 className={styles.username}>{user.username}</h2>
          <p className={styles.joinDate}>
            <Calendar size={14} />
            Joined {formatDate(user.createdAt)}
          </p>
        </div>
      </div>

      {/* Stats grid */}
      <div className={styles.statsGrid}>
        {/* Classic stats */}
        <div className={styles.statsSection}>
          <h3 className={styles.sectionTitle}>
            <Library size={18} />
            Classic Puzzles
          </h3>
          <div className={styles.statsRow}>
            <StatCard
              icon={<Star size={24} />}
              label="Total Stars"
              value={user.classicStars || 0}
              color="#F59E0B"
            />
            <StatCard
              icon={<Library size={24} />}
              label="Puzzles Solved"
              value={classicSolvedCount}
              color="#6366F1"
            />
            <StatCard
              icon={<Award size={24} />}
              label="Hardest Completed"
              value={user.hardestPuzzleStars ? `${user.hardestPuzzleStars}★` : '-'}
              subValue="stars"
              color="#A855F7"
            />
          </div>
        </div>

        {/* Streak stats */}
        <div className={styles.statsSection}>
          <h3 className={styles.sectionTitle}>
            <Flame size={18} />
            Streaks
          </h3>
          <div className={styles.statsRow}>
            <StatCard
              icon={<Flame size={24} />}
              label="Current Streak"
              value={user.currentStreak || 0}
              subValue="days"
              color="#EF4444"
            />
            <StatCard
              icon={<Trophy size={24} />}
              label="Best Streak"
              value={user.longestStreak || 0}
              subValue="days"
              color="#22C55E"
            />
          </div>
        </div>

        {/* Daily stats */}
        <div className={styles.statsSection}>
          <h3 className={styles.sectionTitle}>
            <Calendar size={18} />
            Daily Challenges
          </h3>
          <div className={styles.statsRow}>
            <StatCard
              icon={<Calendar size={24} />}
              label="Days Completed"
              value={dailySolvedCount}
              color="#3B82F6"
            />
            <StatCard
              icon={<Trophy size={24} />}
              label="Best Easy Rank"
              value={user.bestDailyEasyRank || '-'}
              subValue={user.bestDailyEasyRank ? 'place' : ''}
              color="#22C55E"
            />
            <StatCard
              icon={<Trophy size={24} />}
              label="Best Challenge Rank"
              value={user.bestDailyChallengeRank || '-'}
              subValue={user.bestDailyChallengeRank ? 'place' : ''}
              color="#F59E0B"
            />
          </div>
        </div>

        {/* Overall stats */}
        <div className={styles.statsSection}>
          <h3 className={styles.sectionTitle}>
            <Star size={18} />
            Overall
          </h3>
          <div className={styles.statsRow}>
            <StatCard
              icon={<Star size={24} />}
              label="Total Points"
              value={user.totalPoints || 0}
              color="#6366F1"
            />
            <StatCard
              icon={<Trophy size={24} />}
              label="Total Solved"
              value={classicSolvedCount + dailySolvedCount}
              subValue="puzzles"
              color="#10B981"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
