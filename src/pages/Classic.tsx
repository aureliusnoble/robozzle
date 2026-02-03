import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Check, Circle, Loader2, Star, Library } from 'lucide-react';
import { Game, SolutionViewer } from '../components/game';
import { PuzzleLeaderboard } from '../components/leaderboard';
import { ShareModal } from '../components/share';
import { usePuzzleStore } from '../stores/puzzleStore';
import { useAuthStore } from '../stores/authStore';
import { useGameStore } from '../stores/gameStore';
import { usePuzzleLeaderboard } from '../hooks/usePuzzleLeaderboard';
import { useSavedPrograms } from '../hooks/useSavedPrograms';
import type { PuzzleConfig, PuzzleMetadata, Program } from '../engine/types';
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
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const puzzleParam = searchParams.get('puzzle');

  const { classicPuzzlesMeta, isLoadingClassic, isLoadingPuzzle, loadClassicPuzzles, fetchPuzzle } = usePuzzleStore();
  const { user, progress, updateProgress, addClassicStars, updateHardestPuzzle, updateClassicRanking } = useAuthStore();
  const { getProgram, setProgram: setGameProgram } = useGameStore();
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleConfig | null>(null);
  const [filter, setFilter] = useState<DifficultyFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(100);
  const [showShare, setShowShare] = useState(false);
  const [completedState, setCompletedState] = useState<{
    steps: number;
    instructions: number;
  } | null>(null);

  // Solution viewer state
  const [viewingSolution, setViewingSolution] = useState<{
    userId: string | null;
    username: string;
  } | null>(null);

  // Ref for scrolling to leaderboard
  const leaderboardRef = useRef<HTMLDivElement>(null);

  // Leaderboard hook
  const {
    leaderboard,
    hasSubmitted,
    isLoading: isLeaderboardLoading,
    submitSolution,
    loadSolution,
  } = usePuzzleLeaderboard(selectedPuzzle?.id);

  // Save/Load hook
  const {
    savedSlots,
    latestProgram,
    saveProgram,
    loadProgram,
  } = useSavedPrograms(selectedPuzzle?.id);

  // Reset selected puzzle when navigating to /classic (e.g., clicking footer link)
  useEffect(() => {
    if (!puzzleParam) {
      setSelectedPuzzle(null);
      setCompletedState(null);
    }
  }, [location.key, puzzleParam]);

  useEffect(() => {
    loadClassicPuzzles();
  }, [loadClassicPuzzles]);

  // Handle puzzle URL parameter
  useEffect(() => {
    if (puzzleParam && classicPuzzlesMeta.length > 0) {
      const loadPuzzleFromUrl = async () => {
        const puzzle = await fetchPuzzle(puzzleParam);
        if (puzzle) {
          setSelectedPuzzle(puzzle);
        }
      };
      loadPuzzleFromUrl();
    }
  }, [puzzleParam, classicPuzzlesMeta, fetchPuzzle]);

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
      setCompletedState(null);
    }
  };

  const handleComplete = useCallback(async (steps: number, instructions: number) => {
    setCompletedState({ steps, instructions });

    if (selectedPuzzle && progress) {
      const newSolved = [...(progress.classicSolved || [])];
      if (!newSolved.includes(selectedPuzzle.id)) {
        newSolved.push(selectedPuzzle.id);
        await updateProgress({ classicSolved: newSolved });
        // Add stars for first-time completion
        if (selectedPuzzle.stars) {
          await addClassicStars(selectedPuzzle.stars);
          await updateHardestPuzzle(selectedPuzzle.stars);
        }
        // Update classic ranking score
        await updateClassicRanking();
      }
    }
  }, [selectedPuzzle, progress, updateProgress, addClassicStars, updateHardestPuzzle, updateClassicRanking]);

  const handleBack = () => {
    // Auto-save current program before leaving
    const currentProgram = getProgram();
    if (currentProgram && selectedPuzzle) {
      saveProgram(0, currentProgram); // Slot 0 = latest
    }

    setSelectedPuzzle(null);
    setCompletedState(null);
    // Clear URL param
    window.history.replaceState({}, '', '/classic');
  };

  // Handle leaderboard submission
  const handleSubmit = useCallback(async (program: Program, steps: number, instructions: number) => {
    await submitSolution(program, steps, instructions, false);
  }, [submitSolution]);

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

  // Handle view solution click
  const handleViewSolution = useCallback((userId: string | null, username: string) => {
    setViewingSolution({ userId, username });
  }, []);

  // Handle view solutions button click (from victory modal)
  const handleViewSolutions = useCallback(() => {
    // Scroll to the leaderboard section
    leaderboardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

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
          initialProgram={latestProgram || undefined}
          onComplete={handleComplete}
          onBack={handleBack}
          onShare={completedState ? () => setShowShare(true) : undefined}
          hasSubmitted={hasSubmitted}
          onSubmit={handleSubmit}
          onViewSolutions={handleViewSolutions}
          savedSlots={savedSlots}
          onSave={handleSave}
          onLoad={handleLoad}
          victoryModalDelay={2500}
        />

        {/* Puzzle Leaderboard */}
        <div ref={leaderboardRef}>
          <PuzzleLeaderboard
            entries={leaderboard}
            currentUsername={user?.username}
            currentUserId={user?.id}
            hasSubmitted={hasSubmitted}
            isLoading={isLeaderboardLoading}
            onViewSolution={handleViewSolution}
          />
        </div>

        {/* Solution Viewer Modal */}
        {viewingSolution && (
          <SolutionViewer
            puzzle={selectedPuzzle}
            username={viewingSolution.username}
            onLoadSolution={() => loadSolution(viewingSolution.userId)}
            onClose={() => setViewingSolution(null)}
          />
        )}

        {/* Share Modal */}
        {completedState && (
          <ShareModal
            isOpen={showShare}
            onClose={() => setShowShare(false)}
            puzzle={selectedPuzzle}
            program={getProgram() || undefined}
            stats={completedState}
            category="classic"
          />
        )}
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
