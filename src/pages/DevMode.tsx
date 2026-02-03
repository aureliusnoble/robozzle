import { useState, useEffect, useMemo } from 'react';
import { ArrowLeft, X, Eye, Play, Loader2, Shield, List, Zap, Upload, Settings, Clock, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { Game } from '../components/game';
import { SimulationMode } from '../components/simulation/SimulationMode';
import { useAuthStore } from '../stores/authStore';
import { supabase } from '../lib/supabase';
import type { PuzzleConfig, Program, ChallengeType } from '../engine/types';
import type { SimulationConfig } from '../engine/simulationTypes';
import styles from './DevMode.module.css';

type ViewMode = 'puzzles' | 'simulation' | 'configs';

// Calculate next generation time (22:00 UTC daily)
function getNextGenerationTime(): Date {
  const now = new Date();
  const next = new Date(now);
  next.setUTCHours(22, 0, 0, 0);

  // If it's past 22:00 UTC today, move to tomorrow
  if (now.getTime() >= next.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }

  return next;
}

function formatTimeUntil(targetDate: Date): string {
  const now = new Date();
  const diff = targetDate.getTime() - now.getTime();

  if (diff <= 0) return 'Running now...';

  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}

interface GeneratedPuzzle {
  id: string;
  title: string;
  difficulty: string;
  generation_source: string;
  mechanic_category: string | null;
  profile_name: string | null;
  solver_difficulty_score: number | null;
  quality_score: number | null;
  solution_instruction_count: number | null;
  solution_step_count: number | null;
  created_at: string;
  used_for_daily: string | null;
  pool_id: string | null;
}

interface GenerationConfig {
  id: string;
  name: string;
  challenge_type: ChallengeType;
  config: SimulationConfig;
  description: string | null;
  is_active: boolean;
  created_at: string;
}

// Colors for challenge types
const CHALLENGE_COLORS: Record<ChallengeType, string> = {
  'easy': '#22C55E',
  'challenge': '#EF4444',
};

function getChallengeColor(type: ChallengeType | string | null): string {
  if (!type) return '#6B7280';
  return CHALLENGE_COLORS[type as ChallengeType] || '#6B7280';
}

export function DevMode() {
  const { user } = useAuthStore();
  const [hasAccess, setHasAccess] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('puzzles');
  const [puzzles, setPuzzles] = useState<GeneratedPuzzle[]>([]);
  const [configs, setConfigs] = useState<GenerationConfig[]>([]);
  const [selectedPuzzle, setSelectedPuzzle] = useState<PuzzleConfig | null>(null);
  const [selectedSolution, setSelectedSolution] = useState<Program | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');
  const [showUsed, setShowUsed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [lastGenerationInfo, setLastGenerationInfo] = useState<{
    date: string;
    easyCount: number;
    challengeCount: number;
  } | null>(null);
  const [timeUntilNext, setTimeUntilNext] = useState(formatTimeUntil(getNextGenerationTime()));
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationMessage, setGenerationMessage] = useState<string | null>(null);

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

  // Load generation configs
  useEffect(() => {
    async function loadConfigs() {
      if (!hasAccess) return;

      try {
        const { data, error } = await supabase
          .from('generation_configs')
          .select('*')
          .order('challenge_type', { ascending: true });

        if (error) throw error;
        setConfigs(data || []);
      } catch (err) {
        console.error('Error loading configs:', err);
      }
    }

    loadConfigs();
  }, [hasAccess]);

  // Update countdown timer every minute
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeUntilNext(formatTimeUntil(getNextGenerationTime()));
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  // Fetch last generation info from most recent puzzles
  useEffect(() => {
    if (!hasAccess || puzzles.length === 0) return;

    // Find the most recent puzzle creation date
    const sortedByDate = [...puzzles].sort((a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );

    if (sortedByDate.length > 0) {
      const latestDate = new Date(sortedByDate[0].created_at).toISOString().split('T')[0];

      // Count puzzles from that day
      const puzzlesFromLatest = puzzles.filter(p => {
        const puzzleDate = new Date(p.created_at).toISOString().split('T')[0];
        return puzzleDate === latestDate;
      });

      const easyCount = puzzlesFromLatest.filter(p => p.mechanic_category === 'easy').length;
      const challengeCount = puzzlesFromLatest.filter(p => p.mechanic_category === 'challenge').length;

      setLastGenerationInfo({
        date: latestDate,
        easyCount,
        challengeCount,
      });
    }
  }, [hasAccess, puzzles]);

  // Trigger manual generation via GitHub Actions workflow dispatch
  const handleManualGeneration = async () => {
    setIsGenerating(true);
    setGenerationMessage('Manual generation must be triggered from GitHub Actions.');

    // Open GitHub Actions page in new tab
    window.open('https://github.com/aureliusnoble/robozzle/actions/workflows/generate-daily.yml', '_blank');

    setTimeout(() => {
      setIsGenerating(false);
      setGenerationMessage(null);
    }, 5000);
  };

  // Fetch full puzzle for preview
  const handlePreview = async (puzzleId: string, withSolution: boolean = false) => {
    try {
      setIsLoading(true);
      const { data, error } = await supabase
        .from('puzzles')
        .select('*')
        .eq('id', puzzleId)
        .single();

      if (error) throw error;

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

      if (withSolution && (data.generated_solution || data.solution)) {
        setSelectedSolution((data.generated_solution || data.solution) as Program);
      } else {
        setSelectedSolution(null);
      }
    } catch (err) {
      console.error('Error fetching puzzle:', err);
      setError('Failed to load puzzle');
    } finally {
      setIsLoading(false);
    }
  };

  // Approve puzzle (add to pool)
  const handleApprove = async (puzzleId: string, challengeType: ChallengeType) => {
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (!puzzle || puzzle.pool_id) return;

    try {
      const { error } = await supabase
        .from('generated_puzzle_pool')
        .insert({
          puzzle_id: puzzleId,
          mechanic_category: challengeType,
          quality_score: puzzle.quality_score || 0,
        });

      if (error) throw error;

      // Update puzzle's mechanic_category
      await supabase
        .from('puzzles')
        .update({ mechanic_category: challengeType })
        .eq('id', puzzleId);

      // Refresh puzzles
      const { data } = await supabase
        .from('generated_puzzles_view')
        .select('*')
        .order('created_at', { ascending: false });
      setPuzzles(data || []);

      setSuccessMessage(`Added to ${challengeType} pool`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Error approving puzzle:', err);
      setError('Failed to approve puzzle');
    }
  };

  // Reject puzzle (remove from pool)
  const handleReject = async (puzzleId: string) => {
    const puzzle = puzzles.find(p => p.id === puzzleId);
    if (!puzzle) return;

    try {
      if (puzzle.pool_id) {
        await supabase
          .from('generated_puzzle_pool')
          .delete()
          .eq('puzzle_id', puzzleId);
      }

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

  // Deactivate config (mark as inactive, don't delete)
  const handleDeactivateConfig = async (configId: string) => {
    try {
      const { error } = await supabase
        .from('generation_configs')
        .update({ is_active: false })
        .eq('id', configId);

      if (error) throw error;

      setConfigs(configs.map(c => c.id === configId ? { ...c, is_active: false } : c));
      setSuccessMessage('Config deactivated');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Error deactivating config:', err);
      setError('Failed to deactivate config');
    }
  };

  // Delete config permanently
  const handleDeleteConfig = async (configId: string) => {
    if (!confirm('Are you sure you want to permanently delete this config?')) {
      return;
    }
    try {
      const { error } = await supabase
        .from('generation_configs')
        .delete()
        .eq('id', configId);

      if (error) throw error;

      setConfigs(configs.filter(c => c.id !== configId));
      setSuccessMessage('Config deleted');
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Error deleting config:', err);
      setError('Failed to delete config');
    }
  };

  // Assign config to Easy or Challenge type (and set as active)
  const handleAssignConfigType = async (configId: string, challengeType: ChallengeType) => {
    try {
      const { error } = await supabase
        .from('generation_configs')
        .update({ challenge_type: challengeType, is_active: true })
        .eq('id', configId);

      if (error) throw error;

      setConfigs(configs.map(c =>
        c.id === configId ? { ...c, challenge_type: challengeType, is_active: true } : c
      ));
      setSuccessMessage(`Config assigned to ${challengeType}`);
      setTimeout(() => setSuccessMessage(null), 2000);
    } catch (err) {
      console.error('Error assigning config:', err);
      setError('Failed to assign config');
    }
  };

  // Filter puzzles
  const filteredPuzzles = useMemo(() => puzzles.filter(p => {
    if (filter === 'easy' && p.mechanic_category !== 'easy') return false;
    if (filter === 'challenge' && p.mechanic_category !== 'challenge') return false;
    if (filter === 'unassigned' && p.mechanic_category !== null) return false;
    if (!showUsed && p.used_for_daily) return false;
    return true;
  }), [puzzles, filter, showUsed]);

  // Calculate stats
  const stats = useMemo(() => ({
    total: puzzles.length,
    inPool: puzzles.filter(p => p.pool_id).length,
    used: puzzles.filter(p => p.used_for_daily).length,
    easy: puzzles.filter(p => p.mechanic_category === 'easy' && p.pool_id && !p.used_for_daily).length,
    challenge: puzzles.filter(p => p.mechanic_category === 'challenge' && p.pool_id && !p.used_for_daily).length,
    unassigned: puzzles.filter(p => !p.mechanic_category && !p.pool_id).length,
  }), [puzzles]);

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
        <button className={styles.backButton} onClick={() => {
          setSelectedPuzzle(null);
          setSelectedSolution(null);
        }}>
          <ArrowLeft size={16} />
          Back to List
        </button>
        <Game puzzle={selectedPuzzle} initialProgram={selectedSolution || undefined} />
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
        <p className={styles.subtitle}>
          {viewMode === 'puzzles' ? 'Puzzle Management' :
           viewMode === 'simulation' ? 'Puzzle Generation' :
           'Generation Configs'}
        </p>

        <div className={styles.viewTabs}>
          <button
            className={`${styles.viewTab} ${viewMode === 'puzzles' ? styles.activeTab : ''}`}
            onClick={() => setViewMode('puzzles')}
          >
            <List size={16} />
            Puzzles
          </button>
          <button
            className={`${styles.viewTab} ${viewMode === 'simulation' ? styles.activeTab : ''}`}
            onClick={() => setViewMode('simulation')}
          >
            <Zap size={16} />
            Generate
          </button>
          <button
            className={`${styles.viewTab} ${viewMode === 'configs' ? styles.activeTab : ''}`}
            onClick={() => setViewMode('configs')}
          >
            <Settings size={16} />
            Configs
          </button>
        </div>
      </header>

      {error && (
        <div className={styles.error}>
          {error}
          <button onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {successMessage && (
        <div className={styles.success}>
          {successMessage}
        </div>
      )}

      {/* Generation Status Section */}
      <div className={styles.generationStatus}>
        <div className={styles.statusCard}>
          <div className={styles.statusIcon}>
            <Clock size={18} />
          </div>
          <div className={styles.statusContent}>
            <span className={styles.statusLabel}>Next Auto-Gen</span>
            <span className={styles.statusValue}>{timeUntilNext}</span>
            <span className={styles.statusHint}>22:00 UTC daily</span>
          </div>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusIcon} style={{ color: stats.easy >= 7 ? '#10B981' : '#F59E0B' }}>
            {stats.easy >= 7 ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          </div>
          <div className={styles.statusContent}>
            <span className={styles.statusLabel}>Easy Pool</span>
            <span className={styles.statusValue}>{stats.easy}/7</span>
            <span className={styles.statusHint}>{stats.easy >= 7 ? 'Ready' : 'Needs puzzles'}</span>
          </div>
        </div>

        <div className={styles.statusCard}>
          <div className={styles.statusIcon} style={{ color: stats.challenge >= 7 ? '#10B981' : '#F59E0B' }}>
            {stats.challenge >= 7 ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
          </div>
          <div className={styles.statusContent}>
            <span className={styles.statusLabel}>Challenge Pool</span>
            <span className={styles.statusValue}>{stats.challenge}/7</span>
            <span className={styles.statusHint}>{stats.challenge >= 7 ? 'Ready' : 'Needs puzzles'}</span>
          </div>
        </div>

        {lastGenerationInfo && (
          <div className={styles.statusCard}>
            <div className={styles.statusIcon} style={{ color: '#6366F1' }}>
              <Zap size={18} />
            </div>
            <div className={styles.statusContent}>
              <span className={styles.statusLabel}>Last Generated</span>
              <span className={styles.statusValue}>
                {new Date(lastGenerationInfo.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              <span className={styles.statusHint}>
                {lastGenerationInfo.easyCount}E + {lastGenerationInfo.challengeCount}C
              </span>
            </div>
          </div>
        )}
      </div>

      {viewMode === 'simulation' ? (
        <SimulationMode />
      ) : viewMode === 'configs' ? (
        <div className={styles.configsSection}>
          <h2 className={styles.sectionTitle}>Generation Configs</h2>
          <p className={styles.configsHint}>
            Assign configs to Easy or Challenge for auto-generation. Active configs are used when generating puzzles.
          </p>

          {/* Manual Generation Trigger */}
          <div className={styles.manualGenSection}>
            <button
              className={styles.manualGenButton}
              onClick={handleManualGeneration}
              disabled={isGenerating}
            >
              <Zap size={16} />
              {isGenerating ? 'Opening GitHub...' : 'Trigger Generation'}
            </button>
            {generationMessage && (
              <span className={styles.genMessage}>{generationMessage}</span>
            )}
          </div>

          {/* Current Active Configs */}
          <div className={styles.activeConfigsRow}>
            <div className={styles.activeConfigIndicator}>
              <span className={styles.activeLabel} style={{ color: CHALLENGE_COLORS.easy }}>Easy:</span>
              <span className={styles.activeValue}>
                {configs.find(c => c.challenge_type === 'easy' && c.is_active)?.name || 'None'}
              </span>
            </div>
            <div className={styles.activeConfigIndicator}>
              <span className={styles.activeLabel} style={{ color: CHALLENGE_COLORS.challenge }}>Challenge:</span>
              <span className={styles.activeValue}>
                {configs.find(c => c.challenge_type === 'challenge' && c.is_active)?.name || 'None'}
              </span>
            </div>
          </div>

          {/* All Configs */}
          <div className={styles.configGroup}>
            <h3 className={styles.configGroupTitle}>All Saved Configs</h3>
            {configs.length === 0 ? (
              <p className={styles.noConfigs}>No configs saved yet. Save one from the Generate tab.</p>
            ) : (
              configs.map(config => (
                <div key={config.id} className={`${styles.configCard} ${config.is_active ? styles.activeConfig : ''}`}>
                  <div className={styles.configInfo}>
                    <span className={styles.configName}>{config.name}</span>
                    <span className={styles.configTypeBadge} style={{ background: CHALLENGE_COLORS[config.challenge_type] }}>
                      {config.challenge_type}
                    </span>
                    {config.is_active && <span className={styles.activeBadge}>Active</span>}
                  </div>
                  <div className={styles.configActions}>
                    <button
                      className={styles.assignEasyButton}
                      onClick={() => handleAssignConfigType(config.id, 'easy')}
                      title="Use for Easy generation"
                    >
                      Easy
                    </button>
                    <button
                      className={styles.assignChallengeButton}
                      onClick={() => handleAssignConfigType(config.id, 'challenge')}
                      title="Use for Challenge generation"
                    >
                      Chal
                    </button>
                    {config.is_active && (
                      <button
                        className={styles.deactivateConfigButton}
                        onClick={() => handleDeactivateConfig(config.id)}
                        title="Deactivate config"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      className={styles.deleteConfigButton}
                      onClick={() => handleDeleteConfig(config.id)}
                      title="Delete config permanently"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <>
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
          </div>

          {/* Category breakdown */}
          <div className={styles.categoryStats}>
            <div
              className={styles.categoryStat}
              style={{ borderColor: CHALLENGE_COLORS.easy }}
            >
              <span className={styles.categoryName}>Easy</span>
              <span className={styles.categoryCount}>{stats.easy} avail</span>
            </div>
            <div
              className={styles.categoryStat}
              style={{ borderColor: CHALLENGE_COLORS.challenge }}
            >
              <span className={styles.categoryName}>Challenge</span>
              <span className={styles.categoryCount}>{stats.challenge} avail</span>
            </div>
            {stats.unassigned > 0 && (
              <div
                className={styles.categoryStat}
                style={{ borderColor: '#6B7280' }}
              >
                <span className={styles.categoryName}>Unassigned</span>
                <span className={styles.categoryCount}>{stats.unassigned}</span>
              </div>
            )}
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
              <button
                className={`${styles.filterButton} ${filter === 'easy' ? styles.active : ''}`}
                onClick={() => setFilter('easy')}
                style={{ borderColor: filter === 'easy' ? CHALLENGE_COLORS.easy : undefined }}
              >
                Easy
              </button>
              <button
                className={`${styles.filterButton} ${filter === 'challenge' ? styles.active : ''}`}
                onClick={() => setFilter('challenge')}
                style={{ borderColor: filter === 'challenge' ? CHALLENGE_COLORS.challenge : undefined }}
              >
                Challenge
              </button>
              {stats.unassigned > 0 && (
                <button
                  className={`${styles.filterButton} ${filter === 'unassigned' ? styles.active : ''}`}
                  onClick={() => setFilter('unassigned')}
                >
                  Unassigned
                </button>
              )}
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
              <p>No puzzles found.</p>
              <p className={styles.hint}>Use the Generate tab to create puzzles with Simulation Mode.</p>
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
                    {puzzle.mechanic_category && (
                      <span
                        className={styles.categoryBadge}
                        style={{ background: getChallengeColor(puzzle.mechanic_category) }}
                      >
                        {puzzle.mechanic_category}
                      </span>
                    )}
                  </div>

                  <div className={styles.puzzleStats}>
                    <span>Quality: {puzzle.quality_score?.toFixed(0) || '-'}</span>
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
                      onClick={() => handlePreview(puzzle.id, false)}
                      title="Preview"
                    >
                      <Eye size={16} />
                    </button>
                    <button
                      className={styles.solutionButton}
                      onClick={() => handlePreview(puzzle.id, true)}
                      title="Preview with Solution"
                    >
                      <Play size={16} />
                    </button>
                    {!puzzle.pool_id && (
                      <>
                        <button
                          className={styles.approveEasyButton}
                          onClick={() => handleApprove(puzzle.id, 'easy')}
                          title="Add to Easy pool"
                        >
                          <Upload size={14} />
                          Easy
                        </button>
                        <button
                          className={styles.approveChallengeButton}
                          onClick={() => handleApprove(puzzle.id, 'challenge')}
                          title="Add to Challenge pool"
                        >
                          <Upload size={14} />
                          Challenge
                        </button>
                      </>
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
        </>
      )}
    </div>
  );
}
