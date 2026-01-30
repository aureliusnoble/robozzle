// Puzzle templates organized by mechanic category

import type { Direction, InstructionType, Position, Tile, TileColor } from '../../src/engine/types';
import type { GenerationConfig, MechanicCategory, PuzzleCandidate, PuzzleTemplate } from './types';
import { FUNCTION_DISTRIBUTIONS, SLOT_RANGES } from './config';

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

  nextIntRange(min: number, max: number): number {
    return min + this.nextInt(max - min + 1);
  }

  choice<T>(arr: T[]): T {
    return arr[this.nextInt(arr.length)];
  }

  shuffle<T>(arr: T[]): T[] {
    const result = [...arr];
    for (let i = result.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }
}

// Helper: Create empty grid
function createEmptyGrid(width: number, height: number): (Tile | null)[][] {
  return Array(height).fill(null).map(() => Array(width).fill(null));
}

// Helper: Place a tile
function placeTile(
  grid: (Tile | null)[][],
  x: number,
  y: number,
  color: TileColor,
  hasStar: boolean = false
): void {
  if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) {
    grid[y][x] = { color, hasStar };
  }
}

// Helper: Check if position is valid
function isValidPos(grid: (Tile | null)[][], x: number, y: number): boolean {
  return y >= 0 && y < grid.length && x >= 0 && x < grid[0].length;
}

// Helper: Check if tile exists at position
function hasTile(grid: (Tile | null)[][], x: number, y: number): boolean {
  return isValidPos(grid, x, y) && grid[y][x] !== null;
}

// Helper: Get direction delta
const DIRECTION_DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  down: [0, 1],
  left: [-1, 0],
  right: [1, 0],
};

// Helper: Turn direction
function turnRight(dir: Direction): Direction {
  const turns: Record<Direction, Direction> = { up: 'right', right: 'down', down: 'left', left: 'up' };
  return turns[dir];
}

function turnLeft(dir: Direction): Direction {
  const turns: Record<Direction, Direction> = { up: 'left', left: 'down', down: 'right', right: 'up' };
  return turns[dir];
}

// Helper: Generate function lengths based on category
function generateFunctionLengths(
  category: MechanicCategory,
  maxTotal: number,
  rng: SeededRandom
): { f1: number; f2: number; f3: number; f4: number; f5: number } {
  const dist = FUNCTION_DISTRIBUTIONS[category];

  const f1 = rng.nextIntRange(dist.f1[0], dist.f1[1]);
  const f2 = rng.nextIntRange(dist.f2[0], Math.min(dist.f2[1], maxTotal - f1));
  const f3 = rng.nextIntRange(dist.f3[0], Math.min(dist.f3[1], maxTotal - f1 - f2));

  return { f1, f2, f3, f4: 0, f5: 0 };
}

// ============================================
// CONDITIONALS TEMPLATES
// ============================================

