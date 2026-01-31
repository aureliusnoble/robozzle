// Configuration for puzzle generation system

// Timeout configuration - guarantees bounded execution
export const TIMEOUT_CONFIG = {
  perPuzzleMs: 20000, // 20 seconds max per puzzle
  trivialityMs: 1000, // 1 second for triviality check
  verificationMs: 100, // 100ms for verification
  totalGenerationMs: 1500000, // 25 minutes total
};

// Triviality check configuration
export const TRIVIALITY_CONFIG = {
  maxProgramsToTest: 2000, // Absolute program limit
  maxStepsPerProgram: 100, // Hard cutoff per program
};

// Baseline requirements (minimum for any puzzle)
export const BASELINE_REQUIREMENTS = {
  minStackDepth: 3,
  minFunctions: 2,
  maxFunctions: 5,
  minConditionals: 2,
  minInstructions: 4,
  minSteps: 10,
  maxSteps: 200,
  minStepsPerInstruction: 2,
  requiresPainting: false,
};

// Puzzle profile - each emphasizes different aspects
export interface PuzzleProfile {
  name: string;
  description: string;
  requirements: {
    minStackDepth: number;
    minFunctions: number;
    maxFunctions: number;
    minConditionals: number;
    minInstructions: number;
    minSteps: number;
    maxSteps: number;
    minStepsPerInstruction: number;
    requiresPainting: boolean;
  };
  weight: number; // Probability weight for random selection
}

// 7 distinct puzzle profiles for weekly variety
export const PUZZLE_PROFILES: PuzzleProfile[] = [
  {
    name: 'Deep Recursion',
    description: 'Requires deep call stack (4-5 levels)',
    requirements: {
      minStackDepth: 4,
      minFunctions: 2,
      maxFunctions: 3,
      minConditionals: 2,
      minInstructions: 4,
      minSteps: 15,
      maxSteps: 150,
      minStepsPerInstruction: 2,
      requiresPainting: false,
    },
    weight: 1,
  },
  {
    name: 'Multi-Function',
    description: 'Uses 4-5 functions with complex coordination',
    requirements: {
      minStackDepth: 3,
      minFunctions: 4,
      maxFunctions: 5,
      minConditionals: 3,
      minInstructions: 6,
      minSteps: 20,
      maxSteps: 180,
      minStepsPerInstruction: 2,
      requiresPainting: false,
    },
    weight: 1,
  },
  {
    name: 'Painter',
    description: 'Requires painting tiles to solve',
    requirements: {
      minStackDepth: 3,
      minFunctions: 2,
      maxFunctions: 4,
      minConditionals: 3,
      minInstructions: 5,
      minSteps: 15,
      maxSteps: 150,
      minStepsPerInstruction: 2,
      requiresPainting: true,
    },
    weight: 1.5, // Slightly higher weight since painting is unique
  },
  {
    name: 'Efficient Looper',
    description: 'High steps-per-instruction ratio (tight loops)',
    requirements: {
      minStackDepth: 3,
      minFunctions: 2,
      maxFunctions: 3,
      minConditionals: 2,
      minInstructions: 3,
      minSteps: 20,
      maxSteps: 200,
      minStepsPerInstruction: 4,
      requiresPainting: false,
    },
    weight: 1,
  },
  {
    name: 'Instruction Heavy',
    description: 'Requires more instructions to solve',
    requirements: {
      minStackDepth: 3,
      minFunctions: 2,
      maxFunctions: 4,
      minConditionals: 4,
      minInstructions: 7,
      minSteps: 20,
      maxSteps: 180,
      minStepsPerInstruction: 2,
      requiresPainting: false,
    },
    weight: 1,
  },
  {
    name: 'High Conditionals',
    description: 'Many color-based conditional decisions',
    requirements: {
      minStackDepth: 3,
      minFunctions: 2,
      maxFunctions: 4,
      minConditionals: 5,
      minInstructions: 5,
      minSteps: 15,
      maxSteps: 150,
      minStepsPerInstruction: 2,
      requiresPainting: false,
    },
    weight: 1,
  },
  {
    name: 'Balanced',
    description: 'Standard puzzle with baseline requirements',
    requirements: {
      minStackDepth: 3,
      minFunctions: 2,
      maxFunctions: 4,
      minConditionals: 2,
      minInstructions: 4,
      minSteps: 12,
      maxSteps: 200,
      minStepsPerInstruction: 2,
      requiresPainting: false,
    },
    weight: 1,
  },
];

// Get a random profile using weights
export function getRandomProfile(rng: { next: () => number }): PuzzleProfile {
  const totalWeight = PUZZLE_PROFILES.reduce((sum, p) => sum + p.weight, 0);
  let random = rng.next() * totalWeight;

  for (const profile of PUZZLE_PROFILES) {
    random -= profile.weight;
    if (random <= 0) return profile;
  }

  return PUZZLE_PROFILES[PUZZLE_PROFILES.length - 1];
}

// Get profile by index (for deterministic selection)
export function getProfileByIndex(index: number): PuzzleProfile {
  return PUZZLE_PROFILES[index % PUZZLE_PROFILES.length];
}

// Legacy export for backward compatibility
export const HARD_REQUIREMENTS = BASELINE_REQUIREMENTS;

// Quality thresholds
export const QUALITY_THRESHOLDS = {
  minScore: 55,
  minInstructions: 3,
  maxSolverGenerations: 150,
  minSolverGenerations: 5,
  minTileUtilization: 0.25,
  maxTileUtilization: 0.95,
};

// Max steps for solver
export const MAX_SOLVER_STEPS = 500;

// Generation retry limits
export const MAX_GENERATION_RETRIES = 100;
export const MAX_SOLVER_RETRIES = 3;
