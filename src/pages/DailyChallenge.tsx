import { useState, useCallback, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Calendar, Settings } from 'lucide-react';
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

  // Load specific date if provided in URL (for archive viewing)
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

  const isViewingArchive = !!dateParam;
  const today = new Date().toISOString().split('T')[0];
  const isToday = !dateParam || dateParam === today;

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

  // Show "no puzzle" state if no daily challenge exists (and not viewing archive)
  if (!dailyChallenge && !isViewingArchive) {
    return (
      <div className={styles.container}>
        <header className={styles.header}>
          <h1 className={styles.title}>Daily Challenge</h1>
          <div className={styles.headerActions}>
            <button
              className={styles.archiveButton}
              onClick={() => navigate('/daily/archive')}
            >
              <Calendar size={18} />
              <span>Archive</span>
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
        </header>
        <div className={styles.noPuzzle}>
          <div className={styles.noPuzzleIcon}>🎯</div>
          <h2>No Puzzle Today</h2>
          <p>Today's challenge hasn't been set yet.</p>
          <p className={styles.noPuzzleHint}>Check back soon or browse past challenges!</p>
          <button
            className={styles.browseArchiveButton}
            onClick={() => navigate('/daily/archive')}
          >
            Browse Archive
          </button>
        </div>
      </div>
    );
  }

  if (!dailyChallenge) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>:(</span>
          <h2>Challenge Not Found</h2>
          <p>This challenge doesn't exist.</p>
          <button
            className={styles.browseArchiveButton}
            onClick={() => navigate('/daily')}
          >
            Back to Today
          </button>
        </div>
      </div>
    );
  }

  const displayDate = new Date(dailyChallenge.date + 'T12:00:00');
  const formattedDate = displayDate.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <div className={styles.headerMain}>
          <h1 className={styles.title}>Daily Challenge</h1>
          <p className={styles.date}>{isToday ? 'Today' : formattedDate}</p>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.archiveButton}
            onClick={() => navigate('/daily/archive')}
          >
            <Calendar size={18} />
            <span>Archive</span>
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
      </header>

      {/* Viewing archive notice */}
      {isViewingArchive && (
        <div className={styles.archiveNotice}>
          <span>Viewing past challenge</span>
          <button onClick={() => navigate('/daily')}>Back to Today</button>
        </div>
      )}

      {/* Main content - game first, leaderboard below */}
      <div className={styles.content}>
        <div className={styles.gameSection}>
          <Game
            puzzle={dailyChallenge.puzzle}
            displayTitle="Daily Challenge"
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
