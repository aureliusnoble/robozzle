import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Bot, Calendar, BookOpen, Gamepad2, Flame, ChevronRight, Download } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import styles from './Home.module.css';

export function Home() {
  const { user, isAuthenticated } = useAuthStore();
  const { canInstall, promptInstall } = useInstallPrompt();

  return (
    <div className={styles.container}>
      {/* Hero section */}
      <section className={styles.hero}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <Bot size={64} className={styles.heroIcon} />
          <h1 className={styles.heroTitle}>RoboZZle</h1>
          <p className={styles.heroSubtitle}>
            Program your robot. Collect all stars. Challenge your brain.
          </p>
        </motion.div>
      </section>

      {/* Quick actions */}
      <section className={styles.actions}>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Link to="/daily" className={styles.primaryAction}>
            <Calendar size={24} className={styles.actionIcon} />
            <div className={styles.actionContent}>
              <span className={styles.actionTitle}>Daily Challenge</span>
              <span className={styles.actionDesc}>New puzzle every day</span>
            </div>
            <ChevronRight size={20} className={styles.actionArrow} />
          </Link>
        </motion.div>

        <div className={styles.secondaryActions}>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <Link to="/tutorial" className={styles.secondaryAction}>
              <BookOpen size={24} className={styles.actionIcon} />
              <div className={styles.actionContent}>
                <span className={styles.actionTitle}>Tutorial</span>
                <span className={styles.actionDesc}>Learn the basics</span>
              </div>
            </Link>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <Link to="/classic" className={styles.secondaryAction}>
              <Gamepad2 size={24} className={styles.actionIcon} />
              <div className={styles.actionContent}>
                <span className={styles.actionTitle}>Classic</span>
                <span className={styles.actionDesc}>1000+ puzzles</span>
              </div>
            </Link>
          </motion.div>
        </div>
      </section>

      {/* User stats or sign up prompt */}
      {isAuthenticated && user ? (
        <motion.section
          className={styles.stats}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className={styles.statsTitle}>Your Progress</h2>
          <div className={styles.statGrid}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{user.puzzlesSolved}</span>
              <span className={styles.statLabel}>Puzzles Solved</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                <Flame size={20} className={styles.streakIcon} />
                {user.currentStreak}
              </span>
              <span className={styles.statLabel}>Day Streak</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{user.totalPoints}</span>
              <span className={styles.statLabel}>Total Points</span>
            </div>
          </div>
        </motion.section>
      ) : (
        <motion.section
          className={styles.signUpPrompt}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <h2 className={styles.promptTitle}>Track Your Progress</h2>
          <p className={styles.promptText}>
            Sign up to save your solutions, compete on leaderboards, and build your streak.
          </p>
          <Link to="/auth" className={styles.signUpButton}>
            Create Free Account
          </Link>
        </motion.section>
      )}

      {/* How to play */}
      <motion.section
        className={styles.howToPlay}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.6 }}
      >
        <h2 className={styles.sectionTitle}>How to Play</h2>
        <div className={styles.steps}>
          <div className={styles.step}>
            <span className={styles.stepNumber}>1</span>
            <h3 className={styles.stepTitle}>Program the Robot</h3>
            <p className={styles.stepDesc}>
              Drag instructions into function slots to create a program.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>2</span>
            <h3 className={styles.stepTitle}>Use Loops & Conditions</h3>
            <p className={styles.stepDesc}>
              Functions can call themselves. Instructions can be conditional on tile color.
            </p>
          </div>
          <div className={styles.step}>
            <span className={styles.stepNumber}>3</span>
            <h3 className={styles.stepTitle}>Collect All Stars</h3>
            <p className={styles.stepDesc}>
              Run your program and watch the robot collect every star.
            </p>
          </div>
        </div>
      </motion.section>

      {/* Install app prompt */}
      {canInstall && (
        <motion.section
          className={styles.installPrompt}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <button className={styles.installButton} onClick={promptInstall}>
            <Download size={20} />
            Install App
          </button>
        </motion.section>
      )}
    </div>
  );
}
