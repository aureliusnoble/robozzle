import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Brain, RefreshCw, GitBranch, Repeat } from 'lucide-react';
import { Game } from '../components/game';
import { OnboardingProvider } from '../components/onboarding';
import { useAuthStore } from '../stores/authStore';
import { useOnboardingStore } from '../stores/onboardingStore';
import { tutorialPuzzles } from '../engine/tutorials';
import type { PuzzleConfig } from '../engine/types';
import styles from './AdvancedTopicTutorials.module.css';

// Topic metadata
const topicMeta: Record<string, { title: string; icon: React.ComponentType<{ size?: number }> }> = {
  memory: { title: 'Memory', icon: Brain },
  recursion: { title: 'Recursion', icon: RefreshCw },
  conditions: { title: 'Conditions', icon: GitBranch },
  loops: { title: 'Loops', icon: Repeat },
};

export function AdvancedTopicTutorials() {
  const { topicId } = useParams<{ topicId: string }>();
  const navigate = useNavigate();
  const { progress, updateProgress, isDevUser } = useAuthStore();
  const { completeTutorial } = useOnboardingStore();
  const [currentStep, setCurrentStep] = useState(0);
  const initialLoadDone = useRef(false);

  // Check if user has dev role AND dev mode is enabled
  const devModeActive = isDevUser();

  // Redirect non-dev users
  useEffect(() => {
    if (!devModeActive) {
      navigate('/tutorial/advanced');
    }
  }, [devModeActive, navigate]);

  // Get tutorials for this topic
  const topicTutorials = tutorialPuzzles.filter(p => p.advancedTopic === topicId);

  // Set initial step based on progress - only on first load
  useEffect(() => {
    if (!initialLoadDone.current && topicTutorials.length > 0) {
      // Find the first uncompleted tutorial in this topic
      const completedSteps = progress?.tutorialCompleted || [];
      let firstUncompleted = 0;
      for (let i = 0; i < topicTutorials.length; i++) {
        const tutorialStep = topicTutorials[i].tutorialStep;
        if (tutorialStep && completedSteps.includes(tutorialStep)) {
          firstUncompleted = i + 1;
        } else {
          break;
        }
      }
      setCurrentStep(Math.min(firstUncompleted, topicTutorials.length - 1));
      initialLoadDone.current = true;
    }
  }, [progress, topicTutorials]);

  const currentPuzzle: PuzzleConfig | undefined = topicTutorials[currentStep];
  const completedCount = topicTutorials.filter(
    t => t.tutorialStep && progress?.tutorialCompleted?.includes(t.tutorialStep)
  ).length;

  const handleComplete = async () => {
    if (!currentPuzzle?.tutorialStep) return;

    const step = currentPuzzle.tutorialStep;
    const isCurrentCompleted = progress?.tutorialCompleted?.includes(step);

    if (!isCurrentCompleted) {
      // Mark tutorial complete in onboarding store
      completeTutorial(step);

      // Update progress
      const newCompleted = [...(progress?.tutorialCompleted || []), step];
      await updateProgress({ tutorialCompleted: newCompleted });
    }
  };

  const handleNextTutorial = () => {
    if (currentStep < topicTutorials.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleSelectTutorial = (index: number) => {
    // For now, allow any selection (could add gating later)
    setCurrentStep(index);
  };

  if (!devModeActive) {
    return null; // Will redirect
  }

  const topic = topicMeta[topicId || ''];
  if (!topic || topicTutorials.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.empty}>
          <p>No tutorials available for this topic yet.</p>
          <Link to="/tutorial/advanced" className={styles.backLink}>
            <ArrowLeft size={16} />
            Back to Advanced Concepts
          </Link>
        </div>
      </div>
    );
  }

  const Icon = topic.icon;

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link to="/tutorial/advanced" className={styles.backLink}>
          <ArrowLeft size={20} />
          <span>Advanced Concepts</span>
        </Link>
        <div className={styles.titleRow}>
          <div className={styles.topicIcon}>
            <Icon size={24} />
          </div>
          <h1 className={styles.title}>{topic.title}</h1>
        </div>
        <p className={styles.progress}>
          {completedCount} / {topicTutorials.length} completed
        </p>
      </header>

      <div className={styles.content}>
        {/* Tutorial selector */}
        {topicTutorials.length > 1 && (
          <div className={styles.selector}>
            <div className={styles.steps}>
              {topicTutorials.map((tutorial, index) => {
                const step = tutorial.tutorialStep;
                const isCompleted = step && progress?.tutorialCompleted?.includes(step);
                const isCurrent = index === currentStep;

                return (
                  <button
                    key={tutorial.id}
                    className={`${styles.stepButton} ${isCurrent ? styles.current : ''} ${isCompleted ? styles.completed : ''}`}
                    onClick={() => handleSelectTutorial(index)}
                    title={tutorial.title}
                  >
                    <span className={styles.stepNumber}>{index + 1}</span>
                    {isCompleted && (
                      <span className={styles.completeBadge}>
                        <Check size={10} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Current tutorial */}
        {currentPuzzle && (
          <div className={styles.gameArea}>
            <OnboardingProvider
              key={`onboarding-${currentPuzzle.tutorialStep}`}
              tutorialStep={currentPuzzle.tutorialStep || 0}
            >
              <Game
                key={`game-${currentPuzzle.id}`}
                puzzle={currentPuzzle}
                onComplete={handleComplete}
                onNextPuzzle={currentStep < topicTutorials.length - 1 ? handleNextTutorial : undefined}
                tutorialStep={currentPuzzle.tutorialStep}
              />
            </OnboardingProvider>
          </div>
        )}
      </div>
    </div>
  );
}
