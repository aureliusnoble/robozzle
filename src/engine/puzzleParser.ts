import type { Direction, InstructionType, PuzzleConfig, Tile, TileColor } from './types';

// Parse puzzles from various formats

export interface ClassicPuzzleXML {
  Id: string;
  Title: string;
  About?: string;
  Colors: string; // 12x16 grid as string
  Items: string; // Star positions
  RobotCol: number;
  RobotRow: number;
  RobotDir: number; // 0=right, 1=down, 2=left, 3=up
  SubLengths: number[];
  AllowedCommands: number;
  Difficulty?: number;
  SubmittedBy?: string;
  DifficultyVoteSum?: number;
  DifficultyVoteCount?: number;
  Liked?: number;
  Disliked?: number;
}

const DIRECTION_MAP: Record<number, Direction> = {
  0: 'right',
  1: 'down',
  2: 'left',
  3: 'up',
};

const COLOR_MAP: Record<string, TileColor> = {
  'R': 'red',
  'G': 'green',
  'B': 'blue',
  '#': null, // void
  '.': null, // empty/walkable without color? Treat as null for now
};

// Parse color character to TileColor (null for void spaces)
function parseColor(char: string): TileColor | 'void' {
  if (char === '#' || char === '.') return 'void';
  return COLOR_MAP[char.toUpperCase()] || null;
}

// Parse classic puzzle format from RoboZZle archive
export function parseClassicPuzzle(data: ClassicPuzzleXML): PuzzleConfig {
  const GRID_WIDTH = 16;
  const GRID_HEIGHT = 12;

  // Parse grid
  const grid: (Tile | null)[][] = [];
  const colors = data.Colors.padEnd(GRID_WIDTH * GRID_HEIGHT, '#');
  const items = data.Items.padEnd(GRID_WIDTH * GRID_HEIGHT, '.');

  for (let y = 0; y < GRID_HEIGHT; y++) {
    const row: (Tile | null)[] = [];
    for (let x = 0; x < GRID_WIDTH; x++) {
      const index = y * GRID_WIDTH + x;
      const colorChar = colors[index];
      const itemChar = items[index];

      // Items determines if tile is void: # = void, . = walkable, * = star
      // Colors determines the color of walkable tiles: R/G/B
      if (itemChar === '#') {
        row.push(null); // Void tile
      } else {
        const color = parseColor(colorChar);
        row.push({
          color: color === 'void' ? null : color,
          hasStar: itemChar === '*',
        });
      }
    }
    grid.push(row);
  }

  // Parse allowed commands from bitmask
  const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'f1'];
  const allowedMask = data.AllowedCommands;

  // Bit flags (typical RoboZZle format):
  // 1 = F2, 2 = F3, 4 = F4, 8 = F5
  // 16 = paint red, 32 = paint green, 64 = paint blue
  if (allowedMask & 1) allowedInstructions.push('f2');
  if (allowedMask & 2) allowedInstructions.push('f3');
  if (allowedMask & 4) allowedInstructions.push('f4');
  if (allowedMask & 8) allowedInstructions.push('f5');
  if (allowedMask & 16) allowedInstructions.push('paint_red');
  if (allowedMask & 32) allowedInstructions.push('paint_green');
  if (allowedMask & 64) allowedInstructions.push('paint_blue');

  // Calculate community difficulty score if available
  let communityDifficulty: number | undefined;
  let stars: number | undefined;
  let difficulty: PuzzleConfig['difficulty'];

  if (data.DifficultyVoteCount && data.DifficultyVoteCount > 0 && data.DifficultyVoteSum !== undefined) {
    communityDifficulty = data.DifficultyVoteSum / data.DifficultyVoteCount;

    // Map community difficulty (1-5 scale) to stars (1-20 scale)
    // Linear mapping: 1.0 → 1 star, 5.0 → 20 stars
    stars = Math.max(1, Math.min(20, Math.round((communityDifficulty - 1) * 4.75) + 1));

    // Difficulty bands based on stars (1-20 scale)
    if (stars >= 17) {
      difficulty = 'impossible';
    } else if (stars >= 13) {
      difficulty = 'expert';
    } else if (stars >= 9) {
      difficulty = 'hard';
    } else if (stars >= 5) {
      difficulty = 'medium';
    } else {
      difficulty = 'easy';
    }
  } else {
    // Fallback: estimate from total slots
    const totalSlots = data.SubLengths.reduce((a, b) => a + b, 0);
    if (totalSlots > 20) {
      difficulty = 'expert';
      stars = 14;
    } else if (totalSlots > 12) {
      difficulty = 'hard';
      stars = 10;
    } else if (totalSlots > 6) {
      difficulty = 'medium';
      stars = 6;
    } else {
      difficulty = 'easy';
      stars = 2;
    }
  }

  return {
    id: `classic-${data.Id}`,
    title: data.Title || `Puzzle ${data.Id}`,
    description: data.About,
    grid,
    robotStart: {
      position: { x: data.RobotCol, y: data.RobotRow },
      direction: DIRECTION_MAP[data.RobotDir] || 'right',
    },
    functionLengths: {
      f1: data.SubLengths[0] || 0,
      f2: data.SubLengths[1] || 0,
      f3: data.SubLengths[2] || 0,
      f4: data.SubLengths[3] || 0,
      f5: data.SubLengths[4] || 0,
    },
    allowedInstructions,
    category: 'classic',
    difficulty,
    author: data.SubmittedBy || undefined,
    stars,
    communityDifficulty: communityDifficulty !== undefined ? Math.round(communityDifficulty * 100) / 100 : undefined,
  };
}

