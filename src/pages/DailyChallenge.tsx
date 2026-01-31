import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Settings, ChevronLeft, ChevronRight } from 'lucide-react';
import { Game } from '../components/game';
import { DailyLeaderboard } from '../components/leaderboard';
import { ShareModal } from '../components/share';
import { AuthModal } from '../components/auth';
import { useDailyPuzzle } from '../hooks/useDailyPuzzle';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { supabase } from '../lib/supabase';
import styles from './DailyChallenge.module.css';

export function DailyChallenge() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dateParam = searchParams.get('date');

  const { dailyChallenge, isLoadingDaily, leaderboard, userRank, hasCompleted, submitSolution, loadSpecificDate } = useDailyPuzzle();
  const { user, isAuthenticated } = useAuthStore();
  const { getProgram } = useGameStore();
  const [showShare, setShowShare] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [isDevUser, setIsDevUser] = useState(false);
  const [completedState, setCompletedState] = useState<{
    steps: number;
    instructions: number;
  } | null>(null);

  // Check if user has dev/admin access
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

  // Load specific date if provided in URL
  useEffect(() => {
    if (dateParam && loadSpecificDate) {
      loadSpecificDate(dateParam);
    }
  }, [dateParam, loadSpecificDate]);

  const handleComplete = useCallback(
    async (steps: number, instructions: number) => {
      setCompletedState({ steps, instructions });

      if (isAuthenticated && !hasCompleted && dailyChallenge) {
        const program = useGameStore.getState().getProgram();
        if (program) {
          await submitSolution(program, steps, instructions);
        }
      }
    },
    [isAuthenticated, hasCompleted, dailyChallenge, submitSolution]
  );

  // Navigate to previous/next day
  const navigateDay = (direction: 'prev' | 'next') => {
    const currentDate = dailyChallenge?.date || new Date().toISOString().split('T')[0];
    const date = new Date(currentDate + 'T12:00:00');
    date.setDate(date.getDate() + (direction === 'prev' ? -1 : 1));
    const newDate = date.toISOString().split('T')[0];
    const today = new Date().toISOString().split('T')[0];

    if (newDate <= today) {
      navigate(`/daily?date=${newDate}`);
    }
  };

  const isToday = !dateParam || dateParam === new Date().toISOString().split('T')[0];
  const canGoNext = !isToday;

  if (isLoadingDaily) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <p>Loading challenge...</p>
        </div>
      </div>
    );
  }

  if (!dailyChallenge) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>:(</span>
          <h2>No Challenge Today</h2>
          <p>Check back later for today's puzzle.</p>
        </div>
      </div>
    );
  }

  const displayDate = new Date(dailyChallenge.date + 'T12:00:00');
  const formattedDate = displayDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className={styles.container}>
      {/* Header with date navigation */}
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <h1 className={styles.title}>Daily Challenge</h1>
          <div className={styles.headerActions}>
            <button
              className={styles.iconButton}
              onClick={() => navigate('/daily/archive')}
              title="Archive"
            >
              <Calendar size={20} />
            </button>
            {isDevUser && (
              <button
                className={`${styles.iconButton} ${styles.devButton}`}
                onClick={() => navigate('/dev')}
                title="Dev Mode"
              >
                <Settings size={20} />
              </button>
            )}
          </div>
        </div>

        <div className={styles.dateNav}>
          <button
            className={styles.navArrow}
            onClick={() => navigateDay('prev')}
            title="Previous day"
          >
            <ChevronLeft size={20} />
          </button>
          <span className={`${styles.date} ${!isToday ? styles.pastDate : ''}`}>
            {isToday ? 'Today' : formattedDate}
          </span>
          <button
            className={`${styles.navArrow} ${!canGoNext ? styles.disabled : ''}`}
            onClick={() => canGoNext && navigateDay('next')}
            disabled={!canGoNext}
            title="Next day"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        {!isToday && (
          <button
            className={styles.todayButton}
            onClick={() => navigate('/daily')}
          >
            Jump to Today
          </button>
        )}
      </header>

      {/* Main content */}
      <div className={styles.content}>
        <div className={styles.gameSection}>
          {/* Puzzle info card */}
          <div className={styles.puzzleInfo}>
            <span className={styles.puzzleTitle}>{dailyChallenge.puzzle.title}</span>
            {(dailyChallenge.puzzle as any).profileName && (
              <span className={styles.puzzleProfile}>{(dailyChallenge.puzzle as any).profileName}</span>
            )}
          </div>

          <Game
            puzzle={dailyChallenge.puzzle}
            onComplete={handleComplete}
            onShare={completedState ? () => setShowShare(true) : undefined}
          />

          {/* Completion state */}
          {completedState && (
            <div className={styles.completionCard}>
              {hasCompleted && userRank ? (
                <div className={styles.rankDisplay}>
                  <span className={styles.rankLabel}>Your Rank</span>
                  <span className={styles.rankValue}>#{userRank}</span>
                </div>
              ) : !isAuthenticated ? (
                <button
                  className={styles.signInButton}
                  onClick={() => setShowAuth(true)}
                >
                  Sign in to save your score
                </button>
              ) : null}
            </div>
          )}
        </div>

        <div className={styles.leaderboardSection}>
          <DailyLeaderboard
            entries={leaderboard}
            currentUsername={user?.username}
          />
        </div>
      </div>

      {/* Share Modal */}
      {dailyChallenge && completedState && (
        <ShareModal
          isOpen={showShare}
          onClose={() => setShowShare(false)}
          puzzle={dailyChallenge.puzzle}
          program={getProgram() || undefined}
          stats={completedState}
          category="daily"
          date={dailyChallenge.date}
        />
      )}

      {/* Auth Modal */}
      <AuthModal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
      />
    </div>
  );
}
