import { useState, useCallback } from 'react';
import { Game } from '../components/game';
import { DailyLeaderboard } from '../components/leaderboard';
import { ShareModal } from '../components/share';
import { AuthModal } from '../components/auth';
import { useDailyPuzzle } from '../hooks/useDailyPuzzle';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import styles from './DailyChallenge.module.css';

export function DailyChallenge() {
  const { dailyChallenge, isLoadingDaily, leaderboard, userRank, hasCompleted, submitSolution } = useDailyPuzzle();
  const { user, isAuthenticated } = useAuthStore();
  const { gameState } = useGameStore();
  const [showShare, setShowShare] = useState(false);
  const [showAuth, setShowAuth] = useState(false);
  const [completedState, setCompletedState] = useState<{
    steps: number;
    instructions: number;
  } | null>(null);

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

  if (isLoadingDaily) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading today's challenge...</div>
      </div>
    );
  }

  if (!dailyChallenge) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          <span className={styles.errorIcon}>😕</span>
          <h2>No Challenge Today</h2>
          <p>Check back later for today's puzzle.</p>
        </div>
      </div>
    );
  }

  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Daily Challenge</h1>
        <p className={styles.date}>{today}</p>
      </header>

      <div className={styles.content}>
        <div className={styles.gameSection}>
          <Game
            puzzle={dailyChallenge.puzzle}
            onComplete={handleComplete}
          />

          {/* Completion actions */}
          {completedState && (
            <div className={styles.completionActions}>
              {!isAuthenticated && (
                <button
                  className={styles.signInButton}
                  onClick={() => setShowAuth(true)}
                >
                  Sign in to save your score
                </button>
              )}
              <button
                className={styles.shareButton}
                onClick={() => setShowShare(true)}
              >
                📤 Share Result
              </button>
            </div>
          )}

          {hasCompleted && userRank && (
            <div className={styles.yourResult}>
              <span className={styles.resultLabel}>Your Rank</span>
              <span className={styles.resultValue}>#{userRank}</span>
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
      {dailyChallenge && gameState && completedState && (
        <ShareModal
          isOpen={showShare}
          onClose={() => setShowShare(false)}
          puzzle={dailyChallenge.puzzle}
          gameState={gameState}
          instructionsUsed={completedState.instructions}
          date={dailyChallenge.date}
          rank={userRank || undefined}
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
