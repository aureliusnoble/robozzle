import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, BookOpen, Library, Trophy, Bot, Flame, Star, Code } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import { FlyingStars } from './FlyingStars';
import { StreakAnimation } from './StreakAnimation';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, isAuthenticated, signOut, devModeEnabled, toggleDevMode, pendingStarAnimation, starsAnimatedSoFar, lastClassicStarsDate } = useAuthStore();

  const hasDevRole = user?.role === 'admin' || user?.role === 'dev';

  // Check if user completed a daily today (for lit flame effect)
  const today = new Date().toISOString().split('T')[0];
  const hasCompletedDailyToday = user?.lastDailyDate === today;
  const hasEarnedStarsToday = lastClassicStarsDate === today;

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/daily', label: 'Daily', icon: Calendar },
    { path: '/tutorial', label: 'Learn', icon: BookOpen },
    { path: '/classic', label: 'Classic', icon: Library },
    { path: '/leaderboard', label: 'Ranks', icon: Trophy },
  ];

  return (
    <div className={styles.layout}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <Link to="/" className={styles.logo}>
            <Bot className={styles.logoIcon} size={28} />
          </Link>
          {isAuthenticated && user && (
            <>
              <span className={styles.username}>{user.username}</span>
              {hasDevRole && (
                <button
                  className={`${styles.devBadge} ${!devModeEnabled ? styles.devBadgeDisabled : ''}`}
                  onClick={toggleDevMode}
                  title={devModeEnabled ? 'Dev mode ON - click to view as regular user' : 'Dev mode OFF - click to enable'}
                >
                  <Code size={12} />
                </button>
              )}
            </>
          )}
        </div>

        <div className={styles.headerRight}>
          {isAuthenticated && user ? (
            <div className={styles.userMenu}>
              <span id="header-star-counter" className={styles.stars} title="Total stars from classic puzzles">
                <Star
                  id="header-star-icon"
                  size={14}
                  className={styles.starsIcon}
                  fill={hasEarnedStarsToday ? 'currentColor' : 'none'}
                />
                {(user.classicStars || 0) - (pendingStarAnimation || 0) + starsAnimatedSoFar}
              </span>
              <span
                id="header-streak-counter"
                className={`${styles.streak} ${hasCompletedDailyToday ? styles.streakLit : ''}`}
                title="Current streak"
              >
                <Flame
                  size={14}
                  className={styles.streakIcon}
                  fill={hasCompletedDailyToday ? 'currentColor' : 'none'}
                />
                {user.currentStreak}
              </span>
              <button className={styles.signOutButton} onClick={signOut}>
                Sign Out
              </button>
            </div>
          ) : (
            <Link to="/auth" className={styles.signInLink}>
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* Main content */}
      <main className={styles.main}>{children}</main>

      {/* Bottom navigation (mobile) */}
      <nav className={styles.bottomNav}>
        {navItems.map(item => {
          const isActive = location.pathname === item.path;
          const IconComponent = item.icon;
          return (
            <Link
              key={item.path}
              to={item.path}
              className={`${styles.navItem} ${isActive ? styles.active : ''}`}
            >
              <IconComponent size={20} className={styles.navIcon} />
              <span className={styles.navLabel}>{item.label}</span>
              {isActive && (
                <motion.div
                  className={styles.navIndicator}
                  layoutId="navIndicator"
                />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Flying stars animation */}
      <FlyingStars />

      {/* Streak fire animation */}
      <StreakAnimation />
    </div>
  );
}
