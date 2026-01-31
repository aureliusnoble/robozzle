// Tile pruning algorithm to remove non-essential tiles

import type { Program, PuzzleConfig, Tile } from '../../src/engine/types';
import type { PruningResult } from './types';
import { runProgram } from './verifier';

// Get visited tiles during execution
function getVisitedTiles(puzzle: PuzzleConfig, program: Program): Set<string> {
  const result = runProgram(puzzle, program);
  // We need to track visited tiles - let's create a simple version
  const grid = puzzle.grid.map(row => row.map(tile => tile ? { ...tile } : null));
  const visited = new Set<string>();

  let pos = { ...puzzle.robotStart.position };
  let dir = puzzle.robotStart.direction;
  visited.add(`${pos.x},${pos.y}`);

  const DIRECTION_DELTAS: Record<string, { x: number; y: number }> = {
    up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
  };
  const TURN_LEFT: Record<string, string> = { up: 'left', left: 'down', down: 'right', right: 'up' };
  const TURN_RIGHT: Record<string, string> = { up: 'right', right: 'down', down: 'left', left: 'up' };

  type FunctionName = 'f1' | 'f2' | 'f3' | 'f4' | 'f5';
  const queue: Array<[FunctionName, number]> = [['f1', 0]];
  let steps = 0;
  const maxSteps = 500;

  while (queue.length > 0 && steps < maxSteps) {
    const [funcName, idx] = queue.shift()!;
    const func = program[funcName];

    if (idx >= func.length) {
      if (funcName === 'f1' && queue.length === 0) queue.push(['f1', 0]);
      continue;
    }

    queue.unshift([funcName, idx + 1]);
    const instruction = func[idx];
    if (!instruction) continue;

    const tile = grid[pos.y]?.[pos.x];
    if (instruction.condition !== null) {
      if (!tile || tile.color !== instruction.condition) continue;
    }

    steps++;

    if (instruction.type === 'forward') {
      const delta = DIRECTION_DELTAS[dir];
      const newX = pos.x + delta.x;
      const newY = pos.y + delta.y;
      if (!grid[newY]?.[newX]) break;
      pos = { x: newX, y: newY };
      visited.add(`${pos.x},${pos.y}`);
      if (grid[newY][newX]?.hasStar) grid[newY][newX]!.hasStar = false;
    } else if (instruction.type === 'left') {
      dir = TURN_LEFT[dir] as typeof dir;
    } else if (instruction.type === 'right') {
      dir = TURN_RIGHT[dir] as typeof dir;
    } else if (['f1', 'f2', 'f3', 'f4', 'f5'].includes(instruction.type)) {
      queue.unshift([instruction.type as FunctionName, 0]);
    } else if (instruction.type.startsWith('paint_') && tile) {
      tile.color = instruction.type.replace('paint_', '') as 'red' | 'green' | 'blue';
    }
  }

  return visited;
}

// Quick check if solution still works
function quickEvaluate(puzzle: PuzzleConfig, program: Program): { solved: boolean } {
  return { solved: runProgram(puzzle, program).solved };
}

// Deep clone a grid
function cloneGrid(grid: (Tile | null)[][]): (Tile | null)[][] {
  return grid.map(row => row.map(tile => (tile ? { ...tile } : null)));
}

// Get all star positions
function getStarPositions(grid: (Tile | null)[][]): Set<string> {
  const stars = new Set<string>();
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid[y].length; x++) {
      if (grid[y][x]?.hasStar) {
        stars.add(`${x},${y}`);
      }
    }
  }
  return stars;
}

// Count tiles in grid
function countTiles(grid: (Tile | null)[][]): number {
  let count = 0;
  for (const row of grid) {
    for (const tile of row) {
      if (tile !== null) count++;
    }
  }
  return count;
}

// Check if a position is adjacent to another tile (connectivity check)
function hasAdjacentTile(grid: (Tile | null)[][], x: number, y: number, excludePos?: string): boolean {
  const directions = [
    [0, -1], [0, 1], [-1, 0], [1, 0],
  ];

  for (const [dx, dy] of directions) {
    const nx = x + dx;
    const ny = y + dy;
    const key = `${nx},${ny}`;

    if (excludePos && key === excludePos) continue;

    if (ny >= 0 && ny < grid.length && nx >= 0 && nx < grid[0].length) {
      if (grid[ny][nx] !== null) {
        return true;
      }
    }
  }

  return false;
}

// Check if removing a tile would disconnect the grid
function wouldDisconnect(
  grid: (Tile | null)[][],
  removeX: number,
  removeY: number,
  robotStart: { x: number; y: number },
  starPositions: Set<string>
): boolean {
  // Create a test grid without the tile
  const testGrid = cloneGrid(grid);
  testGrid[removeY][removeX] = null;

  // BFS from robot start position
  const visited = new Set<string>();
  const queue: [number, number][] = [[robotStart.x, robotStart.y]];
  visited.add(`${robotStart.x},${robotStart.y}`);

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;

    const directions = [
      [0, -1], [0, 1], [-1, 0], [1, 0],
    ];

    for (const [dx, dy] of directions) {
      const nx = x + dx;
      const ny = y + dy;
      const key = `${nx},${ny}`;

      if (visited.has(key)) continue;
      if (ny < 0 || ny >= testGrid.length || nx < 0 || nx >= testGrid[0].length) continue;
      if (testGrid[ny][nx] === null) continue;

      visited.add(key);
      queue.push([nx, ny]);
    }
  }

  // Check if all stars are still reachable
  for (const starPos of starPositions) {
    if (!visited.has(starPos)) {
      return true; // Would disconnect a star
    }
  }

  return false;
}

