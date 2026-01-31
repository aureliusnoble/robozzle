// Grid builder: constructs puzzle grids from solution paths

import type {
  Direction,
  InstructionType,
  Position,
  PuzzleConfig,
  Tile,
  TileColor,
} from '../../src/engine/types';
import type { PathSegment, SolutionTemplate } from './solution-generator';
import { SeededRandom, getFunctionLengths } from './solution-generator';

// Build a puzzle grid from a solution template
export function buildGrid(solution: SolutionTemplate, seed?: number): PuzzleConfig {
  const rng = new SeededRandom(seed);
  const path = solution.path;

  if (path.length === 0) {
    throw new Error('Cannot build grid from empty path');
  }

  // Create empty 16x12 grid
  const grid: (Tile | null)[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 16 }, () => null)
  );

  // Track which tiles we've placed (to handle duplicate positions in path)
  const placedTiles = new Map<string, { color: TileColor; hasStar: boolean }>();

  // First pass: place all tiles along the path
  for (const segment of path) {
    const { x, y, requiredColor, hasStar } = segment;
    const key = `${x},${y}`;

    if (x >= 0 && x < 16 && y >= 0 && y < 12) {
      const existing = placedTiles.get(key);

      // Determine tile color
      let color: TileColor;
      if (requiredColor) {
        // This tile needs a specific color for a conditional
        color = requiredColor;
      } else if (existing) {
        // Keep existing color
        color = existing.color;
      } else {
        // Random color from the solution's color palette
        color = rng.choice(solution.colors);
      }

      // Keep star if already has one, or if this segment has one
      const tileHasStar = hasStar || (existing?.hasStar ?? false);

      placedTiles.set(key, { color, hasStar: tileHasStar });
    }
  }

  // Ensure we have at least one star
  let hasAnyStar = false;
  for (const tile of placedTiles.values()) {
    if (tile.hasStar) {
      hasAnyStar = true;
      break;
    }
  }

  // If no stars, add stars at strategic positions
  if (!hasAnyStar && path.length > 0) {
    // Add star at the end of the path
    const lastKey = `${path[path.length - 1].x},${path[path.length - 1].y}`;
    const lastTile = placedTiles.get(lastKey);
    if (lastTile) {
      lastTile.hasStar = true;
    }

    // Add star at middle if path is long enough
    if (path.length >= 5) {
      const midIdx = Math.floor(path.length / 2);
      const midKey = `${path[midIdx].x},${path[midIdx].y}`;
      const midTile = placedTiles.get(midKey);
      if (midTile) {
        midTile.hasStar = true;
      }
    }

    // Add star near start if path is long
    if (path.length >= 8) {
      const earlyIdx = Math.floor(path.length / 4);
      const earlyKey = `${path[earlyIdx].x},${path[earlyIdx].y}`;
      const earlyTile = placedTiles.get(earlyKey);
      if (earlyTile) {
        earlyTile.hasStar = true;
      }
    }
  }

  // Build grid from placed tiles
  for (const [key, tile] of placedTiles.entries()) {
    const [x, y] = key.split(',').map(Number);
    grid[y][x] = tile;
  }

  // Get robot start position
  const robotStart: { position: Position; direction: Direction } = {
    position: { x: path[0].x, y: path[0].y },
    direction: solution.startDirection,
  };

  // Get function lengths from solution (limits visible function slots)
  const functionLengths = getFunctionLengths(solution.program);

  // Allow all basic instructions plus function calls for functions that exist
  // Only include fN if that function has slots (length > 0)
  const allowedInstructions: InstructionType[] = [
    'forward',
    'left',
    'right',
    'paint_red',
    'paint_green',
    'paint_blue',
  ];

  // Add function calls only for functions that have slots
  if (functionLengths.f1 > 0) allowedInstructions.push('f1');
  if (functionLengths.f2 > 0) allowedInstructions.push('f2');
  if (functionLengths.f3 > 0) allowedInstructions.push('f3');
  if (functionLengths.f4 > 0) allowedInstructions.push('f4');
  if (functionLengths.f5 > 0) allowedInstructions.push('f5');

  // Generate a unique ID
  const id = `gen-${Date.now().toString(36)}-${rng.nextInt(10000)}`;

  return {
    id,
    title: 'Generated Puzzle',
    grid,
    robotStart,
    functionLengths,
    allowedInstructions,
    category: 'daily',
    difficulty: 'hard',
  };
}

