/**
 * Conversion script to download and convert RoboZZle puzzles from the community archive.
 *
 * Source: https://github.com/lostmsu/RoboZZle.LevelArchive
 *
 * Usage: npx tsx scripts/convert-puzzles.ts
 */

import { XMLParser } from 'fast-xml-parser';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const LEVELS_URL = 'https://raw.githubusercontent.com/lostmsu/RoboZZle.LevelArchive/master/levels.xml';
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'puzzles', 'classic', 'index.json');

// Minimum quality thresholds
const MIN_DIFFICULTY_VOTES = 5;
const MIN_LIKE_RATIO = 0.5; // At least 50% likes

// Types matching the XML structure
interface RawPuzzle {
  Id: string | number;
  Title?: string;
  About?: string;
  Colors: string | { 'd3p1:string': string[] };
  Items: string | { 'd3p1:string': string[] };
  RobotCol: string | number;
  RobotRow: string | number;
  RobotDir: string | number;
  SubLengths: { int?: (string | number)[] | string | number; 'd3p1:int'?: (string | number)[] | string | number };
  AllowedCommands: string | number;
  SubmittedBy?: string | number;
  DifficultyVoteSum?: string | number;
  DifficultyVoteCount?: string | number;
  Liked?: string | number;
  Disliked?: string | number;
}

interface LevelsXML {
  ArrayOfLevelInfo2: {
    LevelInfo2: RawPuzzle[];
  };
}

// Output types
type TileColor = 'red' | 'green' | 'blue' | null;
type Direction = 'up' | 'down' | 'left' | 'right';
type InstructionType =
  | 'forward'
  | 'left'
  | 'right'
  | 'f1' | 'f2' | 'f3' | 'f4' | 'f5'
  | 'paint_red' | 'paint_green' | 'paint_blue'
  | 'noop';

interface Tile {
  color: TileColor;
  hasStar: boolean;
}

interface PuzzleConfig {
  id: string;
  title: string;
  description?: string;
  grid: (Tile | null)[][];
  robotStart: {
    position: { x: number; y: number };
    direction: Direction;
  };
  functionLengths: {
    f1: number;
    f2: number;
    f3: number;
    f4: number;
    f5: number;
  };
  allowedInstructions: InstructionType[];
  category: 'classic';
  difficulty: 'easy' | 'medium' | 'hard' | 'expert' | 'impossible';
  author?: string;
  stars?: number;
  communityDifficulty?: number;
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
  '#': null,
  '.': null,
};

function parseColor(char: string): TileColor | 'void' {
  if (char === '#' || char === '.') return 'void';
  return COLOR_MAP[char.toUpperCase()] || null;
}

function toNumber(val: string | number | undefined, defaultVal: number = 0): number {
  if (val === undefined) return defaultVal;
  const num = typeof val === 'string' ? parseInt(val, 10) : val;
  return isNaN(num) ? defaultVal : num;
}

function parseSubLengths(subLengths: { int?: (string | number)[] | string | number; 'd3p1:int'?: (string | number)[] | string | number } | undefined): number[] {
  if (!subLengths) return [0, 0, 0, 0, 0];

  // Handle both XML namespace formats
  const intVal = subLengths.int ?? subLengths['d3p1:int'];
  if (!intVal) return [0, 0, 0, 0, 0];

  if (Array.isArray(intVal)) {
    return intVal.map(v => toNumber(v)).concat([0, 0, 0, 0, 0]).slice(0, 5);
  }

  // Single value
  return [toNumber(intVal), 0, 0, 0, 0];
}

function extractGridString(data: string | { 'd3p1:string': string[] } | undefined): string {
  if (!data) return '';
  if (typeof data === 'string') return data;
  if (data['d3p1:string'] && Array.isArray(data['d3p1:string'])) {
    return data['d3p1:string'].join('');
  }
  return '';
}

function convertPuzzleWithReason(raw: RawPuzzle): { puzzle: PuzzleConfig | null; reason?: string } {
  const result = convertPuzzle(raw);
  if (result) return { puzzle: result };

  // Check why it failed
  const GRID_WIDTH = 16;
  const GRID_HEIGHT = 12;
  const subLengths = parseSubLengths(raw.SubLengths);
  const robotCol = toNumber(raw.RobotCol);
  const robotRow = toNumber(raw.RobotRow);

  if (robotRow < 0 || robotRow >= GRID_HEIGHT || robotCol < 0 || robotCol >= GRID_WIDTH) {
    return { puzzle: null, reason: 'robot_out_of_bounds' };
  }

  const itemsStr = extractGridString(raw.Items);
  const items = itemsStr.padEnd(GRID_WIDTH * GRID_HEIGHT, '#');

  const robotIndex = robotRow * GRID_WIDTH + robotCol;
  // Check if robot starts on void (# in items means void)
  if (items[robotIndex] === '#') {
    return { puzzle: null, reason: 'robot_on_void' };
  }

  // Check stars
  let starCount = 0;
  for (let i = 0; i < itemsStr.length; i++) {
    if (itemsStr[i] === '*') starCount++;
  }
  if (starCount === 0) {
    return { puzzle: null, reason: 'no_stars' };
  }

  if (subLengths[0] === 0) {
    return { puzzle: null, reason: 'f1_empty' };
  }

  return { puzzle: null, reason: 'unknown' };
}