// Prune non-essential tiles from a puzzle
export function pruneTiles(
  puzzle: PuzzleConfig,
  solution: Program
): PruningResult {
  const originalTileCount = countTiles(puzzle.grid);

  // Get tiles visited during solution execution
  const visitedTiles = getVisitedTiles(puzzle, solution);

  // Get star positions (always essential)
  const starPositions = getStarPositions(puzzle.grid);

  // Get robot start position (always essential)
  const robotStart = puzzle.robotStart.position;
  const robotKey = `${robotStart.x},${robotStart.y}`;

  // Clone grid for modification
  let prunedGrid = cloneGrid(puzzle.grid);
  let tilesRemoved = 0;

  // Collect all tile positions
  const allTiles: [number, number][] = [];
  for (let y = 0; y < prunedGrid.length; y++) {
    for (let x = 0; x < prunedGrid[y].length; x++) {
      if (prunedGrid[y][x] !== null) {
        allTiles.push([x, y]);
      }
    }
  }

  // Shuffle tiles for random pruning order
  for (let i = allTiles.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allTiles[i], allTiles[j]] = [allTiles[j], allTiles[i]];
  }

  // Try to remove each non-essential tile
  for (const [x, y] of allTiles) {
    const key = `${x},${y}`;

    // Skip essential tiles
    if (key === robotKey) continue;
    if (starPositions.has(key)) continue;
    if (visitedTiles.has(key)) continue;

    // Check if removal would disconnect the grid
    if (wouldDisconnect(prunedGrid, x, y, robotStart, starPositions)) {
      continue;
    }

    // Try removing the tile
    const testGrid = cloneGrid(prunedGrid);
    testGrid[y][x] = null;

    // Create test puzzle
    const testPuzzle: PuzzleConfig = {
      ...puzzle,
      grid: testGrid,
    };

    // Verify solution still works
    const result = quickEvaluate(testPuzzle, solution);

    if (result.solved) {
      // Removal is safe
      prunedGrid = testGrid;
      tilesRemoved++;
    }
  }

  // Final verification
  const finalPuzzle: PuzzleConfig = {
    ...puzzle,
    grid: prunedGrid,
  };
  const finalResult = quickEvaluate(finalPuzzle, solution);

  return {
    prunedGrid,
    tilesRemoved,
    originalTileCount,
    finalTileCount: originalTileCount - tilesRemoved,
    stillSolvable: finalResult.solved,
  };
}

// More aggressive pruning - try to minimize grid
export function aggressivePrune(
  puzzle: PuzzleConfig,
  solution: Program,
  maxIterations: number = 3
): PruningResult {
  let currentGrid = cloneGrid(puzzle.grid);
  let totalRemoved = 0;
  const originalCount = countTiles(puzzle.grid);

  for (let iter = 0; iter < maxIterations; iter++) {
    const iterPuzzle: PuzzleConfig = {
      ...puzzle,
      grid: currentGrid,
    };

    const result = pruneTiles(iterPuzzle, solution);

    if (result.tilesRemoved === 0) {
      // No more tiles can be removed
      break;
    }

    currentGrid = result.prunedGrid;
    totalRemoved += result.tilesRemoved;

    if (!result.stillSolvable) {
      // Rollback - shouldn't happen but safety check
      break;
    }
  }

  // Final verification
  const finalPuzzle: PuzzleConfig = {
    ...puzzle,
    grid: currentGrid,
  };
  const finalResult = quickEvaluate(finalPuzzle, solution);

  return {
    prunedGrid: currentGrid,
    tilesRemoved: totalRemoved,
    originalTileCount: originalCount,
    finalTileCount: originalCount - totalRemoved,
    stillSolvable: finalResult.solved,
  };
}

// Check for dead tiles (tiles that exist but aren't visited in solution)
export function findDeadTiles(
  puzzle: PuzzleConfig,
  solution: Program
): { deadTiles: Set<string>; percentage: number } {
  const visitedTiles = getVisitedTiles(puzzle, solution);
  const deadTiles = new Set<string>();

  let totalTiles = 0;

  for (let y = 0; y < puzzle.grid.length; y++) {
    for (let x = 0; x < puzzle.grid[y].length; x++) {
      if (puzzle.grid[y][x] !== null) {
        totalTiles++;
        const key = `${x},${y}`;
        if (!visitedTiles.has(key)) {
          deadTiles.add(key);
        }
      }
    }
  }

  return {
    deadTiles,
    percentage: totalTiles > 0 ? deadTiles.size / totalTiles : 0,
  };
}
