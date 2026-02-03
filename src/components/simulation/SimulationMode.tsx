import { useCallback, useState, useMemo, useEffect, useRef } from 'react';
import { ArrowUp, CornerUpLeft, CornerUpRight, Circle, Paintbrush, ArrowLeft, Play, Save, Trash2, FolderOpen } from 'lucide-react';
import type { FunctionName, Instruction, PuzzleConfig, InstructionType } from '../../engine/types';
import { useSimulation } from '../../hooks/useSimulation';
import { SimulationBoard } from './SimulationBoard';
import { Game } from '../game';
import {
  getSavedPuzzles,
  savePuzzle,
  deleteSavedPuzzle,
  getSavedConfigs,
  saveConfig,
  deleteSavedConfig,
  fetchConfigsFromSupabase,
  saveConfigToSupabase,
  deleteConfigFromSupabase,
  mergeConfigs,
  syncConfigsToSupabase,
  type SavedPuzzle,
  type SavedConfig,
} from '../../utils/simulationStorage';
import { useAuthStore } from '../../stores/authStore';
import styles from './SimulationMode.module.css';

function getInstructionIcon(type: string, size = 16) {
  switch (type) {
    case 'forward':
      return <ArrowUp size={size} />;
    case 'left':
      return <CornerUpLeft size={size} />;
    case 'right':
      return <CornerUpRight size={size} />;
    case 'paint_red':
      return <Paintbrush size={size} style={{ color: '#EF4444' }} />;
    case 'paint_green':
      return <Paintbrush size={size} style={{ color: '#22C55E' }} />;
    case 'paint_blue':
      return <Paintbrush size={size} style={{ color: '#3B82F6' }} />;
    case 'noop':
      return <Circle size={size} />;
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
      return <span className={styles.funcLabel}>{type.toUpperCase()}</span>;
    default:
      return null;
  }
}

function InstructionSlot({ instruction }: { instruction: Instruction | null }) {
  if (!instruction) {
    return <div className={styles.emptySlot} />;
  }

  return (
    <div
      className={styles.instructionSlot}
      data-color={instruction.condition}
    >
      <span className={styles.icon}>{getInstructionIcon(instruction.type)}</span>
      {instruction.condition && (
        <div
          className={styles.conditionDot}
          style={{
            backgroundColor:
              instruction.condition === 'red'
                ? '#F87171'
                : instruction.condition === 'green'
                ? '#4ADE80'
                : '#60A5FA',
          }}
        />
      )}
    </div>
  );
}

