import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuthStore } from '../stores/authStore';
import styles from './DailyArchive.module.css';

interface ArchiveEntry {
  date: string;
  puzzleTitle: string;
  profileName?: string;
  completed: boolean;
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
          .select('date, puzzle:puzzles(title, profile_name)')
          .lt('date', today)
          .order('date', { ascending: false })
          .limit(30);

        if (error) throw error;

        const completedDates = new Set(progress?.dailySolved || []);

        const archiveEntries: ArchiveEntry[] = (data || []).map((entry: any) => ({
          date: entry.date,
          puzzleTitle: entry.puzzle?.title || 'Daily Challenge',
          profileName: entry.puzzle?.profile_name,
          completed: completedDates.has(entry.date),
        }));

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
                    <button
                      key={entry.date}
                      className={`${styles.entryCard} ${entry.completed ? styles.completed : ''}`}
                      onClick={() => navigate(`/daily?date=${entry.date}`)}
                    >
                      <div className={styles.entryDate}>
                        <span className={styles.entryDay}>{day}</span>
                        <span className={styles.entryWeekday}>{weekday}</span>
                      </div>
                      <div className={styles.entryInfo}>
                        <span className={styles.entryTitle}>{entry.puzzleTitle}</span>
                        {entry.profileName && (
                          <span className={styles.entryProfile}>{entry.profileName}</span>
                        )}
                      </div>
                      <div className={styles.entryStatus}>
                        {entry.completed ? (
                          <Check size={18} className={styles.checkIcon} />
                        ) : (
                          <span className={styles.playIcon}>Play</span>
                        )}
                      </div>
                    </button>
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
