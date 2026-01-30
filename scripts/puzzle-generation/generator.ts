// Random puzzle generator using templates

import { validatePuzzle } from '../../src/engine/puzzleParser';
import type { PuzzleConfig, Tile } from '../../src/engine/types';
import type { GenerationConfig, MechanicCategory, PuzzleCandidate } from './types';
import { DEFAULT_GENERATION_CONFIG, MAX_GENERATION_RETRIES } from './config';
import { getRandomTemplate, getTemplatesByCategory } from './templates';

// Seeded random for reproducibility
class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.floor(Math.random() * 2147483647);
  }

  next(): number {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(max: number): number {
    return Math.floor(this.next() * max);
  }
}

// Convert candidate to full puzzle config
function candidateToPuzzleConfig(
  candidate: PuzzleCandidate,
  id: string,
  title: string
): PuzzleConfig {
  return {
    id,
    title,
    grid: candidate.grid,
    robotStart: candidate.robotStart,
    functionLengths: candidate.functionLengths,
    allowedInstructions: candidate.allowedInstructions,
    category: 'daily', // Generated puzzles go to daily category
    difficulty: 'hard', // All generated puzzles are medium-hard
  };
}

// Validate candidate puzzle structure
function validateCandidate(candidate: PuzzleCandidate): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check grid has tiles
  let tileCount = 0;
  let starCount = 0;
  for (const row of candidate.grid) {
    for (const tile of row) {
      if (tile !== null) {
        tileCount++;
        if (tile.hasStar) starCount++;
      }
    }
  }

  if (tileCount < 5) {
    errors.push('Grid has too few tiles');
  }

  if (starCount === 0) {
    errors.push('No stars in puzzle');
  }

  // Check robot start
  const { x, y } = candidate.robotStart.position;
  if (y < 0 || y >= candidate.grid.length || x < 0 || x >= candidate.grid[0].length) {
    errors.push('Robot starts outside grid');
  } else if (candidate.grid[y][x] === null) {
    errors.push('Robot starts on void tile');
  }

  // Check total slots <= 15
  const totalSlots =
    candidate.functionLengths.f1 +
    candidate.functionLengths.f2 +
    candidate.functionLengths.f3 +
    candidate.functionLengths.f4 +
    candidate.functionLengths.f5;

  if (totalSlots > 15) {
    errors.push(`Total slots (${totalSlots}) exceeds maximum of 15`);
  }

  if (totalSlots < 4) {
    errors.push(`Total slots (${totalSlots}) is too few`);
  }

  // Check F1 has slots
  if (candidate.functionLengths.f1 === 0) {
    errors.push('F1 must have at least one slot');
  }

  return { valid: errors.length === 0, errors };
}

// Generate a puzzle candidate from a template
export function generateFromTemplate(
  category: MechanicCategory,
  config: Partial<GenerationConfig> = {},
  seed?: number
): PuzzleCandidate | null {
  const fullConfig: GenerationConfig = {
    ...DEFAULT_GENERATION_CONFIG,
    mechanicCategory: category,
    ...config,
    seed,
  };

  const template = getRandomTemplate(category, seed);

  try {
    const candidate = template.generate(fullConfig);
    const validation = validateCandidate(candidate);

    if (!validation.valid) {
      console.warn(`Template ${template.name} generated invalid puzzle:`, validation.errors);
      return null;
    }

    return candidate;
  } catch (error) {
    console.error(`Error generating from template ${template.name}:`, error);
    return null;
  }
}

// Generate a valid puzzle candidate with retries
export function generateCandidate(
  category: MechanicCategory,
  config: Partial<GenerationConfig> = {},
  baseSeed?: number
): PuzzleCandidate | null {
  const rng = new SeededRandom(baseSeed);

  for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
    const seed = baseSeed ? baseSeed + attempt * 1000 : rng.nextInt(2147483647);
    const candidate = generateFromTemplate(category, config, seed);

    if (candidate) {
      return candidate;
    }
  }

  console.error(`Failed to generate valid candidate for ${category} after ${MAX_GENERATION_RETRIES} attempts`);
  return null;
}

// Generate a full puzzle config
export function generatePuzzle(
  category: MechanicCategory,
  id: string,
  title: string,
  config: Partial<GenerationConfig> = {},
  seed?: number
): PuzzleConfig | null {
  const candidate = generateCandidate(category, config, seed);

  if (!candidate) {
    return null;
  }

  const puzzle = candidateToPuzzleConfig(candidate, id, title);

  // Final validation
  const validation = validatePuzzle(puzzle);
  if (!validation.valid) {
    console.warn(`Generated puzzle failed validation:`, validation.errors);
    return null;
  }

  return puzzle;
}

// Generate multiple puzzles for a category
export function generatePuzzleBatch(
  category: MechanicCategory,
  count: number,
  idPrefix: string,
  config: Partial<GenerationConfig> = {},
  baseSeed?: number
): PuzzleConfig[] {
  const puzzles: PuzzleConfig[] = [];
  const rng = new SeededRandom(baseSeed);

  let attempts = 0;
  const maxAttempts = count * 10;

  while (puzzles.length < count && attempts < maxAttempts) {
    const seed = rng.nextInt(2147483647);
    const id = `${idPrefix}-${category}-${puzzles.length + 1}`;
    const title = `Generated ${category.charAt(0).toUpperCase() + category.slice(1)} #${puzzles.length + 1}`;

    const puzzle = generatePuzzle(category, id, title, config, seed);

    if (puzzle) {
      puzzles.push(puzzle);
    }

    attempts++;
  }

  if (puzzles.length < count) {
    console.warn(
      `Only generated ${puzzles.length}/${count} puzzles for ${category} after ${attempts} attempts`
    );
  }

  return puzzles;
}

// Get grid statistics
export function getGridStats(grid: (Tile | null)[][]): {
  tileCount: number;
  starCount: number;
  colorCounts: Record<string, number>;
  width: number;
  height: number;
  density: number;
} {
  let tileCount = 0;
  let starCount = 0;
  const colorCounts: Record<string, number> = { red: 0, green: 0, blue: 0, null: 0 };

  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) {
        tileCount++;
        if (tile.hasStar) starCount++;
        colorCounts[tile.color || 'null']++;
      }
    }
  }

  const width = grid[0]?.length || 0;
  const height = grid.length;
  const totalCells = width * height;

  return {
    tileCount,
    starCount,
    colorCounts,
    width,
    height,
    density: totalCells > 0 ? tileCount / totalCells : 0,
  };
}

// Debug: Print grid to console
export function printGrid(grid: (Tile | null)[][]): string {
  const lines: string[] = [];

  for (const row of grid) {
    let line = '';
    for (const tile of row) {
      if (tile === null) {
        line += '#';
      } else if (tile.hasStar) {
        line += '*';
      } else {
        line += tile.color?.[0].toUpperCase() || '.';
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}
