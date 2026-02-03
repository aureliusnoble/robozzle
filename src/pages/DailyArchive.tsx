import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Star, Target } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import type { ChallengeType } from '../engine/types';
import styles from './DailyArchive.module.css';

interface ArchiveEntry {
  date: string;
  easy?: {
    puzzleId: string;
    puzzleTitle: string;
    completed: boolean;
  };
  challenge?: {
    puzzleId: string;
    puzzleTitle: string;
    completed: boolean;
  };
}

export function DailyArchive() {
  const navigate = useNavigate();
  const { progress } = useAuthStore();
  const [entries, setEntries] = useState<ArchiveEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadArchive() {
      try {
        const today = new Date().toISOString().split('T')[0];

        const { data, error } = await supabase
          .from('daily_challenges')
          .select('date, challenge_type, puzzle:puzzles(id, title)')
          .lt('date', today)
          .order('date', { ascending: false })
          .limit(60); // 30 days * 2 types

        if (error) throw error;

        // Build completion set including new format and legacy format
        const completedSet = new Set(progress?.dailySolved || []);

        // Group by date
        const entriesByDate = new Map<string, ArchiveEntry>();

        for (const item of data || []) {
          const date = item.date;
          const challengeType = (item.challenge_type || 'challenge') as ChallengeType;
          const puzzleId = (item.puzzle as any)?.id || '';
          const puzzleTitle = (item.puzzle as any)?.title || 'Daily Challenge';

          // Check completion (new format: "date:type", legacy format: just "date" for challenge)
          const newFormatKey = `${date}:${challengeType}`;
          const isCompleted = completedSet.has(newFormatKey) ||
            (challengeType === 'challenge' && completedSet.has(date));

          if (!entriesByDate.has(date)) {
            entriesByDate.set(date, { date });
          }

          const entry = entriesByDate.get(date)!;
          if (challengeType === 'easy') {
            entry.easy = {
              puzzleId,
              puzzleTitle,
              completed: isCompleted,
            };
          } else {
            entry.challenge = {
              puzzleId,
              puzzleTitle,
              completed: isCompleted,
            };
          }
        }

        // Convert to array and sort by date descending
        const archiveEntries = Array.from(entriesByDate.values()).sort(
          (a, b) => b.date.localeCompare(a.date)
        );

        setEntries(archiveEntries);
      } catch (err) {
        console.error('Failed to load archive:', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadArchive();
  }, [progress?.dailySolved]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr + 'T12:00:00');
    return {
      day: date.toLocaleDateString('en-US', { day: 'numeric' }),
      weekday: date.toLocaleDateString('en-US', { weekday: 'short' }),
      month: date.toLocaleDateString('en-US', { month: 'short' }),
    };
  };

  // Group entries by month
  const groupedEntries = entries.reduce((acc, entry) => {
    const date = new Date(entry.date + 'T12:00:00');
    const monthKey = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
    if (!acc[monthKey]) acc[monthKey] = [];
    acc[monthKey].push(entry);
    return acc;
  }, {} as Record<string, ArchiveEntry[]>);

  const handlePuzzleClick = (date: string, challengeType: ChallengeType) => {
    navigate(`/daily/${challengeType}?date=${date}`);
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <button className={styles.backButton} onClick={() => navigate('/daily')}>
          <ArrowLeft size={20} />
        </button>
        <h1 className={styles.title}>Archive</h1>
      </header>

      {isLoading ? (
        <div className={styles.loading}>
          <div className={styles.loadingSpinner} />
          <p>Loading archive...</p>
        </div>
      ) : entries.length === 0 ? (
        <div className={styles.empty}>
          <p>No past challenges yet.</p>
          <p className={styles.emptyHint}>Check back tomorrow!</p>
        </div>
      ) : (
        <div className={styles.archiveList}>
          {Object.entries(groupedEntries).map(([month, monthEntries]) => (
            <div key={month} className={styles.monthGroup}>
              <h2 className={styles.monthTitle}>{month}</h2>
              <div className={styles.entriesGrid}>
                {monthEntries.map((entry) => {
                  const { day, weekday } = formatDate(entry.date);
                  return (
                    <div key={entry.date} className={styles.entryCard}>
                      <div className={styles.entryDate}>
                        <span className={styles.entryDay}>{day}</span>
                        <span className={styles.entryWeekday}>{weekday}</span>
                      </div>
                      <div className={styles.entryPuzzles}>
                        {entry.easy && (
                          <button
                            className={`${styles.puzzleButton} ${styles.easyButton} ${entry.easy.completed ? styles.completed : ''}`}
                            onClick={() => handlePuzzleClick(entry.date, 'easy')}
                          >
                            <Star size={14} />
                            <span>Easy</span>
                            {entry.easy.completed && <Check size={14} className={styles.checkIcon} />}
                          </button>
                        )}
                        {entry.challenge && (
                          <button
                            className={`${styles.puzzleButton} ${styles.challengeButton} ${entry.challenge.completed ? styles.completed : ''}`}
                            onClick={() => handlePuzzleClick(entry.date, 'challenge')}
                          >
                            <Target size={14} />
                            <span>Challenge</span>
                            {entry.challenge.completed && <Check size={14} className={styles.checkIcon} />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
