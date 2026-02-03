import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Calendar, BookOpen, Library, Trophy, Bot, Flame, Star, Code } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore';
import styles from './Layout.module.css';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const location = useLocation();
  const { user, isAuthenticated, signOut } = useAuthStore();

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
              {(user.role === 'dev' || user.role === 'admin') && (
                <span className={styles.devBadge} title="Developer">
                  <Code size={12} />
                </span>
              )}
            </>
          )}
        </div>

        <div className={styles.headerRight}>
          {isAuthenticated && user ? (
            <div className={styles.userMenu}>
              <span className={styles.stars} title="Total stars from classic puzzles">
                <Star size={14} className={styles.starsIcon} />
                {user.classicStars || 0}
              </span>
              <span className={styles.streak} title="Current streak">
                <Flame size={14} className={styles.streakIcon} />
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
    </div>
  );
}
