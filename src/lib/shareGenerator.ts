import type { GameState, PuzzleConfig } from '../engine/types';

// Generate Wordle-style share text
export function generateShareText(
  puzzle: PuzzleConfig,
  state: GameState,
  instructionsUsed: number,
  date: string,
  rank?: number
): string {
  const lines: string[] = [];

  // Header with rank medal
  const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : '';
  const dayNumber = getDayNumber(date);
  lines.push(`RoboZZle Daily #${dayNumber} - ${date} ${medal}`);

  // Generate mini grid visualization
  const gridEmoji = generateGridEmoji(puzzle, state);
  lines.push(gridEmoji);

  // Stats
  lines.push(`${instructionsUsed} instructions | ${state.steps} steps`);

  // URL
  const baseUrl = window.location.origin;
  lines.push(baseUrl);

  return lines.join('\n');
}

// Get day number since launch
function getDayNumber(date: string): number {
  const launch = new Date('2025-01-01');
  const current = new Date(date);
  const diffTime = Math.abs(current.getTime() - launch.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

// Generate emoji grid representation
function generateGridEmoji(puzzle: PuzzleConfig, state: GameState): string {
  const GRID_WIDTH = 6;
  const GRID_HEIGHT = 4;

  // Find bounding box of non-void tiles
  let minX = Infinity, minY = Infinity;
  let maxX = -Infinity, maxY = -Infinity;

  for (let y = 0; y < puzzle.grid.length; y++) {
    for (let x = 0; x < puzzle.grid[y].length; x++) {
      if (puzzle.grid[y][x] !== null) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  // Scale to fit in GRID_WIDTH x GRID_HEIGHT
  const puzzleWidth = maxX - minX + 1;
  const puzzleHeight = maxY - minY + 1;
  const scaleX = Math.ceil(puzzleWidth / GRID_WIDTH);
  const scaleY = Math.ceil(puzzleHeight / GRID_HEIGHT);

  const lines: string[] = [];

  for (let gy = 0; gy < GRID_HEIGHT; gy++) {
    let line = '';
    for (let gx = 0; gx < GRID_WIDTH; gx++) {
      const px = minX + gx * scaleX;
      const py = minY + gy * scaleY;

      // Check what's at this position (sample center of scaled region)
      const tile = puzzle.grid[py]?.[px];
      const currentTile = state.grid[py]?.[px];
      const isRobotHere = state.robot.position.x === px && state.robot.position.y === py;
      const hadStar = tile?.hasStar;
      const hasStar = currentTile?.hasStar;
      const collectedStar = hadStar && !hasStar;

      if (isRobotHere) {
        line += '🤖';
      } else if (collectedStar) {
        line += '⭐';
      } else if (hasStar) {
        line += '✨';
      } else if (tile === null) {
        line += '⬛';
      } else {
        // Show tile color
        switch (tile.color) {
          case 'red': line += '🔴'; break;
          case 'green': line += '🟢'; break;
          case 'blue': line += '🔵'; break;
          default: line += '⬜'; break;
        }
      }
    }
    lines.push(line);
  }

  return lines.join('\n');
}

// Copy share text to clipboard
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}

// Share via Web Share API if available
export async function shareResult(text: string): Promise<boolean> {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return true;
    } catch {
      // User cancelled or error
      return false;
    }
  }
  // Fall back to clipboard
  return copyToClipboard(text);
}
