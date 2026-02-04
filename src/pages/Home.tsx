import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Calendar, BookOpen, Gamepad2, Flame, ChevronRight, Download, Palette, X, Sparkles, LogIn } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { supabase } from '../lib/supabase';
import styles from './Home.module.css';

export function Home() {
  const navigate = useNavigate();
  const { user, isAuthenticated, progress, isDevUser } = useAuthStore();
  const { canInstall, promptInstall } = useInstallPrompt();
  const [classicScore, setClassicScore] = useState<number | null>(null);
  const [showSignInPopup, setShowSignInPopup] = useState(false);
  const [showComingSoonPopup, setShowComingSoonPopup] = useState(false);

  const devModeActive = isDevUser();

  // Check if user completed a daily today (for lit flame effect)
  const today = new Date().toISOString().split('T')[0];
  const hasCompletedDailyToday = user?.lastDailyDate === today;

  // Fetch user's classic score
  useEffect(() => {
    if (!user?.id) {
      setClassicScore(null);
      return;
    }

    const fetchScore = async () => {
      const { data } = await supabase
        .from('classic_rankings')
        .select('score')
        .eq('user_id', user.id)
        .single();

      setClassicScore(data?.score ? parseFloat(data.score) : 0);
    };

    fetchScore();
  }, [user?.id]);

  // Calculate puzzles solved from progress
  const puzzlesSolved = (progress?.classicSolved?.length || 0) + (progress?.dailySolved?.length || 0);

  const handleCustomizeClick = () => {
    if (!isAuthenticated) {
      setShowSignInPopup(true);
    } else if (devModeActive) {
      navigate('/shop');
    } else {
      setShowComingSoonPopup(true);
    }
  };

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

      {/* Customize Your Robot */}
      <motion.section
        className={styles.customizeSection}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.45 }}
      >
        <button className={styles.customizeButton} onClick={handleCustomizeClick}>
          <Palette size={24} className={styles.customizeIcon} />
          <div className={styles.customizeContent}>
            <span className={styles.customizeTitle}>Customize Your Robot</span>
            <span className={styles.customizeDesc}>Unlock new looks with your stars</span>
          </div>
          <ChevronRight size={20} className={styles.customizeArrow} />
        </button>
      </motion.section>

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
              <span className={styles.statValue}>{puzzlesSolved}</span>
              <span className={styles.statLabel}>Puzzles Solved</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                <Flame
                  size={20}
                  className={hasCompletedDailyToday ? styles.streakIconLit : styles.streakIcon}
                  fill={hasCompletedDailyToday ? 'currentColor' : 'none'}
                />
                {user.currentStreak}
              </span>
              <span className={styles.statLabel}>Day Streak</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>
                {classicScore !== null ? Math.round(classicScore) : '-'}
              </span>
              <span className={styles.statLabel}>Classic Score</span>
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

      {/* Sign In Required Popup */}
      <AnimatePresence>
        {showSignInPopup && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSignInPopup(false)}
          >
            <motion.div
              className={styles.popupContent}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.popupClose}
                onClick={() => setShowSignInPopup(false)}
              >
                <X size={20} />
              </button>
              <LogIn size={48} className={styles.popupIcon} />
              <h3>Sign In Required</h3>
              <p>Create an account or sign in to customize your robot and track your progress!</p>
              <Link
                to="/auth"
                className={styles.popupButton}
                onClick={() => setShowSignInPopup(false)}
              >
                Sign In
              </Link>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Coming Soon Popup */}
      <AnimatePresence>
        {showComingSoonPopup && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowComingSoonPopup(false)}
          >
            <motion.div
              className={styles.popupContent}
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className={styles.popupClose}
                onClick={() => setShowComingSoonPopup(false)}
              >
                <X size={20} />
              </button>
              <Sparkles size={48} className={styles.popupIcon} />
              <h3>Coming Soon!</h3>
              <p>Robot customization is still in development. Check back later to unlock new skins with your earned stars!</p>
              <button
                className={styles.popupButton}
                onClick={() => setShowComingSoonPopup(false)}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Credit */}
      <footer className={styles.credit}>
        Based on the original RoboZZle game by Igor Ostrovsky
      </footer>
    </div>
  );
}
