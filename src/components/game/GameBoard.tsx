import { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { GameState, PuzzleConfig, Direction } from '../../engine/types';
import styles from './GameBoard.module.css';

// Import sprite images
import robotSprite from '../../assets/sprites/robot.png';
import starSprite from '../../assets/sprites/star.png';
import tileRed from '../../assets/sprites/tile_red.png';
import tileGreen from '../../assets/sprites/tile_green.png';
import tileBlue from '../../assets/sprites/tile_blue.png';
import tileDefault from '../../assets/sprites/tile_default.png';

interface GameBoardProps {
  puzzle: PuzzleConfig;
  gameState: GameState;
}

const TILE_SIZE = 32;
const TILE_GAP = 2;
const BOARD_PADDING = 20;

// Robot sprite faces right, so subtract 90° to align with direction
const DIRECTION_ROTATION: Record<Direction, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

const TILE_SPRITES: Record<string, string> = {
  red: tileRed,
  green: tileGreen,
  blue: tileBlue,
  null: tileDefault,
};

export function GameBoard({ puzzle: _puzzle, gameState }: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate bounding box of non-null tiles
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  gameState.grid.forEach((row, y) => {
    row.forEach((tile, x) => {
      if (tile !== null) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    });
  });

  // Handle empty grid edge case
  if (minX === Infinity) {
    minX = 0; minY = 0; maxX = 0; maxY = 0;
  }

  // Calculate cropped board dimensions (tiles only)
  const tilesWidth = (maxX - minX + 1) * (TILE_SIZE + TILE_GAP) - TILE_GAP;
  const tilesHeight = (maxY - minY + 1) * (TILE_SIZE + TILE_GAP) - TILE_GAP;

  // Board dimensions include padding on all sides
  const boardWidth = tilesWidth + BOARD_PADDING * 2;
  const boardHeight = tilesHeight + BOARD_PADDING * 2;

  return (
    <div id="game-board" className={styles.container} ref={containerRef}>
      <div
        className={styles.board}
        style={{
          width: boardWidth,
          height: boardHeight,
        }}
      >
        {/* Render tiles */}
        {gameState.grid.map((row, y) =>
          row.map((tile, x) => {
            if (tile === null) return null;

            return (
              <div
                key={`${x}-${y}`}
                className={styles.tile}
                style={{
                  left: BOARD_PADDING + (x - minX) * (TILE_SIZE + TILE_GAP),
                  top: BOARD_PADDING + (y - minY) * (TILE_SIZE + TILE_GAP),
                  width: TILE_SIZE,
                  height: TILE_SIZE,
                  backgroundImage: `url(${TILE_SPRITES[tile.color || 'null']})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Star */}
                <AnimatePresence mode="wait">
                  {tile.hasStar && (
                    <motion.img
                      key={`star-${x}-${y}`}
                      src={starSprite}
                      alt="star"
                      className={styles.star}
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{
                        scale: 1,
                        opacity: 1,
                      }}
                      exit={{
                        scale: 0,
                        opacity: 0,
                      }}
                      transition={{
                        duration: 0.2,
                      }}
                    />
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}

        {/* Robot - use x/y for position so transforms combine with rotate */}
        <motion.div
          className={styles.robot}
          animate={{
            x: BOARD_PADDING + (gameState.robot.position.x - minX) * (TILE_SIZE + TILE_GAP) + (TILE_SIZE - 28) / 2,
            y: BOARD_PADDING + (gameState.robot.position.y - minY) * (TILE_SIZE + TILE_GAP) + (TILE_SIZE - 28) / 2,
            rotate: DIRECTION_ROTATION[gameState.robot.direction],
          }}
          transition={{
            type: 'spring',
            stiffness: 500,
            damping: 30,
          }}
        >
          <img
            src={robotSprite}
            alt="robot"
            className={styles.robotSprite}
          />
        </motion.div>
      </div>
    </div>
  );
}