const colorBranch: PuzzleTemplate = {
  name: 'color-branch',
  category: 'conditionals',
  description: 'Turn only on specific colors to navigate branching paths',
  minSlots: 8,
  maxSlots: 12,
  requiredInstructions: ['forward', 'left', 'right'],
  optionalInstructions: ['f2'],
  minColors: 2,
  maxColors: 3,
  minStars: 2,
  maxStars: 4,
  pathComplexity: 'branching',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Create a path that branches based on color
    const startX = rng.nextIntRange(2, 5);
    const startY = rng.nextIntRange(2, 5);
    const startDir: Direction = rng.choice(['right', 'down']);

    const colors: TileColor[] = rng.shuffle(['red', 'green', 'blue']).slice(0, rng.nextIntRange(2, 3));
    const starPositions: Position[] = [];

    // Main path
    let x = startX;
    let y = startY;
    let dir = startDir;

    // Place starting tile
    placeTile(grid, x, y, colors[0]);

    // Create a winding path with color-based decision points
    const pathLength = rng.nextIntRange(8, 14);
    let colorIndex = 0;

    for (let i = 0; i < pathLength; i++) {
      const [dx, dy] = DIRECTION_DELTA[dir];
      const nextX = x + dx;
      const nextY = y + dy;

      if (!isValidPos(grid, nextX, nextY)) {
        // Turn if we hit edge
        dir = rng.next() < 0.5 ? turnRight(dir) : turnLeft(dir);
        continue;
      }

      // Place tile with alternating colors at decision points
      const isDecisionPoint = i > 0 && i % 3 === 0;
      const tileColor = isDecisionPoint ? colors[(++colorIndex) % colors.length] : colors[colorIndex % colors.length];
      const placeStar = starPositions.length < 3 && rng.next() < 0.25 && i > 2;

      placeTile(grid, nextX, nextY, tileColor, placeStar);
      if (placeStar) starPositions.push({ x: nextX, y: nextY });

      x = nextX;
      y = nextY;

      // Turn at decision points
      if (isDecisionPoint && rng.next() < 0.7) {
        dir = rng.next() < 0.5 ? turnRight(dir) : turnLeft(dir);
      }
    }

    // Ensure at least 2 stars
    while (starPositions.length < 2) {
      for (let row = 0; row < grid.length && starPositions.length < 2; row++) {
        for (let col = 0; col < grid[row].length && starPositions.length < 2; col++) {
          if (grid[row][col] && !grid[row][col]!.hasStar && rng.next() < 0.3) {
            grid[row][col]!.hasStar = true;
            starPositions.push({ x: col, y: row });
          }
        }
      }
    }

    const functionLengths = generateFunctionLengths('conditionals', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: startX, y: startY }, direction: startDir },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'conditionals',
      templateName: 'color-branch',
    };
  },
};

const colorGate: PuzzleTemplate = {
  name: 'color-gate',
  category: 'conditionals',
  description: 'Paths blocked unless condition met',
  minSlots: 10,
  maxSlots: 15,
  requiredInstructions: ['forward', 'left', 'right'],
  optionalInstructions: ['f2'],
  minColors: 2,
  maxColors: 3,
  minStars: 2,
  maxStars: 3,
  pathComplexity: 'branching',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Create spiral pattern with gates
    const centerX = Math.floor(config.gridWidth / 2);
    const centerY = Math.floor(config.gridHeight / 2);

    const colors: TileColor[] = ['red', 'green'];
    const starPositions: Position[] = [];

    // Spiral outward
    let x = centerX;
    let y = centerY;
    let dir: Direction = 'right';
    let segmentLength = 2;
    let segmentCount = 0;

    placeTile(grid, x, y, colors[0]);

    for (let i = 0; i < 20; i++) {
      const [dx, dy] = DIRECTION_DELTA[dir];
      const nextX = x + dx;
      const nextY = y + dy;

      if (!isValidPos(grid, nextX, nextY) || hasTile(grid, nextX, nextY)) {
        dir = turnRight(dir);
        segmentCount++;
        if (segmentCount >= 2) {
          segmentLength++;
          segmentCount = 0;
        }
        continue;
      }

      // Gate tiles are different color
      const isGate = i > 0 && i % 4 === 0;
      const tileColor = isGate ? colors[1] : colors[0];
      const placeStar = starPositions.length < 3 && rng.next() < 0.2 && i > 4;

      placeTile(grid, nextX, nextY, tileColor, placeStar);
      if (placeStar) starPositions.push({ x: nextX, y: nextY });

      x = nextX;
      y = nextY;
    }

    // Ensure stars
    while (starPositions.length < 2) {
      for (let row = 0; row < grid.length && starPositions.length < 2; row++) {
        for (let col = 0; col < grid[row].length && starPositions.length < 2; col++) {
          if (grid[row][col] && !grid[row][col]!.hasStar && rng.next() < 0.3) {
            grid[row][col]!.hasStar = true;
            starPositions.push({ x: col, y: row });
          }
        }
      }
    }

    const functionLengths = generateFunctionLengths('conditionals', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: centerX, y: centerY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'conditionals',
      templateName: 'color-gate',
    };
  },
};

// ============================================
// RECURSION TEMPLATES
// ============================================

