import { useState, useEffect } from 'react';
import { ArrowLeft, Check, Circle, Loader2, Star, Library } from 'lucide-react';
import { Game } from '../components/game';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import type { PuzzleConfig, PuzzleMetadata } from '../engine/types';
import styles from './Classic.module.css';

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: '#22C55E',
  medium: '#EAB308',
  hard: '#F97316',
  expert: '#EF4444',
  impossible: '#A855F7',
};

type DifficultyFilter = 'all' | 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';

export function Classic() {
  const { classicPuzzlesMeta, isLoadingClassic, isLoadingPuzzle, loadClassicPuzzles, fetchPuzzle } = usePuzzleStore();
  const { progress, updateProgress } = useAuthStore();
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleConfig | null>(null);
  const [filter, setFilter] = useState<DifficultyFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);

  useEffect(() => {
    loadClassicPuzzles();
  }, [loadClassicPuzzles]);

  // Reset visible count when filter or search changes
  useEffect(() => {
    setVisibleCount(100);
  }, [filter, searchTerm]);

  const filteredPuzzles = classicPuzzlesMeta.filter(puzzle => {
    // Defensive check for valid puzzle metadata
    if (!puzzle || typeof puzzle.title !== 'string') return false;

    const matchesDifficulty = filter === 'all' || puzzle.difficulty === filter;
    const matchesSearch = puzzle.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (puzzle.author?.toLowerCase().includes(searchTerm.toLowerCase()));
    return matchesDifficulty && matchesSearch;
  });

  const handleSelectPuzzle = async (meta: PuzzleMetadata) => {
    const puzzle = await fetchPuzzle(meta.id);
    if (puzzle) {
      setSelectedPuzzle(puzzle);
    }
  };

  const handleComplete = async () => {
    if (selectedPuzzle && progress) {
      const newSolved = [...(progress.classicSolved || [])];
      if (!newSolved.includes(selectedPuzzle.id)) {
        newSolved.push(selectedPuzzle.id);
        await updateProgress({ classicSolved: newSolved });
      }
    }
  };

  const handleBack = () => {
    setSelectedPuzzle(null);
  };

  const solvedCount = progress?.classicSolved?.length || 0;

  // Show loading while fetching puzzle
  if (isLoadingPuzzle) {
    return (
      <div className={styles.container}>
        <div className={styles.loadingPuzzle}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Loading puzzle...</p>
        </div>
      </div>
    );
  }

  // Show selected puzzle
  if (selectedPuzzle) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={handleBack}>
          <ArrowLeft size={16} />
          Back to Puzzles
        </button>
        <Game
          puzzle={selectedPuzzle}
          onComplete={handleComplete}
        />
      </div>
    );
  }

  // Show puzzle browser
  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Library size={28} className={styles.titleIcon} />
          <h1 className={styles.title}>Classic Puzzles</h1>
        </div>
        <p className={styles.progress}>
          {solvedCount} / {classicPuzzlesMeta.length} solved
        </p>
      </header>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.difficultyFilters}>
          {(['all', 'easy', 'medium', 'hard', 'expert', 'impossible'] as DifficultyFilter[]).map(diff => (
            <button
              key={diff}
              className={`${styles.filterButton} ${filter === diff ? styles.active : ''}`}
              onClick={() => setFilter(diff)}
            >
              {diff !== 'all' && (
                <Circle
                  size={10}
                  fill={DIFFICULTY_COLORS[diff]}
                  color={DIFFICULTY_COLORS[diff]}
                  className={styles.difficultyDot}
                />
              )}
              {diff.charAt(0).toUpperCase() + diff.slice(1)}
            </button>
          ))}
        </div>

        <input
          type="text"
          className={styles.searchInput}
          placeholder="Search puzzles..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      {/* Puzzle grid */}
      {isLoadingClassic ? (
        <div className={styles.loading}>Loading puzzles...</div>
      ) : filteredPuzzles.length === 0 ? (
        <div className={styles.empty}>
          <p>No puzzles found.</p>
          {classicPuzzlesMeta.length === 0 && (
            <p className={styles.emptyHint}>
              Classic puzzles will be imported from the RoboZZle archive.
            </p>
          )}
        </div>
      ) : (
        <div className={styles.puzzleGrid}>
          {filteredPuzzles.slice(0, visibleCount).map((puzzle) => {
            const isSolved = progress?.classicSolved?.includes(puzzle.id);

            return (
              <button
                key={puzzle.id}
                className={`${styles.puzzleCard} ${isSolved ? styles.solved : ''}`}
                onClick={() => handleSelectPuzzle(puzzle)}
              >
                <div className={styles.puzzleHeader}>
                  <div className={styles.difficultyBadge}>
                    <Circle
                      size={10}
                      fill={DIFFICULTY_COLORS[puzzle.difficulty] || '#94A3B8'}
                      color={DIFFICULTY_COLORS[puzzle.difficulty] || '#94A3B8'}
                    />
                    <Star size={12} fill="#F59E0B" color="#F59E0B" />
                    <span className={styles.starCount}>{puzzle.stars}</span>
                  </div>
                  {isSolved && (
                    <span className={styles.solvedBadge}>
                      <Check size={12} />
                    </span>
                  )}
                </div>
                <h3 className={styles.puzzleTitle}>{puzzle.title}</h3>
                {puzzle.author && (
                  <p className={styles.puzzleAuthor}>by {puzzle.author}</p>
                )}
                {puzzle.description && (
                  <p className={styles.puzzleDescription}>{puzzle.description}</p>
                )}
                <div className={styles.puzzleMeta}>
                  <span>F1: {puzzle.f1}</span>
                  {puzzle.f2 > 0 && <span>F2: {puzzle.f2}</span>}
                  {puzzle.f3 > 0 && <span>F3: {puzzle.f3}</span>}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {filteredPuzzles.length > visibleCount && (
        <button
          className={styles.loadMoreButton}
          onClick={() => setVisibleCount(prev => prev + 100)}
        >
          Load more ({filteredPuzzles.length - visibleCount} remaining)
        </button>
      )}
    </div>
  );
}
