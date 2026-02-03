// @ts-expect-error - gifenc has no type definitions
import { GIFEncoder, quantize, applyPalette } from 'gifenc';
import { GameEngine } from '../engine/GameEngine';
import type { PuzzleConfig, Program, GameState, Direction } from '../engine/types';

// Import sprite images
import robotSprite from '../assets/sprites/robot.png';
import starSprite from '../assets/sprites/star.png';
import tileRed from '../assets/sprites/tile_red.png';
import tileGreen from '../assets/sprites/tile_green.png';
import tileBlue from '../assets/sprites/tile_blue.png';
import tileDefault from '../assets/sprites/tile_default.png';

const DIRECTION_ROTATION: Record<Direction, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

interface Sprites {
  robot: ImageBitmap;
  star: ImageBitmap;
  tiles: Record<string, ImageBitmap>;
}

interface GridBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

// GIF parameters
const FRAME_DELAY = 200; // ms between frames
const MAX_FRAMES = 100;
const CANVAS_WIDTH = 400;
const TILE_GAP = 3;

async function loadImage(src: string): Promise<ImageBitmap> {
  const response = await fetch(src);
  const blob = await response.blob();
  return createImageBitmap(blob);
}

async function loadSprites(): Promise<Sprites> {
  const [robot, star, red, green, blue, defaultTile] = await Promise.all([
    loadImage(robotSprite),
    loadImage(starSprite),
    loadImage(tileRed),
    loadImage(tileGreen),
    loadImage(tileBlue),
    loadImage(tileDefault),
  ]);

  return {
    robot,
    star,
    tiles: {
      red,
      green,
      blue,
      null: defaultTile,
    },
  };
}

function calculateGridBounds(puzzle: PuzzleConfig): GridBounds {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  puzzle.grid.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (tile !== null) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
  });
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 0; maxY = 0;
  }
  return { minX, minY, maxX, maxY };
}

function renderFrame(
  ctx: OffscreenCanvasRenderingContext2D,
  state: GameState,
  _puzzle: PuzzleConfig,
  sprites: Sprites,
  bounds: GridBounds,
  tileSize: number,
  canvasWidth: number,
  canvasHeight: number,
  gridOffsetX: number,
  gridOffsetY: number
): void {
  // Clear with background color
  ctx.fillStyle = '#0F172A';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const { minX, minY } = bounds;

  // Draw tiles
  state.grid.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (tile === null) return;

      const drawX = gridOffsetX + (x - minX) * (tileSize + TILE_GAP);
      const drawY = gridOffsetY + (y - minY) * (tileSize + TILE_GAP);

      // Draw tile background
      const tileSprite = sprites.tiles[tile.color || 'null'];
      ctx.drawImage(tileSprite, drawX, drawY, tileSize, tileSize);

      // Draw star if present
      if (tile.hasStar) {
        const starSize = tileSize * 0.7;
        const starX = drawX + (tileSize - starSize) / 2;
        const starY = drawY + (tileSize - starSize) / 2;
        ctx.drawImage(sprites.star, starX, starY, starSize, starSize);
      }
    });
  });

  // Draw robot
  const robotX = gridOffsetX + (state.robot.position.x - minX) * (tileSize + TILE_GAP);
  const robotY = gridOffsetY + (state.robot.position.y - minY) * (tileSize + TILE_GAP);
  const robotSize = tileSize * 0.85;

  ctx.save();
  ctx.translate(robotX + tileSize / 2, robotY + tileSize / 2);
  ctx.rotate((DIRECTION_ROTATION[state.robot.direction] * Math.PI) / 180);
  ctx.drawImage(sprites.robot, -robotSize / 2, -robotSize / 2, robotSize, robotSize);
  ctx.restore();
}

export interface GifProgress {
  current: number;
  total: number;
  phase: 'loading' | 'simulating' | 'encoding';
}