const corridorRecurse: PuzzleTemplate = {
  name: 'corridor-recurse',
  category: 'recursion',
  description: 'Walk corridor, recurse on color change',
  minSlots: 8,
  maxSlots: 12,
  requiredInstructions: ['forward', 'right', 'f2'],
  optionalInstructions: ['left', 'f3'],
  minColors: 2,
  maxColors: 2,
  minStars: 1,
  maxStars: 2,
  pathComplexity: 'simple',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Long corridor with turn at end
    const startX = rng.nextIntRange(1, 3);
    const startY = rng.nextIntRange(3, 6);
    const corridorLength = rng.nextIntRange(5, 9);

    const mainColor: TileColor = 'red';
    const turnColor: TileColor = 'green';
    const starPositions: Position[] = [];

    // Horizontal corridor
    for (let i = 0; i < corridorLength; i++) {
      const isEnd = i === corridorLength - 1;
      placeTile(grid, startX + i, startY, isEnd ? turnColor : mainColor);
    }

    // Vertical segment after turn
    const turnX = startX + corridorLength - 1;
    const vertLength = rng.nextIntRange(2, 4);
    for (let i = 1; i <= vertLength; i++) {
      const placeStar = i === vertLength;
      placeTile(grid, turnX, startY + i, mainColor, placeStar);
      if (placeStar) starPositions.push({ x: turnX, y: startY + i });
    }

    const functionLengths = generateFunctionLengths('recursion', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'right', 'f1', 'f2'];
    if (functionLengths.f3 > 0) allowedInstructions.push('f3');

    return {
      grid,
      robotStart: { position: { x: startX, y: startY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'recursion',
      templateName: 'corridor-recurse',
    };
  },
};

const bounceBack: PuzzleTemplate = {
  name: 'bounce-back',
  category: 'recursion',
  description: 'Go to end, recurse returns back',
  minSlots: 10,
  maxSlots: 15,
  requiredInstructions: ['forward', 'left', 'right', 'f2'],
  optionalInstructions: ['f3'],
  minColors: 2,
  maxColors: 3,
  minStars: 1,
  maxStars: 2,
  pathComplexity: 'looping',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Corridor with both ends marked by special color
    const startX = rng.nextIntRange(2, 4);
    const startY = rng.nextIntRange(4, 6);
    const corridorLength = rng.nextIntRange(4, 7);

    const mainColor: TileColor = 'red';
    const endColor: TileColor = 'green';
    const starPositions: Position[] = [];

    // Start tile (green)
    placeTile(grid, startX, startY, endColor);

    // Middle tiles (red)
    for (let i = 1; i < corridorLength - 1; i++) {
      placeTile(grid, startX + i, startY, mainColor);
    }

    // End tile (green)
    placeTile(grid, startX + corridorLength - 1, startY, endColor);

    // Star position - below start
    placeTile(grid, startX, startY + 1, mainColor, true);
    starPositions.push({ x: startX, y: startY + 1 });

    const functionLengths = generateFunctionLengths('recursion', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'f1', 'f2'];
    if (functionLengths.f3 > 0) allowedInstructions.push('f3');

    return {
      grid,
      robotStart: { position: { x: startX + 1, y: startY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'recursion',
      templateName: 'bounce-back',
    };
  },
};

// ============================================
// PAINTING TEMPLATES
// ============================================

const paintEscape: PuzzleTemplate = {
  name: 'paint-escape',
  category: 'painting',
  description: 'Paint to break loop and escape',
  minSlots: 8,
  maxSlots: 12,
  requiredInstructions: ['forward', 'right', 'paint_green'],
  optionalInstructions: ['left', 'paint_red'],
  minColors: 1,
  maxColors: 2,
  minStars: 2,
  maxStars: 3,
  pathComplexity: 'looping',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Small loop that can be escaped by painting
    const loopX = rng.nextIntRange(3, 6);
    const loopY = rng.nextIntRange(3, 5);
    const loopSize = rng.nextIntRange(2, 3);

    const starPositions: Position[] = [];

    // Create loop (2x2 or 3x3)
    for (let dy = 0; dy < loopSize; dy++) {
      for (let dx = 0; dx < loopSize; dx++) {
        if (dy === 0 || dy === loopSize - 1 || dx === 0 || dx === loopSize - 1) {
          const placeStar = starPositions.length === 0 && dx === loopSize - 1 && dy === loopSize - 1;
          placeTile(grid, loopX + dx, loopY + dy, 'red', placeStar);
          if (placeStar) starPositions.push({ x: loopX + dx, y: loopY + dy });
        }
      }
    }

    // Exit path from loop
    const exitX = loopX + loopSize;
    for (let i = 0; i < 3; i++) {
      const placeStar = i === 2;
      placeTile(grid, exitX + i, loopY, 'red', placeStar);
      if (placeStar) starPositions.push({ x: exitX + i, y: loopY });
    }

    const functionLengths = generateFunctionLengths('painting', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'right', 'paint_green', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: loopX, y: loopY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'painting',
      templateName: 'paint-escape',
    };
  },
};

const paintMemory: PuzzleTemplate = {
  name: 'paint-memory',
  category: 'painting',
  description: 'Paint marks visited tiles',
  minSlots: 10,
  maxSlots: 15,
  requiredInstructions: ['forward', 'left', 'right', 'paint_green'],
  optionalInstructions: ['paint_red', 'paint_blue', 'f2'],
  minColors: 1,
  maxColors: 2,
  minStars: 2,
  maxStars: 4,
  pathComplexity: 'branching',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Maze-like structure where painting helps track visited
    const startX = rng.nextIntRange(2, 4);
    const startY = rng.nextIntRange(2, 4);
    const starPositions: Position[] = [];

    // Create interconnected paths
    const visited = new Set<string>();

    function addPath(x: number, y: number, dir: Direction, length: number) {
      for (let i = 0; i < length; i++) {
        const key = `${x},${y}`;
        if (visited.has(key) || !isValidPos(grid, x, y)) break;

        visited.add(key);
        const placeStar = starPositions.length < 3 && rng.next() < 0.15 && i > 1;
        placeTile(grid, x, y, 'red', placeStar);
        if (placeStar) starPositions.push({ x, y });

        const [dx, dy] = DIRECTION_DELTA[dir];
        x += dx;
        y += dy;
      }
    }

    // Main path
    addPath(startX, startY, 'right', rng.nextIntRange(4, 7));
    addPath(startX + 3, startY, 'down', rng.nextIntRange(3, 5));
    addPath(startX + 3, startY + 2, 'left', rng.nextIntRange(2, 4));
    addPath(startX, startY + 2, 'down', rng.nextIntRange(2, 3));

    // Ensure stars
    while (starPositions.length < 2) {
      for (const key of visited) {
        if (starPositions.length >= 2) break;
        const [px, py] = key.split(',').map(Number);
        if (grid[py][px] && !grid[py][px]!.hasStar && rng.next() < 0.4) {
          grid[py][px]!.hasStar = true;
          starPositions.push({ x: px, y: py });
        }
      }
    }

    const functionLengths = generateFunctionLengths('painting', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'paint_green', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: startX, y: startY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'painting',
      templateName: 'paint-memory',
    };
  },
};

