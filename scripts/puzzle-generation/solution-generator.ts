// Solution-first generator: creates programs with all required mechanics
// then builds puzzles around them

import type {
  Direction,
  FunctionName,
  Instruction,
  InstructionType,
  Position,
  Program,
  TileColor,
} from '../../src/engine/types';
import { BASELINE_REQUIREMENTS } from './config';

// Seeded random number generator
export class SeededRandom {
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

  weightedChoice<T>(items: T[], weights: number[]): T {
    const totalWeight = weights.reduce((a, b) => a + b, 0);
    let random = this.next() * totalWeight;
    for (let i = 0; i < items.length; i++) {
      random -= weights[i];
      if (random <= 0) return items[i];
    }
    return items[items.length - 1];
  }
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

// Path segment with color requirement
export interface PathSegment {
  x: number;
  y: number;
  requiredColor: TileColor | null; // Color required by conditional
  initialColor?: TileColor; // Initial color (may differ from required if painting needed)
  paintTo?: TileColor; // Color to paint this tile to
  hasStar: boolean;
}

// Generated solution with path trace
export interface SolutionTemplate {
  program: Program;
  path: PathSegment[];
  functionCount: number;
  colors: TileColor[]; // Colors used in conditionals
  startDirection: Direction;
  usesPainting: boolean;
}

import { type PuzzleProfile, BASELINE_REQUIREMENTS } from './config';

// Pick number of functions based on profile requirements
function pickFunctionCount(rng: SeededRandom, profile?: PuzzleProfile): number {
  const minFuncs = profile?.requirements.minFunctions ?? 2;
  const maxFuncs = profile?.requirements.maxFunctions ?? 4;

  // Weight toward lower end unless profile requires more
  if (minFuncs >= 4) {
    return rng.weightedChoice([4, 5], [0.6, 0.4]);
  } else if (minFuncs >= 3) {
    return rng.weightedChoice([3, 4], [0.6, 0.4]);
  } else {
    return rng.weightedChoice([2, 3, 4], [0.4, 0.4, 0.2]);
  }
}

// Pick colors to use (always at least 2 for conditionals)
function pickColors(rng: SeededRandom): TileColor[] {
  const allColors: TileColor[] = ['red', 'green', 'blue'];
  const numColors = rng.nextIntRange(2, 3);
  return rng.shuffle(allColors).slice(0, numColors);
}

// Create an instruction
function inst(type: InstructionType, condition: TileColor | null = null): Instruction {
  return { type, condition };
}

// Generate a solution that meets profile requirements
export function generateSolution(seed?: number, profile?: PuzzleProfile): SolutionTemplate {
  const rng = new SeededRandom(seed);
  const functionCount = pickFunctionCount(rng, profile);
  const colors = pickColors(rng);
  const requiresPainting = profile?.requirements.requiresPainting ?? false;

  // Choose a pattern type (include painting pattern if required)
  let patternType: number;
  if (requiresPainting) {
    // For painting profiles, always use painting pattern
    patternType = 5;
  } else {
    patternType = rng.nextInt(5);
  }

  let program: Program;
  let colorAssignments: Map<number, TileColor>;
  let paintingInfo: Map<number, { from: TileColor; to: TileColor }> | undefined;

  switch (patternType) {
    case 0:
      ({ program, colorAssignments } = generateZigZagPattern(functionCount, colors, rng));
      break;
    case 1:
      ({ program, colorAssignments } = generateSpiralPattern(functionCount, colors, rng));
      break;
    case 2:
      ({ program, colorAssignments } = generateBranchingPattern(functionCount, colors, rng));
      break;
    case 3:
      ({ program, colorAssignments } = generateLoopPattern(functionCount, colors, rng));
      break;
    case 5:
      ({ program, colorAssignments, paintingInfo } = generatePaintingPattern(functionCount, colors, rng));
      break;
    default:
      ({ program, colorAssignments } = generateCrossCallPattern(functionCount, colors, rng));
      break;
  }

  // Trace the program to get the path
  const startDirection = rng.choice<Direction>(['up', 'down', 'left', 'right']);
  const { path, verified } = tracePath(program, startDirection, colorAssignments, paintingInfo);

  // If tracing failed, try a simpler fallback pattern
  if (!verified || path.length < 5) {
    return generateFallbackSolution(functionCount, colors, rng, requiresPainting);
  }

  return {
    program,
    path,
    functionCount,
    colors,
    startDirection,
    usesPainting: requiresPainting || !!paintingInfo,
  };
}

// Fallback: simple but guaranteed working pattern
function generateFallbackSolution(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom,
  requiresPainting: boolean = false
): SolutionTemplate {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];

