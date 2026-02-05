import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Star, Target, Calendar, Check, ChevronRight, Settings, Info } from 'lucide-react';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { useDailyLeaderboards } from '../hooks/useDailyLeaderboards';
import { DailyLeaderboard } from '../components/leaderboard';
import { supabase } from '../lib/supabase';
import styles from './Daily.module.css';

export function Daily() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { progress } = useAuthStore();
  const { loadBothDailyChallenges, dailyEasyChallenge, dailyChallengeChallenge, isLoadingDaily } = usePuzzleStore();
  const [activeTab, setActiveTab] = useState<'easy' | 'challenge'>('easy');
  const [isDevUser, setIsDevUser] = useState(false);
  const [hasCompletedHardPuzzle, setHasCompletedHardPuzzle] = useState(true); // Default true to avoid flash
  const { easyLeaderboard, challengeLeaderboard, isLoading: isLoadingLeaderboards } = useDailyLeaderboards();

  // Load both challenges on mount
  useEffect(() => {
    loadBothDailyChallenges();
  }, [loadBothDailyChallenges]);

  // Check if user has completed a hard puzzle (for difficulty note)
  useEffect(() => {
    const localFlag = localStorage.getItem('robozzle-completed-hard-puzzle') === 'true';
    const profileFlag = (user?.hardestPuzzleStars ?? 0) >= 5;
    const hasDailySolves = (progress?.dailySolved?.length ?? 0) > 0;
    setHasCompletedHardPuzzle(localFlag || profileFlag || hasDailySolves);
  }, [user?.hardestPuzzleStars, progress?.dailySolved]);

  // Check dev access
  useEffect(() => {
    async function checkDevAccess() {
      if (!user) {
        setIsDevUser(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (!error && data) {
          const role = data.role as string | undefined;
          setIsDevUser(role === 'admin' || role === 'dev');
        }
      } catch {
        setIsDevUser(false);
      }
    }

    checkDevAccess();
  }, [user]);

  // Check completion status
  const today = new Date().toISOString().split('T')[0];
  const easyCompleted = progress?.dailySolved?.includes(`${today}:easy`) || false;
  const challengeCompleted = progress?.dailySolved?.includes(`${today}:challenge`) ||
    progress?.dailySolved?.includes(today) || false; // Legacy support

  // Format today's date
  const displayDate = new Date();
  const formattedDate = displayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (isLoadingDaily) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <p>Loading challenges...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Daily Challenges</h1>
          <p className={styles.date}>{formattedDate}</p>
        </div>
        <div className={styles.headerActions}>
          {isDevUser && (
            <button
              className={styles.devButton}
              onClick={() => navigate('/dev')}
              title="Dev Mode"
            >
              <Settings size={20} />
            </button>
          )}
        </div>
      </header>

      {/* Difficulty Note */}
      {!hasCompletedHardPuzzle && (
        <div className={styles.difficultyNote}>
          <Info size={18} className={styles.difficultyNoteIcon} />
          <p>
            Daily puzzles can be tricky! If you're new, try some{' '}
            <button className={styles.difficultyNoteLink} onClick={() => navigate('/classic')}>
              Classic puzzles
            </button>{' '}
            first to build your skills.
          </p>
        </div>
      )}

      {/* Puzzle Cards */}
      <div className={styles.puzzleCards}>
        <button
          className={`${styles.puzzleCard} ${styles.easyCard} ${easyCompleted ? styles.completed : ''}`}
          onClick={() => navigate('/daily/easy')}
          disabled={!dailyEasyChallenge}
        >
          <div className={styles.cardIcon}>
            <Star size={28} />
          </div>
          <h2 className={styles.cardTitle}>Easy</h2>
          <p className={styles.cardSubtitle}>Perfect for warming up</p>
          <div className={styles.cardStatus}>
            {!dailyEasyChallenge ? (
              <span className={styles.notAvailable}>Not Available</span>
            ) : easyCompleted ? (
              <span className={styles.doneStatus}><Check size={16} /> Done</span>
            ) : (
              <span className={styles.playStatus}>Play <ChevronRight size={16} /></span>
            )}
          </div>
        </button>

        <button
          className={`${styles.puzzleCard} ${styles.challengeCard} ${challengeCompleted ? styles.completed : ''}`}
          onClick={() => navigate('/daily/challenge')}
          disabled={!dailyChallengeChallenge}
        >
          <div className={styles.cardIcon}>
            <Target size={28} />
          </div>
          <h2 className={styles.cardTitle}>Challenge</h2>
          <p className={styles.cardSubtitle}>Test your skills</p>
          <div className={styles.cardStatus}>
            {!dailyChallengeChallenge ? (
              <span className={styles.notAvailable}>Not Available</span>
            ) : challengeCompleted ? (
              <span className={styles.doneStatus}><Check size={16} /> Done</span>
            ) : (
              <span className={styles.playStatus}>Play <ChevronRight size={16} /></span>
            )}
          </div>
        </button>
      </div>

      {/* Tabbed Leaderboard */}
      <section className={styles.leaderboardSection}>
        <h2 className={styles.sectionTitle}>Today's Leaderboard</h2>
        <div className={styles.tabs}>
          <button
            className={`${styles.tab} ${activeTab === 'easy' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('easy')}
          >
            Easy
          </button>
          <button
            className={`${styles.tab} ${activeTab === 'challenge' ? styles.activeTab : ''}`}
            onClick={() => setActiveTab('challenge')}
          >
            Challenge
          </button>
        </div>
        <DailyLeaderboard
          entries={activeTab === 'easy' ? easyLeaderboard : challengeLeaderboard}
          currentUsername={user?.username}
          isLoading={isLoadingLeaderboards}
        />
      </section>

      {/* Archive Link */}
      <button className={styles.archiveButton} onClick={() => navigate('/daily/archive')}>
        <Calendar size={20} />
        <span>Browse Archive</span>
      </button>
    </div>
  );
}
