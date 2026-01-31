// Complexity measurement and validation for puzzles

import type { FunctionName, Program, PuzzleConfig, Tile, Direction, Position } from '../../src/engine/types';
import { BASELINE_REQUIREMENTS, type PuzzleProfile } from './config';

// Metric ranges for normalization
const METRIC_RANGES = {
  steps: { min: 1, max: 300 },
  instructions: { min: 1, max: 20 },
  stackDepth: { min: 1, max: 5 },
  conditionals: { min: 0, max: 20 },
};

// Complexity score bounds
const COMPLEXITY_BOUNDS = {
  min: 30,
  max: 80,
};

// Execution metrics
export interface ExecutionMetrics {
  steps: number;
  instructions: number;
  stackDepth: number;
  conditionals: number;
  functionsUsed: number;
  tilesVisited: number;
  starsCollected: number;
  totalStars: number;
  solved: boolean;
}

// Complexity check result
export interface ComplexityResult {
  passed: boolean;
  score: number;
  metrics: ExecutionMetrics;
  reason?: string;
  normalizedMetrics: {
    steps: number;
    instructions: number;
    stackDepth: number;
    conditionals: number;
  };
}

// Direction utilities
const DIRECTION_DELTAS: Record<Direction, Position> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

const TURN_LEFT: Record<Direction, Direction> = {
  up: 'left', left: 'down', down: 'right', right: 'up',
};

const TURN_RIGHT: Record<Direction, Direction> = {
  up: 'right', right: 'down', down: 'left', left: 'up',
};

// Measure execution of a program on a puzzle
export function measureExecution(
  puzzle: PuzzleConfig,
  program: Program,
  maxSteps: number = 500
): ExecutionMetrics {
  // Clone grid
  const grid: (Tile | null)[][] = puzzle.grid.map(row =>
    row.map(tile => tile ? { ...tile } : null)
  );

  // Count stars
  let totalStars = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.hasStar) totalStars++;
    }
  }

  // Robot state
  let pos = { ...puzzle.robotStart.position };
  let dir = puzzle.robotStart.direction;
  let starsCollected = 0;
  const visited = new Set<string>();
  visited.add(`${pos.x},${pos.y}`);

  // Track functions used
  const functionsUsed = new Set<FunctionName>();

  // Track stack depth and conditionals
  let maxStackDepth = 0;
  let conditionalExecutions = 0;

  // Instruction queue
  const queue: Array<[FunctionName, number]> = [['f1', 0]];
  let steps = 0;

  while (queue.length > 0 && steps < maxSteps) {
    // Track stack depth (queue length represents call stack)
    maxStackDepth = Math.max(maxStackDepth, queue.length);

    const [funcName, idx] = queue.shift()!;
    functionsUsed.add(funcName);
    const func = program[funcName];

    if (idx >= func.length) {
      if (funcName === 'f1' && queue.length === 0) {
        queue.push(['f1', 0]);
      }
      continue;
    }

    queue.unshift([funcName, idx + 1]);
    const instruction = func[idx];
    if (!instruction) continue;

    // Check color condition
    const tile = grid[pos.y]?.[pos.x];
    if (instruction.condition !== null) {
      conditionalExecutions++;
      if (!tile || tile.color !== instruction.condition) {
        continue;
      }
    }

    steps++;

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[dir];
        const newX = pos.x + delta.x;
        const newY = pos.y + delta.y;
        const newTile = grid[newY]?.[newX];

        if (!newTile) {
          return {
            steps,
            instructions: countInstructions(program),
            stackDepth: maxStackDepth,
            conditionals: conditionalExecutions,
            functionsUsed: functionsUsed.size,
            tilesVisited: visited.size,
            starsCollected,
            totalStars,
            solved: false,
          };
        }

        pos = { x: newX, y: newY };
        visited.add(`${pos.x},${pos.y}`);

        if (newTile.hasStar) {
          newTile.hasStar = false;
          starsCollected++;
          if (starsCollected === totalStars) {
            return {
              steps,
              instructions: countInstructions(program),
              stackDepth: maxStackDepth,
              conditionals: conditionalExecutions,
              functionsUsed: functionsUsed.size,
              tilesVisited: visited.size,
              starsCollected,
              totalStars,
              solved: true,
            };
          }
        }
        break;
      }

      case 'left':
        dir = TURN_LEFT[dir];
        break;

      case 'right':
        dir = TURN_RIGHT[dir];
        break;

      case 'f1':
      case 'f2':
      case 'f3':
      case 'f4':
      case 'f5':
        queue.unshift([instruction.type, 0]);
        break;

      case 'paint_red':
        if (tile) tile.color = 'red';
        break;

      case 'paint_green':
        if (tile) tile.color = 'green';
        break;

      case 'paint_blue':
        if (tile) tile.color = 'blue';
        break;

      case 'noop':
        break;
    }
  }

  return {
    steps,
    instructions: countInstructions(program),
    stackDepth: maxStackDepth,
    conditionals: conditionalExecutions,
    functionsUsed: functionsUsed.size,
    tilesVisited: visited.size,
    starsCollected,
    totalStars,
    solved: false,
  };
}