  // For painting fallback, use a simple paint-then-check pattern
  if (requiresPainting) {
    return generatePaintingFallback(functionCount, colors, rng);
  }

  // Simple pattern: F1 moves and calls F2 on color, F2 turns and moves
  // This guarantees stack depth 3+ with cross-calls
  const program: Program = {
    f1: [
      inst('forward'),
      inst('forward'),
      inst('f2', color1), // Conditional call to F2
      inst('forward'),
      inst('f1'), // Loop back
    ],
    f2: [
      inst('right'),
      inst('forward'),
      inst('f1', color2), // Cross-call back to F1 on different color
    ],
    f3: functionCount >= 3 ? [
      inst('left'),
      inst('forward'),
      inst('f2'),
    ] : [],
    f4: functionCount >= 4 ? [
      inst('forward'),
      inst('f3'),
    ] : [],
    f5: [],
  };

  // Add more cross-calls for higher function counts
  if (functionCount >= 3) {
    program.f1[2] = inst('f3', color1);
    program.f3[2] = inst('f2');
  }

  if (functionCount >= 4) {
    program.f2[2] = inst('f4', color2);
    program.f4[1] = inst('f1');
  }

  const colorAssignments = new Map<number, TileColor>();
  colorAssignments.set(2, color1); // Position 2 needs color1
  colorAssignments.set(5, color2); // Position 5 needs color2 (approximate)

  const startDirection = rng.choice<Direction>(['up', 'down', 'left', 'right']);
  const { path } = tracePath(program, startDirection, colorAssignments);

  return {
    program,
    path: path.length > 0 ? path : generateMinimalPath(startDirection),
    functionCount,
    colors,
    startDirection,
    usesPainting: false,
  };
}

// Generate minimal valid path
function generateMinimalPath(startDirection: Direction): PathSegment[] {
  const path: PathSegment[] = [];
  let x = 8, y = 6;
  let dir = startDirection;

  for (let i = 0; i < 10; i++) {
    path.push({ x, y, requiredColor: i % 3 === 0 ? 'red' : null, hasStar: i === 9 });
    const delta = DIRECTION_DELTAS[dir];
    x += delta.x;
    y += delta.y;
    // Turn sometimes
    if (i % 3 === 2) dir = TURN_RIGHT[dir];
  }

  return path;
}

// Pattern generators
function generateZigZagPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor> } {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];
  const colorAssignments = new Map<number, TileColor>();

  // Zig-zag: F1 moves forward then calls F2 to turn, F2 calls back
  // This creates a zig-zag path with good stack depth

  const moveCount = rng.nextIntRange(1, 3);
  const f1Instructions: (Instruction | null)[] = [];

  // Add forward moves
  for (let i = 0; i < moveCount; i++) {
    f1Instructions.push(inst('forward'));
  }

  // Conditional call to F2
  f1Instructions.push(inst('f2', color1));
  colorAssignments.set(f1Instructions.length, color1);

  // More moves after F2 returns
  f1Instructions.push(inst('forward'));

  // Loop back (unconditional or conditional)
  if (rng.next() > 0.5) {
    f1Instructions.push(inst('f1', color2));
    colorAssignments.set(f1Instructions.length + 3, color2);
  } else {
    f1Instructions.push(inst('f1'));
  }

  // F2: turn and potentially call F3 or back to F1
  const f2Instructions: (Instruction | null)[] = [
    rng.next() > 0.5 ? inst('left') : inst('right'),
    inst('forward'),
  ];

  if (functionCount >= 3) {
    f2Instructions.push(inst('f3', color2));
    colorAssignments.set(10, color2);
  } else {
    f2Instructions.push(inst('f1'));
  }

  // F3: additional moves and cross-call
  const f3Instructions: (Instruction | null)[] = functionCount >= 3 ? [
    inst('forward'),
    rng.next() > 0.5 ? inst('left') : inst('right'),
    inst('f1', color1),
  ] : [];

  // F4: if used, add more complexity
  const f4Instructions: (Instruction | null)[] = functionCount >= 4 ? [
    inst('forward'),
    inst('f2'),
  ] : [];

  // Potentially modify to use F4
  if (functionCount >= 4 && rng.next() > 0.5) {
    f2Instructions[2] = inst('f4');
    f4Instructions.push(inst('f3'));
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
  };
}

function generateSpiralPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor> } {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];
  const colorAssignments = new Map<number, TileColor>();

  // Spiral: F1 loops with turns, F2 handles corner behavior
  // Creates inward spiral pattern

  const f1Instructions: (Instruction | null)[] = [
    inst('forward'),
    inst('forward'),
    inst('f2', color1), // Check for turn at colored tile
    inst('f1'), // Continue spiral
  ];
  colorAssignments.set(3, color1);

  const f2Instructions: (Instruction | null)[] = [
    inst('right'), // Turn right for spiral
    inst('forward'),
  ];

  if (functionCount >= 3) {
    f2Instructions.push(inst('f3', color2));
    colorAssignments.set(8, color2);
  }

  const f3Instructions: (Instruction | null)[] = functionCount >= 3 ? [
    inst('forward'),
    inst('left'),
    inst('f2'),
  ] : [];

  const f4Instructions: (Instruction | null)[] = functionCount >= 4 ? [
    inst('right'),
    inst('f3'),
    inst('forward'),
  ] : [];

  if (functionCount >= 4) {
    f3Instructions[2] = inst('f4', color1);
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
  };
}

function generateBranchingPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor> } {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];
  const colorAssignments = new Map<number, TileColor>();

  // Branching: different colors trigger different function calls
  // Creates path that branches based on tile colors

  const f1Instructions: (Instruction | null)[] = [
    inst('forward'),
    inst('f2', color1), // Branch to F2 on color1
    inst('f3', color2), // Branch to F3 on color2 (if func count >= 3)
    inst('forward'),
    inst('f1'),
  ];
  colorAssignments.set(2, color1);
  colorAssignments.set(4, color2);

  const f2Instructions: (Instruction | null)[] = [
    inst('left'),
    inst('forward'),
    inst('forward'),
    inst('f1'),
  ];

  let f3Instructions: (Instruction | null)[] = [];
  if (functionCount >= 3) {
    f3Instructions = [
      inst('right'),
      inst('forward'),
      inst('f2', color1),
    ];
    colorAssignments.set(12, color1);
  } else {
    // With only 2 functions, replace F3 call with F2
    f1Instructions[2] = inst('forward');
  }

  let f4Instructions: (Instruction | null)[] = [];
  if (functionCount >= 4) {
    f4Instructions = [
      inst('forward'),
      inst('left'),
      inst('f3'),
    ];
    f3Instructions[2] = inst('f4', color2);
    colorAssignments.set(15, color2);
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
  };
}

function generateLoopPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor> } {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];
  const colorAssignments = new Map<number, TileColor>();

  // Loop: exploits F1 auto-loop with conditional exits
  // F1 runs repeatedly, calls F2 to handle special cases

  const moveCount = rng.nextIntRange(2, 4);
  const f1Instructions: (Instruction | null)[] = [];

  for (let i = 0; i < moveCount; i++) {
    f1Instructions.push(inst('forward'));
  }

  // Conditional turn/call at specific color
  f1Instructions.push(inst('f2', color1));
  colorAssignments.set(f1Instructions.length, color1);

  // F1 auto-loops (empty slot or explicit f1 call)
  if (rng.next() > 0.3) {
    f1Instructions.push(inst('forward'));
  }

  const f2Instructions: (Instruction | null)[] = [
    rng.next() > 0.5 ? inst('left') : inst('right'),
  ];

  // F2 may call F3 or continue
  if (functionCount >= 3) {
    f2Instructions.push(inst('f3', color2));
    colorAssignments.set(10, color2);
  } else {
    f2Instructions.push(inst('forward'));
  }

  let f3Instructions: (Instruction | null)[] = [];
  if (functionCount >= 3) {
    f3Instructions = [
      inst('forward'),
      inst('right'),
      inst('f1', color1),
    ];
    colorAssignments.set(14, color1);
  }

  let f4Instructions: (Instruction | null)[] = [];
  if (functionCount >= 4) {
    f4Instructions = [
      inst('left'),
      inst('f2'),
    ];
    f3Instructions.push(inst('f4', color2));
    colorAssignments.set(18, color2);
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
  };
}

function generateCrossCallPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor> } {
  const color1 = colors[0];
  const color2 = colors[1] || colors[0];
  const colorAssignments = new Map<number, TileColor>();

  // Cross-call: functions call each other in complex patterns
  // Guarantees high stack depth

  const f1Instructions: (Instruction | null)[] = [
    inst('forward'),
    inst('f2'),
    inst('forward'),
    inst('f1', color1), // Conditional loop
  ];
  colorAssignments.set(4, color1);

  const f2Instructions: (Instruction | null)[] = [
    inst('right'),
    inst('forward'),
  ];

  if (functionCount >= 3) {
    f2Instructions.push(inst('f3', color2));
    colorAssignments.set(8, color2);
  } else {
    f2Instructions.push(inst('left'));
  }

  let f3Instructions: (Instruction | null)[] = [];
  if (functionCount >= 3) {
    f3Instructions = [
      inst('forward'),
      inst('f2', color1),
    ];
    colorAssignments.set(12, color1);
  }

  let f4Instructions: (Instruction | null)[] = [];
  if (functionCount >= 4) {
    f4Instructions = [
      inst('forward'),
      inst('f1', color2),
    ];
    colorAssignments.set(16, color2);

    // Have F3 also call F4
    f3Instructions.push(inst('f4'));
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
  };
}

// Painting pattern: tiles start as one color but need to be painted to trigger conditionals
function generatePaintingPattern(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): { program: Program; colorAssignments: Map<number, TileColor>; paintingInfo: Map<number, { from: TileColor; to: TileColor }> } {
  const color1 = colors[0]; // The color to paint TO
  const color2 = colors[1] || 'blue'; // Starting color / secondary
  const paintColor = color1 === 'red' ? 'paint_red' : color1 === 'green' ? 'paint_green' : 'paint_blue';

  const colorAssignments = new Map<number, TileColor>();
  const paintingInfo = new Map<number, { from: TileColor; to: TileColor }>();

  // Pattern: F1 paints tile, then conditional triggers based on new color
  // This creates puzzles where you must paint to proceed

  const f1Instructions: (Instruction | null)[] = [
    inst('forward'),
    inst(paintColor as InstructionType), // Paint current tile
    inst('f2', color1), // Now the tile is color1, so this triggers
    inst('forward'),
    inst('f1'), // Loop
  ];
  colorAssignments.set(3, color1);
  paintingInfo.set(2, { from: color2, to: color1 }); // Position 2 starts as color2, painted to color1

  const f2Instructions: (Instruction | null)[] = [
    rng.next() > 0.5 ? inst('left') : inst('right'),
    inst('forward'),
  ];

  if (functionCount >= 3) {
    f2Instructions.push(inst('f3', color2));
    colorAssignments.set(8, color2);
  } else {
    f2Instructions.push(inst('f1'));
  }

  let f3Instructions: (Instruction | null)[] = [];
  if (functionCount >= 3) {
    f3Instructions = [
      inst('forward'),
      inst(paintColor as InstructionType), // Another paint
      inst('f2', color1),
    ];
    colorAssignments.set(12, color1);
    paintingInfo.set(10, { from: color2, to: color1 });
  }

  let f4Instructions: (Instruction | null)[] = [];
  if (functionCount >= 4) {
    f4Instructions = [
      inst('forward'),
      inst('f3'),
    ];
    f3Instructions[2] = inst('f4', color2);
    colorAssignments.set(14, color2);
  }

  return {
    program: {
      f1: f1Instructions,
      f2: f2Instructions,
      f3: f3Instructions,
      f4: f4Instructions,
      f5: [],
    },
    colorAssignments,
    paintingInfo,
  };
}

// Simple painting fallback
function generatePaintingFallback(
  functionCount: number,
  colors: TileColor[],
  rng: SeededRandom
): SolutionTemplate {
  const color1 = colors[0];
  const color2 = colors[1] || 'blue';
  const paintColor = color1 === 'red' ? 'paint_red' : color1 === 'green' ? 'paint_green' : 'paint_blue';

  const program: Program = {
    f1: [
      inst('forward'),
      inst(paintColor as InstructionType),
      inst('f2', color1),
      inst('forward'),
      inst('f1'),
    ],
    f2: [
      inst('right'),
      inst('forward'),
      inst('f1', color2),
    ],
    f3: [],
    f4: [],
    f5: [],
  };

  const colorAssignments = new Map<number, TileColor>();
  colorAssignments.set(3, color1);
  colorAssignments.set(7, color2);

  const paintingInfo = new Map<number, { from: TileColor; to: TileColor }>();
  paintingInfo.set(2, { from: color2, to: color1 });

  const startDirection = rng.choice<Direction>(['up', 'down', 'left', 'right']);
  const { path } = tracePath(program, startDirection, colorAssignments, paintingInfo);

  // Mark painting info on path
  for (const [idx, info] of paintingInfo) {
    if (idx < path.length) {
      path[idx].initialColor = info.from;
      path[idx].paintTo = info.to;
    }
  }

  return {
    program,
    path: path.length > 0 ? path : generateMinimalPath(startDirection),
    functionCount,
    colors,
    startDirection,
    usesPainting: true,
  };
}