// Create a simple puzzle for testing/tutorials
export function createSimplePuzzle(config: {
  id: string;
  title: string;
  description?: string;
  grid: string[]; // Array of strings, each char is a tile
  robotX: number;
  robotY: number;
  robotDir: Direction;
  stars: { x: number; y: number }[];
  functionLengths?: Partial<PuzzleConfig['functionLengths']>;
  allowedInstructions?: InstructionType[];
  category?: PuzzleConfig['category'];
  difficulty?: PuzzleConfig['difficulty'];
  tutorialStep?: number;
  hint?: string;
  warning?: string;
}): PuzzleConfig {
  const grid: (Tile | null)[][] = config.grid.map((rowStr, y) =>
    rowStr.split('').map((char, x) => {
      if (char === '#' || char === ' ') return null;
      const hasStar = config.stars.some(s => s.x === x && s.y === y);
      return {
        color: COLOR_MAP[char.toUpperCase()] || null,
        hasStar,
      };
    })
  );

  return {
    id: config.id,
    title: config.title,
    description: config.description,
    grid,
    robotStart: {
      position: { x: config.robotX, y: config.robotY },
      direction: config.robotDir,
    },
    functionLengths: {
      f1: config.functionLengths?.f1 ?? 5,
      f2: config.functionLengths?.f2 ?? 0,
      f3: config.functionLengths?.f3 ?? 0,
      f4: config.functionLengths?.f4 ?? 0,
      f5: config.functionLengths?.f5 ?? 0,
    },
    allowedInstructions: config.allowedInstructions ?? ['forward', 'left', 'right', 'f1'],
    category: config.category ?? 'tutorial',
    difficulty: config.difficulty ?? 'easy',
    tutorialStep: config.tutorialStep,
    hint: config.hint,
    warning: config.warning,
  };
}

// Validate puzzle is solvable (basic check)
export function validatePuzzle(puzzle: PuzzleConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check robot starts on valid tile
  const { x, y } = puzzle.robotStart.position;
  if (y < 0 || y >= puzzle.grid.length || x < 0 || x >= puzzle.grid[0].length) {
    errors.push('Robot starts outside grid');
  } else if (puzzle.grid[y][x] === null) {
    errors.push('Robot starts on void tile');
  }

  // Check at least one star exists
  let starCount = 0;
  for (const row of puzzle.grid) {
    for (const tile of row) {
      if (tile?.hasStar) starCount++;
    }
  }
  if (starCount === 0) {
    errors.push('No stars in puzzle');
  }

  // Check at least F1 has slots
  if (puzzle.functionLengths.f1 === 0) {
    errors.push('F1 must have at least one slot');
  }

  return { valid: errors.length === 0, errors };
}
