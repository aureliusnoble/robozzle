import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Brain, RefreshCw, GitBranch, Repeat, Lock } from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { tutorialPuzzles } from '../engine/tutorials';
import styles from './AdvancedConcepts.module.css';

// Topic configuration
const advancedTopics = [
  {
    id: 'memory',
    title: 'Memory',
    description: 'Understanding the call stack and state',
    icon: Brain,
    available: false,
  },
  {
    id: 'recursion',
    title: 'Recursion',
    description: 'Functions that call themselves',
    icon: RefreshCw,
    available: true, // Tutorial 6 is here
  },
  {
    id: 'conditions',
    title: 'Conditions',
    description: 'Advanced conditional logic',
    icon: GitBranch,
    available: false,
  },
  {
    id: 'loops',
    title: 'Loops',
    description: 'Iteration patterns and techniques',
    icon: Repeat,
    available: false,
  },
];

export function AdvancedConcepts() {
  const navigate = useNavigate();
  const { isDevUser } = useAuthStore();

  // Check if user has dev role AND dev mode is enabled
  const devModeActive = isDevUser();

  // Redirect if dev mode is not active
  useEffect(() => {
    if (!devModeActive) {
      navigate('/tutorial');
    }
  }, [devModeActive, navigate]);

  // Don't render content while redirecting
  if (!devModeActive) {
    return null;
  }

  // Count tutorials for each topic
  const getTutorialCount = (topicId: string) => {
    return tutorialPuzzles.filter(p => p.advancedTopic === topicId).length;
  };

  const handleTopicClick = (topicId: string, available: boolean) => {
    if (available) {
      navigate(`/tutorial/advanced/${topicId}`);
    }
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <Link to="/tutorial" className={styles.backLink}>
          <ArrowLeft size={20} />
          <span>Back to Learn</span>
        </Link>
        <h1 className={styles.title}>Advanced Concepts</h1>
        <p className={styles.subtitle}>Master programming skills</p>
      </header>

      <div className={styles.topicsGrid}>
        {advancedTopics.map((topic) => {
          const Icon = topic.icon;
          const tutorialCount = getTutorialCount(topic.id);
          const isLocked = !topic.available;

          return (
            <button
              key={topic.id}
              className={`${styles.topicCard} ${isLocked ? styles.locked : ''}`}
              onClick={() => handleTopicClick(topic.id, topic.available)}
              disabled={isLocked}
            >
              <div className={styles.topicIcon}>
                <Icon size={28} />
              </div>
              <h3 className={styles.topicTitle}>{topic.title}</h3>
              <p className={styles.topicDescription}>{topic.description}</p>

              {isLocked ? (
                <div className={styles.lockedOverlay}>
                  <Lock size={24} />
                  <span>Coming Soon</span>
                </div>
              ) : (
                <span className={styles.tutorialCount}>
                  {tutorialCount} {tutorialCount === 1 ? 'tutorial' : 'tutorials'}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
