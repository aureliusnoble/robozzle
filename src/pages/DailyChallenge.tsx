import { useState, useCallback, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Game, SolutionViewer } from '../components/game';
import { DailyLeaderboard } from '../components/leaderboard';
import { ShareModal } from '../components/share';
import { AuthModal } from '../components/auth';
import { useDailyPuzzle } from '../hooks/useDailyPuzzle';
import { useSavedPrograms } from '../hooks/useSavedPrograms';
import { useAuthStore } from '../stores/authStore';
import { getStreakAnimationDuration } from '../components/ui/StreakAnimation';
import { useGameStore } from '../stores/gameStore';
import type { Program } from '../engine/types';
import styles from './DailyChallenge.module.css';

export function DailyChallenge() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dateParam = searchParams.get('date');

  const { dailyChallenge, isLoadingDaily, leaderboard, userRank, hasCompleted, submitSolution, loadSpecificDate, loadSolution } = useDailyPuzzle('challenge');
  const { user, isAuthenticated, triggerStreakAnimation, updateStreakFromDaily } = useAuthStore();
  const { getProgram, setProgram: setGameProgram } = useGameStore();
  const [showShare, setShowShare] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [completedState, setCompletedState] = useState<{
    steps: number;
    instructions: number;
  } | null>(null);
  const [viewingSolution, setViewingSolution] = useState<{
    userId: string | null;
    username: string;
  } | null>(null);
  const [shouldAnimateStreak, setShouldAnimateStreak] = useState(false);

  // Ref for scrolling to leaderboard
  const leaderboardRef = useRef<HTMLDivElement>(null);

  // Date checks (needed before callbacks)
  const today = new Date().toISOString().split('T')[0];
  const isToday = !dateParam || dateParam === today;
  const isViewingArchive = !!dateParam;

  // Get puzzle ID for save/load
  // Derive from URL date param directly (not dailyChallenge.date) so it changes immediately on navigation
  const effectiveDate = dateParam || today;
  const puzzleId = `daily-${effectiveDate}-challenge`;

  // Save/Load hook
  const {
    savedSlots,
    latestProgram,
    saveProgram,
    loadProgram,
  } = useSavedPrograms(puzzleId);

  // Load specific date if provided in URL (for archive viewing)
  useEffect(() => {
    if (dateParam && loadSpecificDate) {
      loadSpecificDate(dateParam);
    }
  }, [dateParam, loadSpecificDate]);

  // Auto-save program when leaving the page
  useEffect(() => {
    return () => {
      const currentProgram = getProgram();
      if (currentProgram && puzzleId) {
        saveProgram(0, currentProgram); // Slot 0 = latest/auto-save
      }
    };
  }, [puzzleId, getProgram, saveProgram]);

  const handleComplete = useCallback(
    async (steps: number, instructions: number) => {
      // Track hard puzzle completion for difficulty note on Daily page
      localStorage.setItem('robozzle-completed-hard-puzzle', 'true');

      // Check if this is today's puzzle AND first completion today
      const isFirstCompletionToday = isToday && !hasCompleted && user?.lastDailyDate !== today;

      if (isFirstCompletionToday && dailyChallenge) {
        const result = await updateStreakFromDaily(dailyChallenge.date);
        if (result.isNewStreakDay) {
          setShouldAnimateStreak(true);
          triggerStreakAnimation();
        }
      }

      setCompletedState({ steps, instructions });
    },
    [isToday, hasCompleted, user?.lastDailyDate, today, dailyChallenge, updateStreakFromDaily, triggerStreakAnimation]
  );

  // Handle leaderboard submission (opt-in)
  const handleSubmit = useCallback(
    async (program: Program, steps: number, instructions: number) => {
      await submitSolution(program, steps, instructions);
    },
    [submitSolution]
  );

  // Handle view solutions button click (from victory modal)
  const handleViewSolutions = useCallback(() => {
    leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  // Handle save to slot
  const handleSave = useCallback((slot: number, program: Program) => {
    saveProgram(slot, program);
  }, [saveProgram]);

  // Handle load from slot
  const handleLoad = useCallback((slot: number): Program | null => {
    const loaded = loadProgram(slot);
    if (loaded) {
      setGameProgram(loaded);
    }
    return loaded;
  }, [loadProgram, setGameProgram]);

  // Handle viewing another user's solution
  const handleViewSolution = useCallback((userId: string | null, username: string) => {
    setViewingSolution({ userId, username });
  }, []);

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
          <div className={styles.headerMain}>
            <button className={styles.backButtonInline} onClick={() => navigate('/daily')}>
              <ArrowLeft size={20} />
            </button>
          </div>
        </header>
        <div className={styles.noPuzzle}>
          <div className={styles.noPuzzleIcon}>&#127919;</div>
          <h2>No Challenge Today</h2>
          <p>Today's challenge hasn't been set yet.</p>
          <p className={styles.noPuzzleHint}>Check back soon!</p>
          <button
            className={styles.browseArchiveButton}
            onClick={() => navigate('/daily')}
          >
            Back to Daily
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
            Back to Daily
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
          <button className={styles.backButtonInline} onClick={() => navigate('/daily')}>
            <ArrowLeft size={20} />
          </button>
          {!isToday && (
            <p className={styles.date}>{formattedDate}</p>
          )}
        </div>
      </header>

      {/* Viewing archive notice */}
      {isViewingArchive && (
        <div className={styles.archiveNotice}>
          <span>Viewing past challenge</span>
          <button onClick={() => navigate('/daily/challenge')}>Back to Today</button>
        </div>
      )}

      {/* Game */}
      <Game
        puzzle={dailyChallenge.puzzle}
        initialProgram={latestProgram || undefined}
        onComplete={handleComplete}
        onShare={completedState ? () => setShowShare(true) : undefined}
        hasSubmitted={hasCompleted}
        onSubmit={isAuthenticated ? handleSubmit : undefined}
        onViewSolutions={handleViewSolutions}
        savedSlots={savedSlots}
        onSave={handleSave}
        onLoad={handleLoad}
        victoryModalDelay={shouldAnimateStreak ? 1000 + getStreakAnimationDuration() : 1000}
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

      {/* Leaderboard */}
      <div ref={leaderboardRef}>
        <DailyLeaderboard
          entries={leaderboard}
          currentUsername={user?.username}
          currentUserId={user?.id}
          hasSubmitted={hasCompleted}
          onViewSolution={handleViewSolution}
        />
      </div>

      {/* Solution Viewer Modal */}
      {viewingSolution && dailyChallenge && (
        <SolutionViewer
          puzzle={dailyChallenge.puzzle}
          username={viewingSolution.username}
          onLoadSolution={() => loadSolution(viewingSolution.userId)}
          onClose={() => setViewingSolution(null)}
        />
      )}

      {/* Share Modal */}
      {dailyChallenge && completedState && (
        <ShareModal
          isOpen={showShare}
          onClose={() => setShowShare(false)}
          puzzle={dailyChallenge.puzzle}
          program={getProgram() || undefined}
          stats={completedState}
          category="daily"
          challengeType="challenge"
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
