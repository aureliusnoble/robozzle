import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { Check, GraduationCap, Lock, Calendar, Library } from 'lucide-react';
import { Game } from '../components/game';
import { OnboardingProvider } from '../components/onboarding';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import styles from './Tutorial.module.css';

export function Tutorial() {
  const { tutorials, loadTutorials } = usePuzzleStore();
  const { progress, updateProgress } = useAuthStore();
  const { completeTutorial } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState(1);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    loadTutorials();
  }, [loadTutorials]);

  // Set initial step based on progress - only on first load
  useEffect(() => {
    if (!initialLoadDone.current && tutorials.length > 0) {
      if (progress?.tutorialCompleted && progress.tutorialCompleted.length > 0) {
        const maxCompleted = Math.max(...progress.tutorialCompleted, 0);
        setCurrentStep(Math.min(maxCompleted + 1, tutorials.length));
      }
      initialLoadDone.current = true;
    }
  }, [progress, tutorials.length]);

  const currentPuzzle = tutorials.find(p => p.tutorialStep === currentStep);
  const completedCount = progress?.tutorialCompleted?.length || 0;
  const isCurrentCompleted = progress?.tutorialCompleted?.includes(currentStep);
  const maxAccessible = Math.max(...(progress?.tutorialCompleted || []), 0) + 1;

  const handleComplete = async () => {
    if (!isCurrentCompleted) {
      // Mark tutorial complete in onboarding store
      completeTutorial(currentStep);

      // Update progress
      const newCompleted = [...(progress?.tutorialCompleted || []), currentStep];
      await updateProgress({ tutorialCompleted: newCompleted });
    }
  };

  const handleNextTutorial = () => {
    if (currentStep < tutorials.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSelectTutorial = (step: number) => {
    // Can only select completed tutorials or the next one
    if (step <= maxAccessible) {
      setCurrentStep(step);
    }
  };

  if (tutorials.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading tutorials...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h1 className={styles.title}>Learn to Play</h1>
        <p className={styles.progress}>
          {completedCount} / {tutorials.length} completed
        </p>
      </header>

      <div className={styles.content}>
        {/* Tutorial selector */}
        <div className={styles.selector}>
          <div className={styles.steps}>
            {tutorials.map((tutorial, index) => {
              const step = tutorial.tutorialStep || index + 1;
              const isCompleted = progress?.tutorialCompleted?.includes(step);
              const isCurrent = step === currentStep;
              const isAccessible = step <= maxAccessible;
              const isLocked = !isAccessible;

              return (
                <button
                  key={tutorial.id}
                  className={`${styles.stepButton} ${isCurrent ? styles.current : ''} ${isCompleted ? styles.completed : ''} ${isLocked ? styles.locked : ''}`}
                  onClick={() => handleSelectTutorial(step)}
                  disabled={isLocked}
                  title={isLocked ? 'Complete previous tutorials to unlock' : tutorial.title}
                >
                  <span className={styles.stepNumber}>
                    {isLocked ? <Lock size={14} /> : step}
                  </span>
                  {isCompleted && !isLocked && (
                    <span className={styles.completeBadge}>
                      <Check size={10} strokeWidth={3} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Current tutorial */}
        {currentPuzzle && (
          <div className={styles.gameArea}>
            <OnboardingProvider key={`onboarding-${currentStep}`} tutorialStep={currentStep}>
              <Game
                key={`game-${currentStep}`}
                puzzle={currentPuzzle}
                onComplete={handleComplete}
                onNextPuzzle={currentStep < tutorials.length ? handleNextTutorial : undefined}
                tutorialStep={currentStep}
              />
            </OnboardingProvider>
          </div>
        )}

        {/* Completed all tutorials */}
        {completedCount === tutorials.length && (
          <div className={styles.allComplete}>
            <GraduationCap size={48} className={styles.completeIcon} />
            <h2>Congratulations!</h2>
            <p>You've completed all tutorials. Ready for the real challenges?</p>
            <div className={styles.completeButtons}>
              <Link to="/daily" className={styles.dailyButton}>
                <Calendar size={20} />
                Daily Challenge
              </Link>
              <Link to="/classic" className={styles.classicButton}>
                <Library size={20} />
                Classic Puzzles
              </Link>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
