import type { PuzzleConfig } from './types';
import { createSimplePuzzle } from './puzzleParser';

/**
 * 6 Focused Tutorial Missions
 *
 * Each tutorial teaches exactly ONE programming concept.
 * Every puzzle element is necessary for the solution.
 * Constraints force the intended solution - no shortcuts possible.
 *
 * Note: F1 always auto-loops (shown with visual indicator). This is
 * explained in Tutorial 1's onboarding, not as a separate tutorial.
 *
 * | Mission | Programming Concept | Key Mechanic |
 * |---------|--------------------|--------------|
 * | 1 | Sequencing + Loops | Instructions run in order, F1 loops |
 * | 2 | Conditionals | Color conditions on instructions |
 * | 3 | Functions | F2 as reusable subroutine |
 * | 4 | Recursion | F2 calling itself |
 * | 5 | Painting | Change tile colors to affect conditionals |
 * | 6 | Advanced | Combining painting, functions, recursion |
 */

export const tutorialPuzzles: PuzzleConfig[] = [
  // ============================================
  // Tutorial 1: SEQUENCING - "First Steps"
  // ============================================
  // Teaches: Instructions run in order, need different instruction types
  //
  // Grid (L-shape):
  //   ####
  //   #R*#   <- Star at (2,1)
  //   ##R#
  //   ##*#   <- Star at (2,3)
  //   ####
  //
  // Robot at (1,1) facing right
  // Solution: [FORWARD, RIGHT, FORWARD] - F1 loops back to collect 2nd star
  // - FORWARD: (1,1)->(2,1) collect star 1
  // - RIGHT: face down
  // - FORWARD: (2,2)
  // - Loop back to slot 1: FORWARD: (2,3) collect star 2 = WIN!
  //
  // WHY SIMPLER SOLUTIONS FAIL:
  // - [forward] only: Gets star 1, loops, forward again = VOID at (3,1) = LOSE
  // - [right] only: Goes into void immediately
  // - [forward, forward]: Goes (1,1)->(2,1)->(3,1)=VOID = LOSE
  // - Must use BOTH forward AND right in correct sequence
  //
  createSimplePuzzle({
    id: 'tutorial-1',
    title: 'First Steps',
    description: 'Program the robot to collect both stars. Instructions run left to right.',
    grid: [
      '####',
      '#RR#',
      '##R#',
      '##R#',
      '####',
    ],
    robotX: 1,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 2, y: 1 }, { x: 2, y: 3 }],
    functionLengths: { f1: 3 },
    allowedInstructions: ['forward', 'right'],
    tutorialStep: 1,
    hint: 'Use FORWARD to move and RIGHT to turn. Watch how F1 loops back!',
  }),

  // ============================================
  // Tutorial 2: CONDITIONALS - "Color Logic"
  // ============================================
  // Teaches: Instructions can have color conditions - they only execute on matching tiles
  //
  // Grid (spiral path):
  //   #####
  //   #RRG#   <- Robot starts at (1,1) Red, facing right
  //   ###R#   <- Only Red at (3,2)
  //   #GRG#   <- Stars on Green tiles at (1,3) and (3,3)
  //   #####
  //
  // Robot at (1,1) facing right on Red tile
  // Path: Spiral around collecting both stars
  //
  // CORRECT SOLUTION: [forward, right(green)]
  // 1. (1,1)R right: forward->(2,1)R, right(G) skip
  // 2. (2,1)R right: forward->(3,1)G, right(G) exec -> face down
  // 3. (3,1)G down: forward->(3,2)R, right(G) skip
  // 4. (3,2)R down: forward->(3,3)G*, right(G) exec -> face left, STAR 1
  // 5. (3,3)G left: forward->(2,3)R, right(G) skip
  // 6. (2,3)R left: forward->(1,3)G*, STAR 2 - WIN!
  //
  createSimplePuzzle({
    id: 'tutorial-2',
    title: 'Color Logic',
    description: 'Tap a placed instruction to add a color condition. It only runs on that color!',
    grid: [
      '#####',
      '#RRG#',
      '###R#',
      '#GRG#',
      '#####',
    ],
    robotX: 1,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 1, y: 3 }, { x: 3, y: 3 }],
    functionLengths: { f1: 2 },
    allowedInstructions: ['forward', 'right'],
    tutorialStep: 2,
    hint: 'Turn RIGHT only on GREEN tiles. Tap the RIGHT instruction after placing it.',
  }),

  // ============================================
  // Tutorial 3: FUNCTIONS - "Helper Function"
  // ============================================
  // Teaches: F2 as reusable subroutine that returns to caller
  //
  // Grid (L-shape, minimal tiles):
  //   #########
  //   #RRRRRRR#   <- 7 red tiles (x=1 to x=7), robot starts at (1,1)
  //   #######R#   <- Red at x=7 only (robot passes through going down)
  //   #######R#   <- Star at (7,3)
  //   #########
  //
  // Robot at (1,1) facing right
  // Path: 6 right to (7,1), turn down, 2 down to (7,3) star
  //
  // SOLUTION: F1=[F2, F2, right], F2=[forward, forward, forward]
  // - F2: 3 fwd (1,1)->(4,1)
  // - F2: 3 fwd (4,1)->(7,1)
  // - right: face down
  // - F1 loops, F2: (7,1)->(7,2)->(7,3)* WIN on 2nd forward!
  //
  createSimplePuzzle({
    id: 'tutorial-3',
    title: 'Helper Function',
    description: 'F2 is a helper function. Call it from F1 to reuse code!',
    grid: [
      '#########',
      '#RRRRRRR#',
      '#######R#',
      '#######R#',
      '#########',
    ],
    robotX: 1,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 7, y: 3 }],
    functionLengths: { f1: 3, f2: 3 },
    allowedInstructions: ['forward', 'right', 'f2'],
    tutorialStep: 3,
    hint: 'Put 3 FORWARDs in F2. In F1: call F2 twice, then turn RIGHT.',
  }),

  // ============================================
  // Tutorial 4: RECURSION - "The Loop Within"
  // ============================================
  // Teaches: A function can call itself (recursion)
  //
  // Grid:
  //   #######
  //   #RRRRG#   <- Green at (5,1), robot at (1,1)
  //   #####R#   <- Red at (5,2)
  //   #####R#   <- Star at (5,3)
  //   #######
  //
  // Robot at (1,1) facing right
  // Path: 4 right to (5,1) Green, turn right (face down), 2 forward to star
  //
  // WHY RECURSION IS REQUIRED:
  // - F1 has only 1 slot, must call F2
  // - F2 has 3 slots, must handle: forward, conditional turn, repeat
  // - F2 cannot fit full path without calling itself
  //
  // WHY OTHER SOLUTIONS FAIL:
  // - F1=[forward]: Loops, goes (1)->(6)=VOID (never turns)
  // - F2=[forward, right, forward]: Returns to F1, F1 calls F2 again,
  //   but unconditional right causes spiral into void
  // - F2=[forward, forward, forward]: Never turns, hits void
  //
  // CORRECT SOLUTION: F1=[f2], F2=[forward, right(green), f2]
  // - F1: calls F2
  // - F2: (1,1)R forward->(2,1)R, right(G) skips, calls F2
  // - F2: (2,1)R forward->(3,1)R, right(G) skips, calls F2
  // - F2: (3,1)R forward->(4,1)R, right(G) skips, calls F2
  // - F2: (4,1)R forward->(5,1)G, right(G) executes (face down), calls F2
  // - F2: (5,1)G facing down forward->(5,2)R, right(G) skips, calls F2
  // - F2: (5,2)R forward->(5,3)* = WIN!
  //
  createSimplePuzzle({
    id: 'tutorial-4',
    title: 'The Loop Within',
    description: 'A function can call itself - this is recursion!',
    grid: [
      '#######',
      '#RRRRG#',
      '#####R#',
      '#####R#',
      '#######',
    ],
    robotX: 1,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 5, y: 3 }],
    functionLengths: { f1: 1, f2: 3 },
    allowedInstructions: ['forward', 'right', 'f2'],
    tutorialStep: 4,
    hint: 'F1 can only call F2. Make F2 call itself with a conditional turn on GREEN.',
  }),

  // ============================================
  // Tutorial 5: PAINTING - "Color Shift"
  // ============================================
  // Teaches: Paint instructions change tile colors, affecting future conditionals
  //
  // Grid (small loop with exit):
  //   #####
  //   #RRR#   <- Robot at (1,1), path continues to (3,1) star
  //   #RR##   <- Loop tiles at (1,2) and (2,2), star at (1,2)
  //   #####
  //
  // Robot at (1,1) facing right
  // Two stars: (3,1) outside the loop, (1,2) inside the loop
  //
  // WHY PAINTING IS REQUIRED:
  // - Robot must traverse the loop to collect first star at (1,2)
  // - Without painting, robot loops forever: (1,1)->(2,1)->(2,2)->(1,2)->(1,1)...
  // - With painting: tiles become green, right(red) stops firing
  // - Robot breaks out of loop and reaches (3,1) star
  //
  // WHY OTHER SOLUTIONS FAIL:
  // - [forward, right]: Loops forever, only gets (1,2)★
  // - [forward, forward]: Goes off right edge into void
  // - Any solution without paint: Can't break the loop to reach (3,1)★
  //
  // CORRECT SOLUTION: F1=[forward, right(red), paint_green]
  // Loop 1: (1,1)R fwd->(2,1)R, right(red)->down, paint->(2,1)G
  // Loop 2: (2,1)G fwd->(2,2)R, right(red)->left, paint->(2,2)G
  // Loop 3: (2,2)G fwd->(1,2)★R, right(red)->up, paint->(1,2)G [STAR 1]
  // Loop 4: (1,2)G fwd->(1,1)R, right(red)->right, paint->(1,1)G
  // Loop 5: (1,1)G fwd->(2,1)G, right(red) SKIP!, paint
  // Loop 6: (2,1)G fwd->(3,1)★ [STAR 2] = WIN!
  //
  createSimplePuzzle({
    id: 'tutorial-5',
    title: 'Color Shift',
    description: 'Paint tiles to change their color. This affects which conditionals fire!',
    grid: [
      '#####',
      '#RRR#',
      '#RR##',
      '#####',
    ],
    robotX: 1,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 3, y: 1 }, { x: 1, y: 2 }],
    functionLengths: { f1: 3 },
    allowedInstructions: ['forward', 'right', 'paint_green'],
    tutorialStep: 5,
    hint: 'Turn RIGHT only on RED tiles. Paint tiles GREEN to escape the loop!',
  }),

  // ============================================
  // Tutorial 6: ADVANCED - "The Grand Finale"
  // ============================================
  // Teaches: TRUE recursion where stack unwinding behavior is essential
  //
  // Grid (corridor with BOTH ends green):
  //   ########
  //   #GRRRRG#   <- (1,1)G start, red corridor, (6,1)G end
  //   #★######   <- (1,2)★ star below start
  //   ########
  //
  // Robot at (2,1)R facing right. Star at (1,2).
  //
  // WHY TRUE RECURSION IS REQUIRED:
  // - Both ends of the corridor are GREEN
  // - A simple loop [forward, right(green), right(green)] turns at BOTH
  //   green tiles, creating infinite back-and-forth
  // - Recursion distinguishes the FAR green (innermost level) from the
  //   NEAR green (exits to F1) via stack unwinding
  //
  // SOLUTION:
  // F1 = [F2, F3]
  // F2 = [forward, F2(red), right(green), right(green), forward]
  // F3 = [left, forward]
  //
  // TRACE:
  // - F2 at (2,1)R: fwd→(3,1)R, F2(red) recurse
  // - F2 at (3,1)R: fwd→(4,1)R, F2(red) recurse
  // - F2 at (4,1)R: fwd→(5,1)R, F2(red) recurse
  // - F2 at (5,1)R: fwd→(6,1)G, F2(red) SKIP (on green!)
  //   - right(green)→down, right(green)→left, forward→(5,1)R
  //   - return
  // - Back at (5,1)R: right(green) SKIP, right(green) SKIP, forward→(4,1)R
  // - Back at (4,1)R: skip, skip, forward→(3,1)R
  // - Back at (3,1)R: skip, skip, forward→(2,1)R
  // - Back at (2,1)R: skip, skip, forward→(1,1)G
  // - Return to F1 at (1,1)G facing left
  // - F1: F3 → left→down, forward→(1,2)★ WIN!
  //
  // WHY LOOPS FAIL:
  // - [forward, right(green), right(green)] turns at BOTH green tiles
  // - Robot ping-pongs between (1,1)G and (6,1)G forever
  // - Can't distinguish "far green" from "near green" without stack context
  //
  createSimplePuzzle({
    id: 'tutorial-6',
    title: 'The Grand Finale',
    description: 'Both ends are green. Only recursion can tell them apart!',
    warning: "This is a challenging puzzle! Think carefully about what happens when recursive calls return and how the call stack stores information. Don't expect to solve it first try.",
    grid: [
      '########',
      '#GRRRRG#',
      '#R######',
      '########',
    ],
    robotX: 2,
    robotY: 1,
    robotDir: 'right',
    stars: [{ x: 1, y: 2 }],
    functionLengths: { f1: 2, f2: 5, f3: 2 },
    allowedInstructions: ['forward', 'left', 'right', 'f2', 'f3'],
    tutorialStep: 6,
    hint: 'F2 must: go forward, recurse on red, then turn around at green and backtrack. When you return to the near-green, F1\'s F3 takes over!',
  }),
];

export function getTutorialPuzzle(step: number): PuzzleConfig | null {
  return tutorialPuzzles.find(p => p.tutorialStep === step) || null;
}

export function getAllTutorials(): PuzzleConfig[] {
  return tutorialPuzzles;
}

export function getTotalTutorials(): number {
  return tutorialPuzzles.length;
}