// Count non-null instructions in program
function countInstructions(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst !== null) count++;
    }
  }
  return count;
}

// Normalize a metric value to 0-100
function normalize(value: number, metric: keyof typeof METRIC_RANGES): number {
  const { min, max } = METRIC_RANGES[metric];
  return Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100));
}

// Calculate combined complexity score
function calculateComplexityScore(metrics: ExecutionMetrics): {
  score: number;
  normalized: { steps: number; instructions: number; stackDepth: number; conditionals: number };
} {
  const normalized = {
    steps: normalize(metrics.steps, 'steps'),
    instructions: normalize(metrics.instructions, 'instructions'),
    stackDepth: normalize(metrics.stackDepth, 'stackDepth'),
    conditionals: normalize(metrics.conditionals, 'conditionals'),
  };

  // Equal weights for all metrics
  const score = (normalized.steps + normalized.instructions + normalized.stackDepth + normalized.conditionals) / 4;

  return { score, normalized };
}

// Check if puzzle meets complexity requirements
// Accepts optional profile for profile-specific requirements
export function checkComplexity(
  puzzle: PuzzleConfig,
  program: Program,
  profile?: PuzzleProfile
): ComplexityResult {
  const metrics = measureExecution(puzzle, program);
  const req = profile?.requirements ?? BASELINE_REQUIREMENTS;

  // Check if puzzle is solvable
  if (!metrics.solved) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: 'not solvable',
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  // Check requirements (profile-specific or baseline)
  if (metrics.stackDepth < req.minStackDepth) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `stack depth ${metrics.stackDepth} < ${req.minStackDepth}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.functionsUsed < req.minFunctions) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `functions used ${metrics.functionsUsed} < ${req.minFunctions}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.functionsUsed > req.maxFunctions) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `functions used ${metrics.functionsUsed} > ${req.maxFunctions}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.conditionals < req.minConditionals) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `conditionals ${metrics.conditionals} < ${req.minConditionals}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.instructions < req.minInstructions) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `instructions ${metrics.instructions} < ${req.minInstructions}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.steps < req.minSteps) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `steps ${metrics.steps} < ${req.minSteps}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  if (metrics.steps > req.maxSteps) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `steps ${metrics.steps} > ${req.maxSteps}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  // Check steps per instruction ratio
  const stepsPerInstruction = metrics.steps / metrics.instructions;
  if (stepsPerInstruction < req.minStepsPerInstruction) {
    return {
      passed: false,
      score: 0,
      metrics,
      reason: `steps/instructions ${stepsPerInstruction.toFixed(1)} < ${req.minStepsPerInstruction}`,
      normalizedMetrics: { steps: 0, instructions: 0, stackDepth: 0, conditionals: 0 },
    };
  }

  // Calculate complexity score
  const { score, normalized } = calculateComplexityScore(metrics);

  // Check score bounds
  if (score < COMPLEXITY_BOUNDS.min) {
    return {
      passed: false,
      score,
      metrics,
      reason: `score ${score.toFixed(1)} < ${COMPLEXITY_BOUNDS.min}`,
      normalizedMetrics: normalized,
    };
  }

  if (score > COMPLEXITY_BOUNDS.max) {
    return {
      passed: false,
      score,
      metrics,
      reason: `score ${score.toFixed(1)} > ${COMPLEXITY_BOUNDS.max}`,
      normalizedMetrics: normalized,
    };
  }

  return {
    passed: true,
    score,
    metrics,
    normalizedMetrics: normalized,
  };
}

// Get a readable summary of metrics
export function formatMetrics(metrics: ExecutionMetrics): string {
  return [
    `steps: ${metrics.steps}`,
    `instructions: ${metrics.instructions}`,
    `stackDepth: ${metrics.stackDepth}`,
    `conditionals: ${metrics.conditionals}`,
    `functions: ${metrics.functionsUsed}`,
    `tiles: ${metrics.tilesVisited}`,
    `solved: ${metrics.solved}`,
  ].join(', ');
}

// Export constants for use in other modules
export { COMPLEXITY_BOUNDS, METRIC_RANGES };