// Add additional tiles around the path for visual variety
// This is optional - can make puzzles look less "minimal"
export function addDecorativeTiles(
  puzzle: PuzzleConfig,
  solution: SolutionTemplate,
  density: number = 0.2,
  seed?: number
): PuzzleConfig {
  const rng = new SeededRandom(seed);
  const grid = puzzle.grid.map(row => row.map(tile => tile ? { ...tile } : null));

  // Get path tile positions
  const pathTiles = new Set<string>();
  for (const segment of solution.path) {
    pathTiles.add(`${segment.x},${segment.y}`);
  }

  // Find tiles adjacent to path
  const adjacentCandidates: Position[] = [];
  const directions = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];

  for (const segment of solution.path) {
    for (const dir of directions) {
      const nx = segment.x + dir.x;
      const ny = segment.y + dir.y;
      const key = `${nx},${ny}`;

      if (
        nx >= 0 && nx < 16 &&
        ny >= 0 && ny < 12 &&
        !pathTiles.has(key) &&
        grid[ny][nx] === null
      ) {
        adjacentCandidates.push({ x: nx, y: ny });
      }
    }
  }

  // Remove duplicates
  const uniqueCandidates = Array.from(
    new Set(adjacentCandidates.map(p => `${p.x},${p.y}`))
  ).map(key => {
    const [x, y] = key.split(',').map(Number);
    return { x, y };
  });

  // Add some decorative tiles (but not too many)
  const numToAdd = Math.floor(uniqueCandidates.length * density);
  const shuffled = rng.shuffle(uniqueCandidates);

  for (let i = 0; i < numToAdd && i < shuffled.length; i++) {
    const pos = shuffled[i];
    grid[pos.y][pos.x] = {
      color: rng.choice(solution.colors),
      hasStar: false, // Decorative tiles don't have stars
    };
  }

  return {
    ...puzzle,
    grid,
  };
}

// Ensure grid connectivity - all tiles should be reachable from start
export function validateConnectivity(puzzle: PuzzleConfig): boolean {
  const grid = puzzle.grid;
  const start = puzzle.robotStart.position;

  // BFS from start
  const visited = new Set<string>();
  const queue: Position[] = [start];
  visited.add(`${start.x},${start.y}`);

  const directions = [
    { x: 0, y: -1 }, { x: 0, y: 1 }, { x: -1, y: 0 }, { x: 1, y: 0 },
  ];

  while (queue.length > 0) {
    const pos = queue.shift()!;

    for (const dir of directions) {
      const nx = pos.x + dir.x;
      const ny = pos.y + dir.y;
      const key = `${nx},${ny}`;

      if (
        nx >= 0 && nx < grid[0].length &&
        ny >= 0 && ny < grid.length &&
        grid[ny][nx] !== null &&
        !visited.has(key)
      ) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }

  // Count total tiles and verify all are reachable
  let totalTiles = 0;
  let totalStars = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== null) {
        totalTiles++;
        if (grid[y][x]!.hasStar) totalStars++;
        if (!visited.has(`${x},${y}`)) {
          return false; // Found unreachable tile
        }
      }
    }
  }

  // Must have at least one star
  return totalStars > 0;
}

// Count tiles in grid
export function countTiles(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) count++;
    }
  }
  return count;
}

// Count stars in grid
export function countStars(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.hasStar) count++;
    }
  }
  return count;
}

// Get colors used in grid
export function getGridColors(grid: (Tile | null)[][]): TileColor[] {
  const colors = new Set<TileColor>();
  for (const row of grid) {
    for (const tile of row) {
      if (tile?.color) {
        colors.add(tile.color);
      }
    }
  }
  return Array.from(colors);
}

// Print grid for debugging
export function printGrid(grid: (Tile | null)[][]): string {
  const lines: string[] = [];

  for (let y = 0; y < grid.length; y++) {
    let line = '';
    for (let x = 0; x < grid[y].length; x++) {
      const tile = grid[y][x];
      if (tile === null) {
        line += '  ';
      } else if (tile.hasStar) {
        line += '★ ';
      } else {
        const colorChar = tile.color === 'red' ? 'R' : tile.color === 'green' ? 'G' : tile.color === 'blue' ? 'B' : '.';
        line += colorChar + ' ';
      }
    }
    lines.push(line.trimEnd());
  }

  // Remove empty lines at top and bottom
  while (lines.length > 0 && lines[0].trim() === '') lines.shift();
  while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();

  return lines.join('\n');
}

// Adjust grid position to be more centered
export function centerGrid(puzzle: PuzzleConfig): PuzzleConfig {
  const grid = puzzle.grid;

  // Find bounding box of tiles
  let minX = 16, maxX = 0, minY = 12, maxY = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== null) {
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Calculate offset to center
  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const offsetX = Math.floor((16 - width) / 2) - minX;
  const offsetY = Math.floor((12 - height) / 2) - minY;

  // If already roughly centered, don't change
  if (Math.abs(offsetX) <= 1 && Math.abs(offsetY) <= 1) {
    return puzzle;
  }

  // Create new centered grid
  const newGrid: (Tile | null)[][] = Array.from({ length: 12 }, () =>
    Array.from({ length: 16 }, () => null)
  );

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x] !== null) {
        const newX = x + offsetX;
        const newY = y + offsetY;
        if (newX >= 0 && newX < 16 && newY >= 0 && newY < 12) {
          newGrid[newY][newX] = grid[y][x];
        }
      }
    }
  }

  // Adjust robot start position
  const newRobotStart = {
    position: {
      x: puzzle.robotStart.position.x + offsetX,
      y: puzzle.robotStart.position.y + offsetY,
    },
    direction: puzzle.robotStart.direction,
  };

  return {
    ...puzzle,
    grid: newGrid,
    robotStart: newRobotStart,
  };
}