function ProgramDisplay({ program }: { program: { f1: (Instruction | null)[]; f2: (Instruction | null)[]; f3: (Instruction | null)[]; f4: (Instruction | null)[]; f5: (Instruction | null)[] } }) {
  const functions: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];
  const activeFunctions = functions.filter(f => program[f].length > 0);

  return (
    <div className={styles.programDisplay}>
      {activeFunctions.map(fn => (
        <div key={fn} className={styles.functionRow}>
          <span className={styles.functionLabel}>{fn.toUpperCase()}</span>
          <div className={styles.functionSlots}>
            {program[fn].map((instr, idx) => (
              <InstructionSlot key={idx} instruction={instr} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Filter program to only include executed instructions
function filterExecutedInstructions(
  program: { f1: (Instruction | null)[]; f2: (Instruction | null)[]; f3: (Instruction | null)[]; f4: (Instruction | null)[]; f5: (Instruction | null)[] },
  executedSlots: Set<string>
): { f1: (Instruction | null)[]; f2: (Instruction | null)[]; f3: (Instruction | null)[]; f4: (Instruction | null)[]; f5: (Instruction | null)[] } {
  const functions: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];
  const filtered: { f1: (Instruction | null)[]; f2: (Instruction | null)[]; f3: (Instruction | null)[]; f4: (Instruction | null)[]; f5: (Instruction | null)[] } = {
    f1: [], f2: [], f3: [], f4: [], f5: []
  };

  for (const fn of functions) {
    filtered[fn] = program[fn].map((instr, idx) => {
      const slotKey = `${fn}-${idx}`;
      return executedSlots.has(slotKey) ? instr : null;
    });
  }

  return filtered;
}

export function SimulationMode() {
  const { state, config, setConfig, start, stop, reset, totalSlots } = useSimulation();
  const { user, isAuthenticated } = useAuthStore();
  const [isPlayingThrough, setIsPlayingThrough] = useState(false);
  const [savedPuzzles, setSavedPuzzles] = useState<SavedPuzzle[]>([]);
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [showSavedPuzzles, setShowSavedPuzzles] = useState(false);
  const [showSavedConfigs, setShowSavedConfigs] = useState(false);
  const [puzzleName, setPuzzleName] = useState('');
  const [configName, setConfigName] = useState('');
  const [selectedPuzzle, setSelectedPuzzle] = useState<SavedPuzzle | null>(null);

  // Load saved items on mount and when auth state changes
  useEffect(() => {
    setSavedPuzzles(getSavedPuzzles());

    const loadConfigs = async () => {
      const localConfigs = getSavedConfigs();

      if (isAuthenticated && user?.id) {
        // Fetch from Supabase and merge with local
        const remoteConfigs = await fetchConfigsFromSupabase(user.id);
        const merged = mergeConfigs(localConfigs, remoteConfigs);
        setSavedConfigs(merged);

        // Update localStorage with merged configs
        localStorage.setItem('robozzle_saved_configs', JSON.stringify(merged));

        // Sync any local-only configs to Supabase
        await syncConfigsToSupabase(user.id);
      } else {
        setSavedConfigs(localConfigs);
      }
    };

    loadConfigs();
  }, [isAuthenticated, user?.id]);

  // Create a PuzzleConfig from the simulation state for playthrough
  const puzzleConfig = useMemo((): PuzzleConfig | null => {
    if (state.status !== 'success' || state.originalGrid.length === 0) return null;

    // Find the starting position (center of grid)
    const center = Math.floor(config.gridSize / 2);

    // Deep clone the ORIGINAL grid (before any paint operations) so we can add stars
    // This ensures conditional instructions work correctly during playback
    const gridWithStars = state.originalGrid.map(row =>
      row.map(tile => tile ? { ...tile, hasStar: false } : null)
    );

    // Validate: starting tile must exist
    const startTile = gridWithStars[center]?.[center];
    if (!startTile) {
      console.error('[SimulationMode] ERROR: No tile at starting position!', {
        center,
        gridSize: config.gridSize,
      });
    }

    // Place stars at turn positions (deduplicated)
    const starPositions = new Set<string>();
    for (const pos of state.turnPositions) {
      starPositions.add(`${pos.x},${pos.y}`);
    }
    // Add final position
    starPositions.add(`${state.robotPosition.x},${state.robotPosition.y}`);

    // Set stars on the grid and validate
    let starsPlaced = 0;
    for (const posKey of starPositions) {
      const [x, y] = posKey.split(',').map(Number);
      if (gridWithStars[y]?.[x]) {
        gridWithStars[y][x]!.hasStar = true;
        starsPlaced++;
      } else {
        console.error('[SimulationMode] ERROR: No tile at star position!', {
          position: { x, y },
          isTurnPosition: state.turnPositions.some(p => p.x === x && p.y === y),
          isFinalPosition: state.robotPosition.x === x && state.robotPosition.y === y,
        });
      }
    }

    // Log diagnostic info
    console.log('[SimulationMode] Puzzle config created:', {
      startPosition: { x: center, y: center },
      startDirection: state.robotStartDirection,
      startTileColor: startTile?.color,
      starPositionsCount: starPositions.size,
      starsPlaced,
      finalPosition: state.robotPosition,
      turnPositions: state.turnPositions,
      robotPath: state.robotPath,
      simulationStepCount: state.stepCount,
      programF1: state.program.f1.map(i => i ? `${i.type}${i.condition ? `(${i.condition})` : ''}` : 'null'),
    });

    // Get all allowed instructions from the program
    const allowedInstructions = new Set<InstructionType>();
    allowedInstructions.add('forward');
    allowedInstructions.add('left');
    allowedInstructions.add('right');

    for (const fn of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
      if (config.slotsPerFunction[fn] > 0) {
        allowedInstructions.add(fn);
      }
      for (const instr of state.program[fn]) {
        if (instr) {
          allowedInstructions.add(instr.type);
        }
      }
    }

    return {
      id: `sim-${Date.now()}`,
      title: 'Simulation Result',
      description: 'Generated by simulation mode',
      grid: gridWithStars,
      robotStart: {
        position: { x: center, y: center },
        direction: state.robotStartDirection,
      },
      functionLengths: config.slotsPerFunction,
      allowedInstructions: Array.from(allowedInstructions),
      category: 'classic',
      difficulty: 'medium',
    };
  }, [state, config]);

  const updateSlots = useCallback(
    (fn: FunctionName, value: number) => {
      setConfig({
        ...config,
        slotsPerFunction: {
          ...config.slotsPerFunction,
          [fn]: value,
        },
      });
    },
    [config, setConfig]
  );

  const updateMaxSteps = useCallback(
    (value: number) => {
      setConfig({
        ...config,
        maxSteps: value,
      });
    },
    [config, setConfig]
  );

  const updateGridSize = useCallback(
    (value: number) => {
      setConfig({
        ...config,
        gridSize: value,
      });
    },
    [config, setConfig]
  );

  const updateColorRatio = useCallback(
    (color: 'red' | 'green' | 'blue', value: number) => {
      setConfig({
        ...config,
        colorRatios: {
          ...config.colorRatios,
          [color]: value,
        },
      });
    },
    [config, setConfig]
  );

  const updateMinCoverage = useCallback(
    (value: number) => {
      setConfig({
        ...config,
        minCoveragePercent: value,
      });
    },
    [config, setConfig]
  );

  const updateConditionalPercent = useCallback(
    (value: number) => {
      setConfig({
        ...config,
        conditionalPercent: value,
      });
    },
    [config, setConfig]
  );

  const updateInstructionWeight = useCallback(
    (key: 'forward' | 'turn' | 'functionCall' | 'paint', value: number) => {
      setConfig({
        ...config,
        instructionWeights: {
          ...config.instructionWeights,
          [key]: value,
        },
      });
    },
    [config, setConfig]
  );

  const updateMinTiles = useCallback(
    (value: number) => {
      setConfig({ ...config, minTiles: value });
    },
    [config, setConfig]
  );

  const updateMinBoundingBox = useCallback(
    (value: number) => {
      setConfig({ ...config, minBoundingBox: value });
    },
    [config, setConfig]
  );

  const updateMinTurns = useCallback(
    (value: number) => {
      setConfig({ ...config, minTurns: value });
    },
    [config, setConfig]
  );

  const updateMaxDenseTiles = useCallback(
    (value: number) => {
      setConfig({ ...config, maxDenseTiles: value });
    },
    [config, setConfig]
  );

  const updateMaxAvgExecutionsPerSlot = useCallback(
    (value: number) => {
      setConfig({ ...config, maxAvgExecutionsPerSlot: value });
    },
    [config, setConfig]
  );

  const updateMinStackDepth = useCallback(
    (value: number) => {
      setConfig({ ...config, minStackDepth: value });
    },
    [config, setConfig]
  );

  const updateMinSelfCalls = useCallback(
    (value: number) => {
      setConfig({ ...config, minSelfCalls: value });
    },
    [config, setConfig]
  );

  const updateAutoRestartAfter = useCallback(
    (value: number) => {
      setConfig({ ...config, autoRestartAfter: value });
    },
    [config, setConfig]
  );

  const updateMinPathTraceRatio = useCallback(
    (value: number) => {
      setConfig({ ...config, minPathTraceRatio: value });
    },
    [config, setConfig]
  );

  const updateDisableLoopCheck = useCallback(
    (value: boolean) => {
      setConfig({ ...config, disableLoopCheck: value });
    },
    [config, setConfig]
  );

  const updateMaxUnnecessaryPaints = useCallback(
    (value: number) => {
      setConfig({ ...config, maxUnnecessaryPaints: value });
    },
    [config, setConfig]
  );

  const updateMinPathLength = useCallback(
    (value: number) => {
      setConfig({ ...config, minPathLength: value });
    },
    [config, setConfig]
  );

  const updateMinConditionals = useCallback(
    (value: number) => {
      setConfig({ ...config, minConditionals: value });
    },
    [config, setConfig]
  );

  const updateMinPaintRevisits = useCallback(
    (value: number) => {
      setConfig({ ...config, minPaintRevisits: value });
    },
    [config, setConfig]
  );

  // Get the filtered program (only executed instructions)
  const filteredProgram = useMemo(() => {
    return filterExecutedInstructions(state.program, state.executedSlots);
  }, [state.program, state.executedSlots]);

  // Save/Load handlers
  const handleSavePuzzle = useCallback(() => {
    if (!puzzleConfig || !puzzleName.trim()) return;
    const saved = savePuzzle(puzzleName.trim(), puzzleConfig, filteredProgram);
    setSavedPuzzles(prev => [saved, ...prev]);
    setPuzzleName('');
  }, [puzzleConfig, puzzleName, filteredProgram]);

  const handleDeletePuzzle = useCallback((id: string) => {
    deleteSavedPuzzle(id);
    setSavedPuzzles(prev => prev.filter(p => p.id !== id));
    if (selectedPuzzle?.id === id) {
      setSelectedPuzzle(null);
    }
  }, [selectedPuzzle]);

  const handleSaveConfig = useCallback(async () => {
    if (!configName.trim()) return;
    const saved = saveConfig(configName.trim(), config);
    setSavedConfigs(prev => [saved, ...prev]);
    setConfigName('');

    // Sync to Supabase if authenticated
    if (isAuthenticated && user?.id) {
      await saveConfigToSupabase(user.id, saved);
    }
  }, [config, configName, isAuthenticated, user?.id]);

  const handleLoadConfig = useCallback((savedConfig: SavedConfig) => {
    setConfig(savedConfig.config);
    setShowSavedConfigs(false);
  }, [setConfig]);

  const handleDeleteConfig = useCallback(async (id: string) => {
    deleteSavedConfig(id);
    setSavedConfigs(prev => prev.filter(c => c.id !== id));

    // Delete from Supabase if authenticated
    if (isAuthenticated && user?.id) {
      await deleteConfigFromSupabase(user.id, id);
    }
  }, [isAuthenticated, user?.id]);

  const isRunning = state.status === 'running' || state.status === 'retrying';
  const executedCount = state.executedSlots.size;
  const coveragePercent = totalSlots > 0 ? Math.round((executedCount / totalSlots) * 100) : 0;

  // Timer for simulation duration
  const [elapsedTime, setElapsedTime] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (isRunning) {
      // Start timer if not already started
      if (startTimeRef.current === null) {
        startTimeRef.current = Date.now();
        setElapsedTime(0);
      }

      // Update elapsed time every 100ms
      const interval = setInterval(() => {
        if (startTimeRef.current !== null) {
          setElapsedTime(Date.now() - startTimeRef.current);
        }
      }, 100);

      return () => clearInterval(interval);
    } else {
      // Reset start time when not running (but keep elapsed time for display)
      if (state.status === 'idle') {
        startTimeRef.current = null;
        setElapsedTime(0);
      } else if (state.status === 'success' || state.status === 'exhausted') {
        // Keep final time but clear ref
        startTimeRef.current = null;
      }
    }
  }, [isRunning, state.status]);

  // Format elapsed time as mm:ss.t
  const formatTime = (ms: number): string => {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const tenths = Math.floor((ms % 1000) / 100);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`;
  };

  // Show Game component for playthrough (current simulation result)
  if (isPlayingThrough && puzzleConfig) {
    return (
      <div className={styles.playthroughContainer}>
        <button
          className={styles.backButton}
          onClick={() => setIsPlayingThrough(false)}
        >
          <ArrowLeft size={16} />
          Back to Simulation
        </button>
        <Game puzzle={puzzleConfig} initialProgram={filteredProgram} />
      </div>
    );
  }

  // Show Game component for saved puzzle playthrough
  if (selectedPuzzle) {
    return (
      <div className={styles.playthroughContainer}>
        <button
          className={styles.backButton}
          onClick={() => setSelectedPuzzle(null)}
        >
          <ArrowLeft size={16} />
          Back to Simulation
        </button>
        <Game puzzle={selectedPuzzle.puzzle} initialProgram={selectedPuzzle.program} />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.configPanel}>
        <h3 className={styles.sectionTitle}>Configuration</h3>

        <div className={styles.configSection}>
          <label className={styles.label}>Function Slots</label>
          <div className={styles.slotsGrid}>
            {(['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]).map(fn => (
              <div key={fn} className={styles.slotConfig}>
                <span className={styles.slotLabel}>{fn.toUpperCase()}</span>
                <input
                  type="number"
                  min={0}
                  max={20}
                  value={config.slotsPerFunction[fn]}
                  onChange={e => updateSlots(fn, parseInt(e.target.value) || 0)}
                  disabled={isRunning}
                  className={styles.numberInput}
                />
              </div>
            ))}
          </div>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Max Steps</label>
          <input
            type="number"
            min={100}
            max={10000}
            step={100}
            value={config.maxSteps}
            onChange={e => updateMaxSteps(parseInt(e.target.value) || 1000)}
            disabled={isRunning}
            className={styles.numberInput}
          />
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Grid Size</label>
          <input
            type="number"
            min={8}
            max={64}
            step={1}
            value={config.gridSize}
            onChange={e => updateGridSize(parseInt(e.target.value) || 16)}
            disabled={isRunning}
            className={styles.numberInput}
          />
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Auto-Restart After (retries)</label>
          <input
            type="number"
            min={100}
            max={100000}
            step={100}
            value={config.autoRestartAfter}
            onChange={e => updateAutoRestartAfter(parseInt(e.target.value) || 1000)}
            disabled={isRunning}
            className={styles.numberInput}
          />
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Tile Color Ratios</label>
          <div className={styles.colorRatios}>
            <div className={styles.colorRatio}>
              <span className={styles.colorDot} style={{ backgroundColor: '#EF4444' }} />
              <input
                type="number"
                min={0}
                max={10}
                value={config.colorRatios.red}
                onChange={e => updateColorRatio('red', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.colorRatio}>
              <span className={styles.colorDot} style={{ backgroundColor: '#22C55E' }} />
              <input
                type="number"
                min={0}
                max={10}
                value={config.colorRatios.green}
                onChange={e => updateColorRatio('green', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.colorRatio}>
              <span className={styles.colorDot} style={{ backgroundColor: '#3B82F6' }} />
              <input
                type="number"
                min={0}
                max={10}
                value={config.colorRatios.blue}
                onChange={e => updateColorRatio('blue', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Min Coverage %</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              value={config.minCoveragePercent}
              onChange={e => updateMinCoverage(parseInt(e.target.value))}
              disabled={isRunning}
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{config.minCoveragePercent}%</span>
          </div>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Conditional %</label>
          <div className={styles.sliderRow}>
            <input
              type="range"
              min={0}
              max={100}
              value={config.conditionalPercent}
              onChange={e => updateConditionalPercent(parseInt(e.target.value))}
              disabled={isRunning}
              className={styles.slider}
            />
            <span className={styles.sliderValue}>{config.conditionalPercent}%</span>
          </div>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Instruction Weights</label>
          <div className={styles.weightsGrid}>
            <div className={styles.weightConfig}>
              <span className={styles.weightLabel}>Fwd</span>
              <input
                type="number"
                min={0}
                max={10}
                value={config.instructionWeights.forward}
                onChange={e => updateInstructionWeight('forward', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.weightConfig}>
              <span className={styles.weightLabel}>Turn</span>
              <input
                type="number"
                min={0}
                max={10}
                value={config.instructionWeights.turn}
                onChange={e => updateInstructionWeight('turn', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.weightConfig}>
              <span className={styles.weightLabel}>Call</span>
              <input
                type="number"
                min={0}
                max={10}
                value={config.instructionWeights.functionCall}
                onChange={e => updateInstructionWeight('functionCall', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.weightConfig}>
              <span className={styles.weightLabel}>Paint</span>
              <input
                type="number"
                min={0}
                max={10}
                value={config.instructionWeights.paint}
                onChange={e => updateInstructionWeight('paint', parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
          </div>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Path Constraints</label>
          <div className={styles.constraintsGrid}>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Min Tiles</span>
              <input
                type="number"
                min={1}
                max={50}
                value={config.minTiles}
                onChange={e => updateMinTiles(parseInt(e.target.value) || 1)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Min Box</span>
              <input
                type="number"
                min={1}
                max={16}
                value={config.minBoundingBox}
                onChange={e => updateMinBoundingBox(parseInt(e.target.value) || 1)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Min Turns</span>
              <input
                type="number"
                min={0}
                max={20}
                value={config.minTurns}
                onChange={e => updateMinTurns(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Max Dense</span>
              <input
                type="number"
                min={0}
                max={20}
                value={config.maxDenseTiles}
                onChange={e => updateMaxDenseTiles(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Avg Exec</span>
              <input
                type="number"
                min={1}
                max={100}
                value={config.maxAvgExecutionsPerSlot}
                onChange={e => updateMaxAvgExecutionsPerSlot(parseInt(e.target.value) || 1)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Min Depth</span>
              <input
                type="number"
                min={1}
                max={20}
                value={config.minStackDepth}
                onChange={e => updateMinStackDepth(parseInt(e.target.value) || 1)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Self Calls</span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.minSelfCalls}
                onChange={e => updateMinSelfCalls(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Path Ratio</span>
              <input
                type="number"
                min={0}
                max={10}
                step={0.1}
                value={config.minPathTraceRatio}
                onChange={e => updateMinPathTraceRatio(parseFloat(e.target.value) || 1)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Path Len</span>
              <input
                type="number"
                min={0}
                max={200}
                value={config.minPathLength}
                onChange={e => updateMinPathLength(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Cond.</span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.minConditionals}
                onChange={e => updateMinConditionals(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
            <div className={styles.constraintConfig}>
              <span className={styles.constraintLabel}>Paint Rev</span>
              <input
                type="number"
                min={0}
                max={100}
                value={config.minPaintRevisits}
                onChange={e => updateMinPaintRevisits(parseInt(e.target.value) || 0)}
                disabled={isRunning}
                className={styles.numberInput}
              />
            </div>
          </div>
          <label className={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={config.disableLoopCheck}
              onChange={e => updateDisableLoopCheck(e.target.checked)}
              disabled={isRunning}
              className={styles.checkbox}
            />
            Disable Loop Check
          </label>
          <div className={styles.inlineConfig}>
            <label className={styles.label}>Max Unnecessary Paints</label>
            <input
              type="number"
              min={-1}
              max={20}
              step={1}
              value={config.maxUnnecessaryPaints}
              onChange={e => updateMaxUnnecessaryPaints(parseInt(e.target.value))}
              disabled={isRunning}
              className={styles.numberInput}
              title="-1 = disabled, 0 = all paints must be necessary"
            />
          </div>
        </div>

        <div className={styles.controls}>
          <button
            onClick={start}
            disabled={isRunning}
            className={styles.startButton}
          >
            Start Simulation
          </button>
          <button
            onClick={stop}
            disabled={!isRunning}
            className={styles.stopButton}
          >
            Stop
          </button>
          <button
            onClick={reset}
            disabled={isRunning}
            className={styles.resetButton}
          >
            Reset
          </button>
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Save/Load Config</label>
          <div className={styles.saveLoadRow}>
            <input
              type="text"
              placeholder="Config name..."
              value={configName}
              onChange={e => setConfigName(e.target.value)}
              className={styles.nameInput}
            />
            <button
              onClick={handleSaveConfig}
              disabled={!configName.trim()}
              className={styles.saveButton}
              title="Save Config"
            >
              <Save size={14} />
            </button>
            <button
              onClick={() => setShowSavedConfigs(!showSavedConfigs)}
              className={styles.loadButton}
              title="Load Config"
            >
              <FolderOpen size={14} />
            </button>
          </div>
          {showSavedConfigs && savedConfigs.length > 0 && (
            <div className={styles.savedList}>
              {savedConfigs.map(c => (
                <div key={c.id} className={styles.savedItem}>
                  <span
                    className={styles.savedItemName}
                    onClick={() => handleLoadConfig(c)}
                  >
                    {c.name}
                  </span>
                  <button
                    onClick={() => handleDeleteConfig(c.id)}
                    className={styles.deleteButton}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {showSavedConfigs && savedConfigs.length === 0 && (
            <div className={styles.emptyMessage}>No saved configs</div>
          )}
        </div>

        <div className={styles.configSection}>
          <label className={styles.label}>Saved Puzzles</label>
          <button
            onClick={() => setShowSavedPuzzles(!showSavedPuzzles)}
            className={styles.loadButton}
            style={{ width: '100%' }}
          >
            <FolderOpen size={14} />
            {showSavedPuzzles ? 'Hide' : 'Show'} Saved Puzzles ({savedPuzzles.length})
          </button>
          {showSavedPuzzles && savedPuzzles.length > 0 && (
            <div className={styles.savedList}>
              {savedPuzzles.map(p => (
                <div key={p.id} className={styles.savedItem}>
                  <span
                    className={styles.savedItemName}
                    onClick={() => setSelectedPuzzle(p)}
                  >
                    {p.name}
                  </span>
                  <button
                    onClick={() => handleDeletePuzzle(p.id)}
                    className={styles.deleteButton}
                    title="Delete"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {showSavedPuzzles && savedPuzzles.length === 0 && (
            <div className={styles.emptyMessage}>No saved puzzles</div>
          )}
        </div>
      </div>

      <div className={styles.mainContent}>
        <div className={styles.statsPanel}>
          <h3 className={styles.sectionTitle}>Stats</h3>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Time:</span>
            <span className={styles.statValue}>{formatTime(elapsedTime)}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Status:</span>
            <span className={`${styles.statValue} ${styles[state.status]}`}>
              {state.status === 'running' && 'Running'}
              {state.status === 'retrying' && `Retrying (${state.errorType})`}
              {state.status === 'success' && 'Success'}
              {state.status === 'exhausted' && 'Exhausted'}
              {state.status === 'idle' && 'Idle'}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Retries:</span>
            <span className={styles.statValue}>{state.retryCount}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Unique Configs:</span>
            <span className={styles.statValue}>{state.triedConfigurations.size}</span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Coverage:</span>
            <span className={styles.statValue}>
              {executedCount}/{totalSlots} ({coveragePercent}%)
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Steps:</span>
            <span className={styles.statValue}>
              {state.stepCount} / {config.maxSteps}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Avg Exec/Slot:</span>
            <span className={styles.statValue}>
              {executedCount > 0 ? (state.stepCount / executedCount).toFixed(1) : '0'} / {config.maxAvgExecutionsPerSlot}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>Path Length:</span>
            <span className={styles.statValue}>
              {Math.max(0, state.robotPath.length - 1)} / {config.minPathLength > 0 ? config.minPathLength : '∞'}
            </span>
          </div>
        </div>

        {(isRunning || state.retryCount > 0) && (
          <div className={styles.statsPanel}>
            <h3 className={styles.sectionTitle}>Retry Reasons</h3>
            {state.errorCounts.boundary > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Boundary:</span>
                <span className={styles.statValue}>{state.errorCounts.boundary}</span>
              </div>
            )}
            {state.errorCounts.coverage > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Coverage:</span>
                <span className={styles.statValue}>{state.errorCounts.coverage}</span>
              </div>
            )}
            {state.errorCounts.loop > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Loop:</span>
                <span className={styles.statValue}>{state.errorCounts.loop}</span>
              </div>
            )}
            {state.errorCounts.minTiles > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Min Tiles:</span>
                <span className={styles.statValue}>{state.errorCounts.minTiles}</span>
              </div>
            )}
            {state.errorCounts.minBoundingBox > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Min Box:</span>
                <span className={styles.statValue}>{state.errorCounts.minBoundingBox}</span>
              </div>
            )}
            {state.errorCounts.minTurns > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Min Turns:</span>
                <span className={styles.statValue}>{state.errorCounts.minTurns}</span>
              </div>
            )}
            {state.errorCounts.density > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Density:</span>
                <span className={styles.statValue}>{state.errorCounts.density}</span>
              </div>
            )}
            {state.errorCounts.minStackDepth > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Min Depth:</span>
                <span className={styles.statValue}>{state.errorCounts.minStackDepth}</span>
              </div>
            )}
            {state.errorCounts.minSelfCalls > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Self Calls:</span>
                <span className={styles.statValue}>{state.errorCounts.minSelfCalls}</span>
              </div>
            )}
            {state.errorCounts.pathTraceRatio > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Path Ratio:</span>
                <span className={styles.statValue}>{state.errorCounts.pathTraceRatio}</span>
              </div>
            )}
            {state.errorCounts.minPathLength > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Path Length:</span>
                <span className={styles.statValue}>{state.errorCounts.minPathLength}</span>
              </div>
            )}
            {state.errorCounts.minConditionals > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Conditionals:</span>
                <span className={styles.statValue}>{state.errorCounts.minConditionals}</span>
              </div>
            )}
            {state.errorCounts.minPaintRevisits > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Paint Revisits:</span>
                <span className={styles.statValue}>{state.errorCounts.minPaintRevisits}</span>
              </div>
            )}
            {state.errorCounts.unnecessaryPaint > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Unnecessary Paint:</span>
                <span className={styles.statValue}>{state.errorCounts.unnecessaryPaint}</span>
              </div>
            )}
            {state.errorCounts.incomplete > 0 && (
              <div className={styles.stat}>
                <span className={styles.statLabel}>Incomplete:</span>
                <span className={styles.statValue}>{state.errorCounts.incomplete}</span>
              </div>
            )}
          </div>
        )}

        {state.grid.length > 0 && (
          <div className={styles.boardSection}>
            <SimulationBoard
              grid={state.grid}
              robotPosition={state.robotPosition}
              robotDirection={state.robotDirection}
              robotPath={state.robotPath}
              turnPositions={state.turnPositions}
            />
          </div>
        )}

        {state.status === 'success' && (
          <div className={styles.successSection}>
            <div className={styles.successHeader}>
              <h3 className={styles.sectionTitle}>Generated Program</h3>
              <div className={styles.successActions}>
                <span className={styles.pathRatioLabel}>
                  Path Ratio: {state.pathTraceInstructions}/{totalSlots} ({(state.pathTraceInstructions / totalSlots).toFixed(2)})
                </span>
                <button
                  className={styles.playThroughButton}
                  onClick={() => setIsPlayingThrough(true)}
                >
                  <Play size={16} />
                  Play Through
                </button>
              </div>
            </div>
            <div className={styles.savePuzzleRow}>
              <input
                type="text"
                placeholder="Puzzle name..."
                value={puzzleName}
                onChange={e => setPuzzleName(e.target.value)}
                className={styles.nameInput}
              />
              <button
                onClick={handleSavePuzzle}
                disabled={!puzzleName.trim()}
                className={styles.saveButton}
              >
                <Save size={14} />
                Save Puzzle
              </button>
            </div>
            <ProgramDisplay program={filteredProgram} />
          </div>
        )}

        {state.status === 'exhausted' && (
          <div className={styles.exhaustedMessage}>
            Exhausted search after {state.retryCount} retries
            ({state.triedConfigurations.size} unique configurations tried)
          </div>
        )}
      </div>
    </div>
  );
}