// ============================================
// MULTI-FUNCTION TEMPLATES
// ============================================

const subroutineCall: PuzzleTemplate = {
  name: 'subroutine-call',
  category: 'multi-func',
  description: 'F2 as reusable movement subroutine',
  minSlots: 10,
  maxSlots: 15,
  requiredInstructions: ['forward', 'right', 'f2'],
  optionalInstructions: ['left', 'f3'],
  minColors: 1,
  maxColors: 2,
  minStars: 1,
  maxStars: 2,
  pathComplexity: 'simple',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Pattern where F2 is called multiple times
    const startX = rng.nextIntRange(1, 3);
    const startY = rng.nextIntRange(2, 4);
    const segmentLength = 3;
    const segments = rng.nextIntRange(2, 3);

    const starPositions: Position[] = [];
    let x = startX;
    let y = startY;

    for (let seg = 0; seg < segments; seg++) {
      // Horizontal segment
      for (let i = 0; i < segmentLength; i++) {
        placeTile(grid, x + i, y, 'red');
      }
      x += segmentLength - 1;

      // Turn tile
      placeTile(grid, x, y + 1, 'red');
      placeTile(grid, x, y + 2, 'red');

      y += 2;
    }

    // Final star
    grid[y][x]!.hasStar = true;
    starPositions.push({ x, y });

    const functionLengths = generateFunctionLengths('multi-func', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'right', 'f1', 'f2'];
    if (functionLengths.f3 > 0) allowedInstructions.push('f3');

    return {
      grid,
      robotStart: { position: { x: startX, y: startY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'multi-func',
      templateName: 'subroutine-call',
    };
  },
};

const dualFunction: PuzzleTemplate = {
  name: 'dual-function',
  category: 'multi-func',
  description: 'F1 and F2 alternate responsibilities',
  minSlots: 12,
  maxSlots: 15,
  requiredInstructions: ['forward', 'left', 'right', 'f2'],
  optionalInstructions: ['f3'],
  minColors: 2,
  maxColors: 3,
  minStars: 2,
  maxStars: 3,
  pathComplexity: 'branching',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Alternating pattern requiring F1/F2 coordination
    const startX = rng.nextIntRange(2, 4);
    const startY = rng.nextIntRange(2, 4);
    const starPositions: Position[] = [];

    // Zigzag pattern
    let x = startX;
    let y = startY;

    for (let i = 0; i < 4; i++) {
      // Right segment
      for (let j = 0; j < 3; j++) {
        const placeStar = starPositions.length < 2 && j === 2 && i % 2 === 1;
        placeTile(grid, x + j, y, i % 2 === 0 ? 'red' : 'green', placeStar);
        if (placeStar) starPositions.push({ x: x + j, y });
      }

      if (i < 3) {
        // Down connector
        placeTile(grid, x + 2, y + 1, 'blue');
        y += 2;
        x = x === startX ? startX + 2 : startX;
      }
    }

    // Ensure stars
    while (starPositions.length < 2) {
      for (let row = 0; row < grid.length && starPositions.length < 2; row++) {
        for (let col = 0; col < grid[row].length && starPositions.length < 2; col++) {
          if (grid[row][col] && !grid[row][col]!.hasStar && rng.next() < 0.3) {
            grid[row][col]!.hasStar = true;
            starPositions.push({ x: col, y: row });
          }
        }
      }
    }

    const functionLengths = generateFunctionLengths('multi-func', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'left', 'right', 'f1', 'f2'];
    if (functionLengths.f3 > 0) allowedInstructions.push('f3');

    return {
      grid,
      robotStart: { position: { x: startX, y: startY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'multi-func',
      templateName: 'dual-function',
    };
  },
};

// ============================================
// LOOP TEMPLATES
// ============================================

const f1Spiral: PuzzleTemplate = {
  name: 'f1-spiral',
  category: 'loop',
  description: 'F1 auto-loop creates spiral movement',
  minSlots: 6,
  maxSlots: 10,
  requiredInstructions: ['forward', 'right'],
  optionalInstructions: ['left', 'f2'],
  minColors: 1,
  maxColors: 2,
  minStars: 2,
  maxStars: 4,
  pathComplexity: 'looping',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Spiral pattern exploiting F1 loop
    const centerX = Math.floor(config.gridWidth / 2);
    const centerY = Math.floor(config.gridHeight / 2);
    const starPositions: Position[] = [];

    let x = centerX;
    let y = centerY;
    let dir: Direction = 'right';
    let stepSize = 1;
    let stepsInDirection = 0;
    let turnsAtSize = 0;

    for (let i = 0; i < 25; i++) {
      const placeStar = starPositions.length < 3 && rng.next() < 0.12 && i > 3;
      if (isValidPos(grid, x, y) && !hasTile(grid, x, y)) {
        placeTile(grid, x, y, 'red', placeStar);
        if (placeStar) starPositions.push({ x, y });
      }

      const [dx, dy] = DIRECTION_DELTA[dir];
      x += dx;
      y += dy;
      stepsInDirection++;

      if (stepsInDirection >= stepSize) {
        dir = turnRight(dir);
        stepsInDirection = 0;
        turnsAtSize++;
        if (turnsAtSize >= 2) {
          stepSize++;
          turnsAtSize = 0;
        }
      }
    }

    // Ensure stars
    while (starPositions.length < 2) {
      for (let row = 0; row < grid.length && starPositions.length < 2; row++) {
        for (let col = 0; col < grid[row].length && starPositions.length < 2; col++) {
          if (grid[row][col] && !grid[row][col]!.hasStar && rng.next() < 0.3) {
            grid[row][col]!.hasStar = true;
            starPositions.push({ x: col, y: row });
          }
        }
      }
    }

    const functionLengths = generateFunctionLengths('loop', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'right', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: centerX, y: centerY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'loop',
      templateName: 'f1-spiral',
    };
  },
};

const loopWithExit: PuzzleTemplate = {
  name: 'loop-with-exit',
  category: 'loop',
  description: 'Loop until condition breaks out',
  minSlots: 8,
  maxSlots: 12,
  requiredInstructions: ['forward', 'right'],
  optionalInstructions: ['left', 'f2'],
  minColors: 2,
  maxColors: 2,
  minStars: 2,
  maxStars: 3,
  pathComplexity: 'looping',

  generate(config: GenerationConfig): PuzzleCandidate {
    const rng = new SeededRandom(config.seed);
    const grid = createEmptyGrid(config.gridWidth, config.gridHeight);

    // Loop with exit condition
    const loopX = rng.nextIntRange(3, 5);
    const loopY = rng.nextIntRange(3, 5);
    const starPositions: Position[] = [];

    // Create rectangular loop
    const loopW = rng.nextIntRange(3, 5);
    const loopH = rng.nextIntRange(2, 3);

    // Top edge
    for (let i = 0; i < loopW; i++) {
      placeTile(grid, loopX + i, loopY, i === loopW - 1 ? 'green' : 'red');
    }

    // Right edge
    for (let i = 1; i < loopH; i++) {
      placeTile(grid, loopX + loopW - 1, loopY + i, 'red');
    }

    // Bottom edge
    for (let i = loopW - 2; i >= 0; i--) {
      const placeStar = starPositions.length === 0 && i === 0;
      placeTile(grid, loopX + i, loopY + loopH - 1, 'red', placeStar);
      if (placeStar) starPositions.push({ x: loopX + i, y: loopY + loopH - 1 });
    }

    // Left edge (partial - creates entry point)
    for (let i = loopH - 2; i > 0; i--) {
      placeTile(grid, loopX, loopY + i, 'red');
    }

    // Exit path
    for (let i = 1; i <= 3; i++) {
      const placeStar = i === 3;
      placeTile(grid, loopX + loopW - 1 + i, loopY, 'red', placeStar);
      if (placeStar) starPositions.push({ x: loopX + loopW - 1 + i, y: loopY });
    }

    const functionLengths = generateFunctionLengths('loop', config.maxTotalSlots, rng);

    const allowedInstructions: InstructionType[] = ['forward', 'right', 'f1'];
    if (functionLengths.f2 > 0) allowedInstructions.push('f2');

    return {
      grid,
      robotStart: { position: { x: loopX, y: loopY }, direction: 'right' },
      functionLengths,
      allowedInstructions,
      mechanicCategory: 'loop',
      templateName: 'loop-with-exit',
    };
  },
};

// ============================================
// TEMPLATE REGISTRY
// ============================================

export const TEMPLATES: Record<MechanicCategory, PuzzleTemplate[]> = {
  conditionals: [colorBranch, colorGate],
  recursion: [corridorRecurse, bounceBack],
  painting: [paintEscape, paintMemory],
  'multi-func': [subroutineCall, dualFunction],
  loop: [f1Spiral, loopWithExit],
};

// Get all templates
export function getAllTemplates(): PuzzleTemplate[] {
  return Object.values(TEMPLATES).flat();
}

// Get templates by category
export function getTemplatesByCategory(category: MechanicCategory): PuzzleTemplate[] {
  return TEMPLATES[category] || [];
}

// Get random template for category
export function getRandomTemplate(category: MechanicCategory, seed?: number): PuzzleTemplate {
  const rng = new SeededRandom(seed);
  const templates = TEMPLATES[category];
  return rng.choice(templates);
}