// Trace the path that a program would take
// Returns the path and whether it seems valid
function tracePath(
  program: Program,
  startDirection: Direction,
  colorAssignments: Map<number, TileColor>,
  paintingInfo?: Map<number, { from: TileColor; to: TileColor }>
): { path: PathSegment[]; verified: boolean } {
  const path: PathSegment[] = [];
  const visited = new Set<string>();

  // Virtual grid - we track positions relative to start
  let x = 8, y = 6; // Start in middle of virtual grid
  let dir = startDirection;

  // Add starting position
  path.push({ x, y, requiredColor: null, hasStar: false });
  visited.add(`${x},${y}`);

  // Simulate execution with virtual colors
  type QueueEntry = [FunctionName, number];
  const queue: QueueEntry[] = [['f1', 0]];
  let steps = 0;
  const maxSteps = 100;
  let stepIndex = 0;

  // Track conditional execution points
  let conditionalCount = 0;
  let maxStackDepth = 0;

  while (queue.length > 0 && steps < maxSteps && path.length < 50) {
    maxStackDepth = Math.max(maxStackDepth, queue.length);

    const [funcName, idx] = queue.shift()!;
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

    steps++;
    stepIndex++;

    // Track conditionals
    if (instruction.condition !== null) {
      conditionalCount++;
      // Record color requirement at current position
      const lastIdx = path.length - 1;
      if (lastIdx >= 0) {
        path[lastIdx].requiredColor = instruction.condition;
      }
    }

    switch (instruction.type) {
      case 'forward': {
        const delta = DIRECTION_DELTAS[dir];
        const newX = x + delta.x;
        const newY = y + delta.y;

        // Check bounds (virtual 16x12 grid)
        if (newX < 0 || newX >= 16 || newY < 0 || newY >= 12) {
          return { path, verified: path.length >= 5 && conditionalCount >= 2 };
        }

        x = newX;
        y = newY;

        const key = `${x},${y}`;
        if (!visited.has(key)) {
          visited.add(key);
          path.push({ x, y, requiredColor: null, hasStar: false });
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

      case 'noop':
      case 'paint_red':
      case 'paint_green':
      case 'paint_blue':
        break;
    }

    // Stop if we've visited enough unique positions
    if (path.length >= 20) break;
  }

  // Mark last position as having a star
  if (path.length > 0) {
    path[path.length - 1].hasStar = true;
  }

  // Also add stars at other strategic positions
  if (path.length >= 5) {
    const midPoint = Math.floor(path.length / 2);
    path[midPoint].hasStar = true;
  }
  if (path.length >= 10) {
    const quarterPoint = Math.floor(path.length / 4);
    path[quarterPoint].hasStar = true;
  }

  // Verify the solution meets requirements
  const verified =
    path.length >= 5 &&
    conditionalCount >= BASELINE_REQUIREMENTS.minConditionals &&
    maxStackDepth >= BASELINE_REQUIREMENTS.minStackDepth;

  return { path, verified };
}

// Get the function lengths needed for a program
export function getFunctionLengths(program: Program): {
  f1: number; f2: number; f3: number; f4: number; f5: number;
} {
  return {
    f1: program.f1.length,
    f2: program.f2.length,
    f3: program.f3.length,
    f4: program.f4.length,
    f5: program.f5.length,
  };
}

// Get allowed instructions from a program
export function getRequiredInstructions(program: Program): InstructionType[] {
  const types = new Set<InstructionType>();

  // Always include basic movement
  types.add('forward');
  types.add('left');
  types.add('right');

  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst) {
        types.add(inst.type);
      }
    }
  }

  return Array.from(types);
}

// Count non-null instructions in program
export function countInstructions(program: Program): number {
  let count = 0;
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst !== null) count++;
    }
  }
  return count;
}

// Get functions actually used in the program
export function getUsedFunctions(program: Program): FunctionName[] {
  const used = new Set<FunctionName>();

  // F1 is always used (entry point)
  used.add('f1');

  // Find all function calls
  for (const funcName of ['f1', 'f2', 'f3', 'f4', 'f5'] as FunctionName[]) {
    for (const inst of program[funcName]) {
      if (inst && ['f1', 'f2', 'f3', 'f4', 'f5'].includes(inst.type)) {
        used.add(inst.type as FunctionName);
      }
    }
  }

  return Array.from(used);
}