function convertPuzzle(raw: RawPuzzle): PuzzleConfig | null {
  const GRID_WIDTH = 16;
  const GRID_HEIGHT = 12;

  // Parse grid - extract from nested structure or flat string
  const grid: (Tile | null)[][] = [];
  const colorsStr = extractGridString(raw.Colors);
  const itemsStr = extractGridString(raw.Items);
  const colors = colorsStr.padEnd(GRID_WIDTH * GRID_HEIGHT, '#');
  const items = itemsStr.padEnd(GRID_WIDTH * GRID_HEIGHT, '.');

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

  // Parse sub lengths
  const subLengths = parseSubLengths(raw.SubLengths);

  // Allow all instructions - the archive doesn't have reliable data about which
  // instructions are allowed, so we allow everything. The puzzle constraints
  // come from the function slot limits (functionLengths).
  const allowedInstructions: InstructionType[] = [
    'forward', 'left', 'right',
    'f1',
    'paint_red', 'paint_green', 'paint_blue',
  ];

  // Add function calls for functions that have slots
  if (subLengths[1] > 0) allowedInstructions.push('f2');
  if (subLengths[2] > 0) allowedInstructions.push('f3');
  if (subLengths[3] > 0) allowedInstructions.push('f4');
  if (subLengths[4] > 0) allowedInstructions.push('f5');

  // Calculate difficulty
  const voteCount = toNumber(raw.DifficultyVoteCount);
  const voteSum = toNumber(raw.DifficultyVoteSum);

  let communityDifficulty: number | undefined;
  let stars: number;
  let difficulty: PuzzleConfig['difficulty'];

  if (voteCount > 0) {
    communityDifficulty = voteSum / voteCount;

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
    const totalSlots = subLengths.reduce((a, b) => a + b, 0);
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

  const robotCol = toNumber(raw.RobotCol);
  const robotRow = toNumber(raw.RobotRow);
  const robotDir = toNumber(raw.RobotDir);

  // Validation
  // Check robot starts on valid tile
  if (robotRow < 0 || robotRow >= GRID_HEIGHT || robotCol < 0 || robotCol >= GRID_WIDTH) {
    return null;
  }
  if (grid[robotRow][robotCol] === null) {
    return null;
  }

  // Check at least one star exists
  let starCount = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.hasStar) starCount++;
    }
  }
  if (starCount === 0) {
    return null;
  }

  // Check at least F1 has slots
  if (subLengths[0] === 0) {
    return null;
  }

  const id = String(raw.Id);
  const title = raw.Title || `Puzzle ${id}`;
  const author = raw.SubmittedBy || undefined;

  const puzzle: PuzzleConfig = {
    id: `classic-${id}`,
    title,
    grid,
    robotStart: {
      position: { x: robotCol, y: robotRow },
      direction: DIRECTION_MAP[robotDir] || 'right',
    },
    functionLengths: {
      f1: subLengths[0],
      f2: subLengths[1],
      f3: subLengths[2],
      f4: subLengths[3],
      f5: subLengths[4],
    },
    allowedInstructions,
    category: 'classic',
    difficulty,
    stars,
  };

  if (raw.About) {
    puzzle.description = raw.About;
  }

  if (author) {
    puzzle.author = author;
  }

  if (communityDifficulty !== undefined) {
    puzzle.communityDifficulty = Math.round(communityDifficulty * 100) / 100;
  }

  return puzzle;
}

function filterByQuality(raw: RawPuzzle): boolean {
  const voteCount = toNumber(raw.DifficultyVoteCount);
  const liked = toNumber(raw.Liked);
  const disliked = toNumber(raw.Disliked);

  // Must have minimum difficulty votes
  if (voteCount < MIN_DIFFICULTY_VOTES) {
    return false;
  }

  // Must have positive like ratio (if any votes)
  const totalLikeVotes = liked + disliked;
  if (totalLikeVotes > 0) {
    const likeRatio = liked / totalLikeVotes;
    if (likeRatio < MIN_LIKE_RATIO) {
      return false;
    }
  }

  return true;
}

