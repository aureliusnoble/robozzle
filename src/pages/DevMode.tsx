import { useState, useEffect } from 'react';
import { ArrowLeft, Check, X, Eye, Loader2, Shield } from 'lucide-react';
import { Game } from '../components/game';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { PuzzleConfig } from '../engine/types';
import styles from './DevMode.module.css';

interface GeneratedPuzzle {
  id: string;
  title: string;
  difficulty: string;
  generation_source: string;
  profile_name: string | null;
  uses_painting: boolean | null;
  solver_difficulty_score: number | null;
  quality_score: number | null;
  solution_instruction_count: number | null;
  solution_step_count: number | null;
  created_at: string;
  used_for_daily: string | null;
  pool_id: string | null;
}

// Colors for different profiles
const PROFILE_COLORS: Record<string, string> = {
  'Deep Recursion': '#8B5CF6',
  'Multi-Function': '#F59E0B',
  'Painter': '#EC4899',
  'Efficient Looper': '#10B981',
  'Instruction Heavy': '#3B82F6',
  'High Conditionals': '#EF4444',
  'Balanced': '#6B7280',
};

function getProfileColor(profileName: string | null): string {
  if (!profileName) return '#6B7280';
  return PROFILE_COLORS[profileName] || '#6B7280';
}

export function DevMode() {
  const { user } = useAuthStore();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [puzzles, setPuzzles] = useState<GeneratedPuzzle[]>([]);
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [showUsed, setShowUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if user has dev/admin access
  useEffect(() => {
    async function checkAccess() {
      if (!user) {
        setHasAccess(false);
        setIsLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (error) throw error;

        const role = data?.role as string | undefined;
        setHasAccess(role === 'admin' || role === 'dev');
      } catch (err) {
        console.error('Error checking access:', err);
        setHasAccess(false);
      } finally {
        setIsLoading(false);
      }
    }

    checkAccess();
  }, [user]);

  // Load generated puzzles
  useEffect(() => {
    async function loadPuzzles() {
      if (!hasAccess) return;

      try {
        setIsLoading(true);
        const { data, error } = await supabase
          .from('generated_puzzles_view')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPuzzles(data || []);
      } catch (err) {
        console.error('Error loading puzzles:', err);
        setError('Failed to load puzzles');
      } finally {
        setIsLoading(false);
      }
    }

    loadPuzzles();
  }, [hasAccess]);

  // Fetch full puzzle for preview
  const handlePreview = async (puzzleId: string) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error) throw error;

      // Convert to PuzzleConfig
      const puzzle: PuzzleConfig = {
        id: data.id,
        title: data.title,
        description: data.description,
        grid: data.grid,
        robotStart: data.robot_start,
        functionLengths: data.function_lengths,
        allowedInstructions: data.allowed_instructions,
        category: data.category,
        difficulty: data.difficulty,
      };

      setSelectedPuzzle(puzzle);
    } catch (err) {
      console.error('Error fetching puzzle:', err);
      setError('Failed to load puzzle');
    } finally {
      setIsLoading(false);
    }
  };

  // Approve puzzle (add to pool)
  const handleApprove = async (puzzleId: string) => {
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (!puzzle || puzzle.pool_id) return;

    try {
      const { error } = await supabase
        .from('generated_puzzle_pool')
        .insert({
          puzzle_id: puzzleId,
          profile_name: puzzle.profile_name,
          quality_score: puzzle.quality_score || 0,
        });

      if (error) throw error;

      // Refresh puzzles
      const { data } = await supabase
        .from('generated_puzzles_view')
        .select('*')
        .order('created_at', { ascending: false });
      setPuzzles(data || []);
    } catch (err) {
      console.error('Error approving puzzle:', err);
      setError('Failed to approve puzzle');
    }
  };

  // Reject puzzle (remove from pool or delete)
  const handleReject = async (puzzleId: string) => {
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (!puzzle) return;

    try {
      // Remove from pool if exists
      if (puzzle.pool_id) {
        await supabase
          .from('generated_puzzle_pool')
          .delete()
          .eq('puzzle_id', puzzleId);
      }

      // Refresh puzzles
      const { data } = await supabase
        .from('generated_puzzles_view')
        .select('*')
        .order('created_at', { ascending: false });
      setPuzzles(data || []);
    } catch (err) {
      console.error('Error rejecting puzzle:', err);
      setError('Failed to reject puzzle');
    }
  };

  // Filter puzzles
  const filteredPuzzles = puzzles.filter(p => {
    if (filter !== 'all' && p.profile_name !== filter) return false;
    if (!showUsed && p.used_for_daily) return false;
    return true;
  });

  // Get unique profile names from puzzles
  const profileNames = [...new Set(puzzles.map(p => p.profile_name).filter(Boolean))] as string[];

  // Calculate stats
  const stats = {
    total: puzzles.length,
    inPool: puzzles.filter(p => p.pool_id).length,
    used: puzzles.filter(p => p.used_for_daily).length,
    byProfile: Object.fromEntries(
      profileNames.map(profile => [
        profile,
        puzzles.filter(p => p.profile_name === profile && p.pool_id && !p.used_for_daily).length,
      ])
    ) as Record<string, number>,
  };

  // Access denied
  if (hasAccess === false) {
    return (
      <div className={styles.container}>
        <div className={styles.accessDenied}>
          <Shield size={48} className={styles.shieldIcon} />
          <h1>Access Denied</h1>
          <p>You need dev or admin role to access this page.</p>
          {!user && <p className={styles.hint}>Please sign in first.</p>}
        </div>
      </div>
    );
  }

  // Loading
  if (isLoading && hasAccess === null) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <Loader2 size={32} className={styles.spinner} />
          <p>Checking access...</p>
        </div>
      </div>
    );
  }

  // Puzzle preview
  if (selectedPuzzle) {
    return (
      <div className={styles.container}>
        <button className={styles.backButton} onClick={() => setSelectedPuzzle(null)}>
          <ArrowLeft size={16} />
          Back to List
        </button>
        <Game puzzle={selectedPuzzle} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <Shield size={28} className={styles.titleIcon} />
          <h1 className={styles.title}>Dev Mode</h1>
        </div>
        <p className={styles.subtitle}>Generated Puzzle Management</p>
      </header>

      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.total}</span>
          <span className={styles.statLabel}>Total</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.inPool}</span>
          <span className={styles.statLabel}>In Pool</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.used}</span>
          <span className={styles.statLabel}>Used</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statValue}>{stats.inPool - stats.used}</span>
          <span className={styles.statLabel}>Available</span>
        </div>
      </div>

      {/* Profile breakdown */}
      <div className={styles.categoryStats}>
        {profileNames.map(profile => (
          <div
            key={profile}
            className={styles.categoryStat}
            style={{ borderColor: getProfileColor(profile) }}
          >
            <span className={styles.categoryName}>{profile}</span>
            <span className={styles.categoryCount}>{stats.byProfile[profile]} avail</span>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.categoryFilters}>
          <button
            className={`${styles.filterButton} ${filter === 'all' ? styles.active : ''}`}
            onClick={() => setFilter('all')}
          >
            All
          </button>
          {profileNames.map(profile => (
            <button
              key={profile}
              className={`${styles.filterButton} ${filter === profile ? styles.active : ''}`}
              onClick={() => setFilter(profile)}
              style={{ borderColor: filter === profile ? getProfileColor(profile) : undefined }}
            >
              {profile}
            </button>
          ))}
        </div>

        <label className={styles.checkbox}>
          <input
            type="checkbox"
            checked={showUsed}
            onChange={(e) => setShowUsed(e.target.checked)}
          />
          Show used
        </label>
      </div>

      {/* Puzzle list */}
      {isLoading ? (
        <div className={styles.loading}>
          <Loader2 size={24} className={styles.spinner} />
          <p>Loading puzzles...</p>
        </div>
      ) : filteredPuzzles.length === 0 ? (
        <div className={styles.empty}>
          <p>No generated puzzles found.</p>
          <p className={styles.hint}>Run the generation script to create puzzles.</p>
        </div>
      ) : (
        <div className={styles.puzzleList}>
          {filteredPuzzles.map(puzzle => (
            <div
              key={puzzle.id}
              className={`${styles.puzzleCard} ${puzzle.pool_id ? styles.inPool : ''} ${puzzle.used_for_daily ? styles.used : ''}`}
            >
              <div className={styles.puzzleHeader}>
                <h3 className={styles.puzzleTitle}>{puzzle.title}</h3>
                {puzzle.profile_name && (
                  <span
                    className={styles.categoryBadge}
                    style={{ background: getProfileColor(puzzle.profile_name) }}
                  >
                    {puzzle.profile_name}
                  </span>
                )}
                {puzzle.uses_painting && (
                  <span className={styles.paintBadge}>Paint</span>
                )}
              </div>

              <div className={styles.puzzleStats}>
                <span>Quality: {puzzle.quality_score?.toFixed(0) || '-'}</span>
                <span>Difficulty: {puzzle.solver_difficulty_score?.toFixed(0) || '-'}</span>
                <span>Instructions: {puzzle.solution_instruction_count || '-'}</span>
                <span>Steps: {puzzle.solution_step_count || '-'}</span>
              </div>

              <div className={styles.puzzleStatus}>
                {puzzle.used_for_daily && (
                  <span className={styles.usedBadge}>Used: {puzzle.used_for_daily}</span>
                )}
                {puzzle.pool_id && !puzzle.used_for_daily && (
                  <span className={styles.poolBadge}>In Pool</span>
                )}
              </div>

              <div className={styles.puzzleActions}>
                <button
                  className={styles.previewButton}
                  onClick={() => handlePreview(puzzle.id)}
                  title="Preview"
                >
                  <Eye size={16} />
                </button>
                {!puzzle.pool_id && (
                  <button
                    className={styles.approveButton}
                    onClick={() => handleApprove(puzzle.id)}
                    title="Approve"
                  >
                    <Check size={16} />
                  </button>
                )}
                {puzzle.pool_id && !puzzle.used_for_daily && (
                  <button
                    className={styles.rejectButton}
                    onClick={() => handleReject(puzzle.id)}
                    title="Remove from pool"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