export async function generateAnimatedGif(
  puzzle: PuzzleConfig,
  program: Program,
  onProgress?: (progress: GifProgress) => void
): Promise<Blob> {
  // Load sprites
  onProgress?.({ current: 0, total: 100, phase: 'loading' });
  const sprites = await loadSprites();

  // Calculate grid dimensions
  const bounds = calculateGridBounds(puzzle);
  const gridCols = bounds.maxX - bounds.minX + 1;
  const gridRows = bounds.maxY - bounds.minY + 1;

  // Calculate tile size to fit nicely
  const maxGridWidth = 280;
  const tileSize = Math.min(36, Math.floor(maxGridWidth / gridCols));
  const gridWidth = gridCols * (tileSize + TILE_GAP) - TILE_GAP;
  const gridHeight = gridRows * (tileSize + TILE_GAP) - TILE_GAP;

  // Canvas dimensions
  const padding = 20;
  const canvasWidth = CANVAS_WIDTH;
  const canvasHeight = gridHeight + padding * 2;

  // Center grid in canvas
  const gridOffsetX = (canvasWidth - gridWidth) / 2;
  const gridOffsetY = padding;

  // Create offscreen canvas
  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;

  // Set up game engine
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);

  // Collect frames
  const frames: ImageData[] = [];

  // Capture initial state
  onProgress?.({ current: 10, total: 100, phase: 'simulating' });
  renderFrame(ctx, engine.getState(), puzzle, sprites, bounds, tileSize, canvasWidth, canvasHeight, gridOffsetX, gridOffsetY);
  frames.push(ctx.getImageData(0, 0, canvasWidth, canvasHeight));

  // Start execution
  engine.start();

  // Step through execution and capture frames
  let frameCount = 1;
  while (frameCount < MAX_FRAMES) {
    const result = engine.step();

    // Capture frame after each step
    renderFrame(ctx, result.state, puzzle, sprites, bounds, tileSize, canvasWidth, canvasHeight, gridOffsetX, gridOffsetY);
    frames.push(ctx.getImageData(0, 0, canvasWidth, canvasHeight));
    frameCount++;

    onProgress?.({ current: 10 + Math.floor((frameCount / MAX_FRAMES) * 40), total: 100, phase: 'simulating' });

    if (result.finished) {
      // Add a few extra frames at the end showing the final state
      for (let i = 0; i < 5; i++) {
        frames.push(ctx.getImageData(0, 0, canvasWidth, canvasHeight));
      }
      break;
    }
  }

  // Create GIF encoder
  onProgress?.({ current: 50, total: 100, phase: 'encoding' });
  const gif = GIFEncoder();

  // Encode each frame
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const { data, width, height } = frame;

    // Convert RGBA to RGB array
    const rgbData = new Uint8Array(width * height * 3);
    for (let j = 0; j < width * height; j++) {
      rgbData[j * 3] = data[j * 4];
      rgbData[j * 3 + 1] = data[j * 4 + 1];
      rgbData[j * 3 + 2] = data[j * 4 + 2];
    }

    // Quantize to 256 colors
    const palette = quantize(rgbData, 256);
    const index = applyPalette(rgbData, palette);

    // Add frame (delay is in centiseconds)
    // First frame sets repeat: 0 for infinite loop
    gif.writeFrame(index, width, height, {
      palette,
      delay: FRAME_DELAY / 10,
      ...(i === 0 ? { repeat: 0 } : {}),
    });

    onProgress?.({ current: 50 + Math.floor((i / frames.length) * 50), total: 100, phase: 'encoding' });
  }

  // Finish encoding
  gif.finish();

  // Get the GIF bytes and create blob
  const bytes = gif.bytes();
  return new Blob([bytes], { type: 'image/gif' });
}

// Generate a static PNG of the first frame for clipboard (browsers don't support GIF clipboard)
export async function generateStaticPng(
  puzzle: PuzzleConfig,
  program: Program
): Promise<Blob> {
  const sprites = await loadSprites();
  const bounds = calculateGridBounds(puzzle);
  const gridCols = bounds.maxX - bounds.minX + 1;
  const gridRows = bounds.maxY - bounds.minY + 1;

  const maxGridWidth = 280;
  const tileSize = Math.min(36, Math.floor(maxGridWidth / gridCols));
  const gridWidth = gridCols * (tileSize + TILE_GAP) - TILE_GAP;
  const gridHeight = gridRows * (tileSize + TILE_GAP) - TILE_GAP;

  const padding = 20;
  const canvasWidth = CANVAS_WIDTH;
  const canvasHeight = gridHeight + padding * 2;

  const gridOffsetX = (canvasWidth - gridWidth) / 2;
  const gridOffsetY = padding;

  const canvas = new OffscreenCanvas(canvasWidth, canvasHeight);
  const ctx = canvas.getContext('2d')!;

  // Set up game engine and run to get final state
  const engine = new GameEngine(puzzle);
  engine.setProgram(program);
  const result = engine.runToCompletion();

  // Render the final solved state
  renderFrame(ctx, result.state, puzzle, sprites, bounds, tileSize, canvasWidth, canvasHeight, gridOffsetX, gridOffsetY);

  return canvas.convertToBlob({ type: 'image/png' });
}

// Convert blob to data URL
export async function gifBlobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