async function downloadLevels(): Promise<string> {
  console.log(`Downloading levels from ${LEVELS_URL}...`);
  const response = await fetch(LEVELS_URL);
  if (!response.ok) {
    throw new Error(`Failed to download levels: ${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  console.log(`Downloaded ${(text.length / 1024 / 1024).toFixed(2)} MB`);
  return text;
}

async function main() {
  try {
    // Download the XML file
    const xmlText = await downloadLevels();

    // Parse XML
    console.log('Parsing XML...');
    const parser = new XMLParser({
      ignoreAttributes: true,
      isArray: (name) => name === 'LevelInfo2' || name === 'int',
    });
    const parsed = parser.parse(xmlText) as LevelsXML;

    const rawPuzzles = parsed.ArrayOfLevelInfo2?.LevelInfo2;
    if (!rawPuzzles || !Array.isArray(rawPuzzles)) {
      throw new Error('No puzzles found in XML');
    }

    console.log(`Found ${rawPuzzles.length} total puzzles`);

    // Filter by quality
    const qualityFiltered = rawPuzzles.filter(filterByQuality);
    console.log(`After quality filter: ${qualityFiltered.length} puzzles`);

    // Debug: log a sample puzzle structure
    if (qualityFiltered.length > 0) {
      console.log('\nSample puzzle structure:');
      console.log(JSON.stringify(qualityFiltered[0], null, 2));
    }

    // Convert puzzles
    const converted: PuzzleConfig[] = [];
    let invalidCount = 0;
    const invalidReasons: Record<string, number> = {};

    for (const raw of qualityFiltered) {
      const result = convertPuzzleWithReason(raw);
      if (result.puzzle) {
        converted.push(result.puzzle);
      } else {
        invalidCount++;
        invalidReasons[result.reason || 'unknown'] = (invalidReasons[result.reason || 'unknown'] || 0) + 1;
      }
    }

    console.log('\nInvalid puzzle reasons:');
    for (const [reason, count] of Object.entries(invalidReasons)) {
      console.log(`  ${reason}: ${count}`);
    }

    console.log(`Converted: ${converted.length} puzzles (${invalidCount} invalid)`);

    // Sort by difficulty (stars) then by community difficulty score
    converted.sort((a, b) => {
      // First by stars (ascending)
      if ((a.stars ?? 1) !== (b.stars ?? 1)) {
        return (a.stars ?? 1) - (b.stars ?? 1);
      }
      // Then by community difficulty (ascending)
      return (a.communityDifficulty ?? 0) - (b.communityDifficulty ?? 0);
    });

    // Output statistics
    const stats = {
      easy: converted.filter(p => p.difficulty === 'easy').length,
      medium: converted.filter(p => p.difficulty === 'medium').length,
      hard: converted.filter(p => p.difficulty === 'hard').length,
      expert: converted.filter(p => p.difficulty === 'expert').length,
      impossible: converted.filter(p => p.difficulty === 'impossible').length,
    };

    console.log('\nDifficulty distribution:');
    console.log(`  Easy (1★): ${stats.easy}`);
    console.log(`  Medium (2★): ${stats.medium}`);
    console.log(`  Hard (3★): ${stats.hard}`);
    console.log(`  Expert (4★): ${stats.expert}`);
    console.log(`  Impossible (5★): ${stats.impossible}`);

    const withAuthors = converted.filter(p => p.author).length;
    console.log(`\nPuzzles with author attribution: ${withAuthors} (${Math.round(withAuthors / converted.length * 100)}%)`);

    // Write metadata index (small file for local loading)
    const outputDir = path.dirname(OUTPUT_PATH);
    console.log('\nWriting metadata index...');
    const indexData = converted.map(p => ({
      id: p.id,
      title: p.title,
      description: p.description,
      author: p.author,
      stars: p.stars,
      difficulty: p.difficulty,
      f1: p.functionLengths.f1,
      f2: p.functionLengths.f2,
      f3: p.functionLengths.f3,
    }));
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(indexData));
    const indexStats = fs.statSync(OUTPUT_PATH);
    console.log(`  index.json: ${(indexStats.size / 1024 / 1024).toFixed(2)} MB`);

    // Write full puzzle data for Supabase upload (to scripts/ directory, not public/)
    const fullDataPath = path.join(__dirname, 'full-data.json');
    console.log('\nWriting full puzzle data for Supabase...');
    fs.writeFileSync(fullDataPath, JSON.stringify(converted));
    const fullStats = fs.statSync(fullDataPath);
    console.log(`  full-data.json: ${(fullStats.size / 1024 / 1024).toFixed(2)} MB`);

    console.log('\nDone! Next steps:');
    console.log('1. Upload full-data.json to Supabase puzzles table');
    console.log('2. The app will load metadata from index.json');
    console.log('3. Full puzzle data loads from Supabase when user selects a puzzle');
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

main();
