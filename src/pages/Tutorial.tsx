import { useState, useEffect, useRef, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, GraduationCap, Lock, Calendar, Library, Sparkles, X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Game } from '../components/game';
import { OnboardingProvider } from '../components/onboarding';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import styles from './Tutorial.module.css';

export function Tutorial() {
  const navigate = useNavigate();
  const { tutorials: allTutorials, loadTutorials } = usePuzzleStore();
  const { progress, updateProgress, isDevUser } = useAuthStore();
  const { completeTutorial } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState(1);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const initialLoadDone = useRef(false);

  const devModeActive = isDevUser();

  useEffect(() => {
    loadTutorials();
  }, [loadTutorials]);

  // Filter out tutorials with advancedTopic (they go to Advanced Concepts)
  const tutorials = useMemo(() => {
    return allTutorials.filter(t => !t.advancedTopic);
  }, [allTutorials]);

  // Set initial step based on progress - only on first load
  useEffect(() => {
    if (!initialLoadDone.current && tutorials.length > 0) {
      if (progress?.tutorialCompleted && progress.tutorialCompleted.length > 0) {
        const maxCompleted = Math.max(...progress.tutorialCompleted, 0);
        // If all tutorials completed, go to congratulations tab
        if (maxCompleted >= tutorials.length) {
          setCurrentStep(tutorials.length + 1); // Congrats tab
        } else {
          setCurrentStep(Math.min(maxCompleted + 1, tutorials.length));
        }
      }
      initialLoadDone.current = true;
    }
  }, [progress, tutorials.length]);

  const currentPuzzle = tutorials.find(p => p.tutorialStep === currentStep);
  // Only count basic tutorials (1-5) for completion
  const basicTutorialSteps = tutorials.map(t => t.tutorialStep).filter((s): s is number => s !== undefined);
  const completedCount = basicTutorialSteps.filter(step =>
    progress?.tutorialCompleted?.includes(step)
  ).length;
  const isCurrentCompleted = progress?.tutorialCompleted?.includes(currentStep);
  const maxAccessible = Math.max(...(progress?.tutorialCompleted || []), 0) + 1;
  const allBasicCompleted = completedCount === tutorials.length;
  const isFinalTutorial = currentStep === tutorials.length;

  // Congratulations is a virtual "step" after all tutorials
  const congratsStep = tutorials.length + 1;
  const isOnCongratsTab = currentStep === congratsStep;

  const handleComplete = async () => {
    if (!isCurrentCompleted) {
      // Mark tutorial complete in onboarding store
      completeTutorial(currentStep);

      // Update progress
      const newCompleted = [...(progress?.tutorialCompleted || []), currentStep];
      await updateProgress({ tutorialCompleted: newCompleted });
    }

    // Switch to congratulations tab when finishing the final tutorial
    if (isFinalTutorial) {
      // Delay to let victory animation play
      setTimeout(() => {
        setCurrentStep(congratsStep);
      }, 1200);
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
            {/* Congratulations tab - shown after all tutorials completed */}
            <button
              className={`${styles.stepButton} ${styles.congratsButton} ${isOnCongratsTab ? styles.current : ''} ${allBasicCompleted ? styles.completed : ''} ${!allBasicCompleted ? styles.locked : ''}`}
              onClick={() => allBasicCompleted && setCurrentStep(congratsStep)}
              disabled={!allBasicCompleted}
              title={allBasicCompleted ? 'Congratulations!' : 'Complete all tutorials to unlock'}
            >
              <span className={styles.stepNumber}>
                {allBasicCompleted ? <GraduationCap size={16} /> : <Lock size={14} />}
              </span>
            </button>
          </div>
        </div>

        {/* Current tutorial or Congratulations */}
        {isOnCongratsTab ? (
          <div className={styles.allComplete}>
            <GraduationCap size={48} className={styles.completeIcon} />
            <h2>Congratulations!</h2>
            <p>You've completed all basic tutorials. Ready for the real challenges?</p>
            <div className={styles.completeButtons}>
              <button
                className={styles.advancedButton}
                onClick={() => {
                  if (devModeActive) {
                    navigate('/tutorial/advanced');
                  } else {
                    setShowComingSoon(true);
                  }
                }}
              >
                <Sparkles size={20} />
                Advanced Concepts
              </button>
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
        ) : currentPuzzle && (
          <div className={styles.gameArea}>
            <OnboardingProvider key={`onboarding-${currentStep}`} tutorialStep={currentStep}>
              <Game
                key={`game-${currentStep}`}
                puzzle={currentPuzzle}
                onComplete={handleComplete}
                onNextPuzzle={currentStep < tutorials.length ? handleNextTutorial : undefined}
                tutorialStep={currentStep}
                suppressVictoryModal={isFinalTutorial}
              />
            </OnboardingProvider>
          </div>
        )}
      </div>

      {/* Coming Soon Popup */}
      <AnimatePresence>
        {showComingSoon && (
          <motion.div
            className={styles.popupOverlay}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowComingSoon(false)}
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
                onClick={() => setShowComingSoon(false)}
              >
                <X size={20} />
              </button>
              <Sparkles size={48} className={styles.popupIcon} />
              <h3>Coming Soon!</h3>
              <p>Advanced Concepts are still in development. Check back later for more challenging tutorials!</p>
              <button
                className={styles.popupButton}
                onClick={() => setShowComingSoon(false)}
              >
                Got it
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
