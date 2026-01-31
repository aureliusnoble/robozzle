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
  puzzle?: PuzzleConfig;
  gameState: GameState;
  showFireworks?: boolean;
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

// Firework particle component
function FireworkParticle({
  delay,
  angle,
  distance,
  color
}: {
  delay: number;
  angle: number;
  distance: number;
  color: string;
}) {
  return (
    <motion.div
      style={{
        position: 'absolute',
        width: 6,
        height: 6,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}, 0 0 10px ${color}`,
      }}
      initial={{
        x: 0,
        y: 0,
        scale: 0,
        opacity: 1
      }}
      animate={{
        x: Math.cos(angle) * distance,
        y: Math.sin(angle) * distance,
        scale: [0, 1.5, 0.5],
        opacity: [1, 1, 0]
      }}
      transition={{
        duration: 0.8,
        delay,
        ease: [0.2, 0.8, 0.2, 1]
      }}
    />
  );
}

// Fireworks burst component
function FireworksBurst({ x, y }: { x: number; y: number }) {
  const colors = ['#FBBF24', '#F59E0B', '#EF4444', '#EC4899', '#8B5CF6', '#3B82F6', '#10B981'];
  const particles: Array<{ angle: number; distance: number; delay: number; color: string }> = [];

  // Create multiple bursts with different timings
  for (let burst = 0; burst < 3; burst++) {
    const particleCount = 8;
    const baseDelay = burst * 0.15;
    const baseDistance = 25 + burst * 15;

    for (let i = 0; i < particleCount; i++) {
      const angle = (i / particleCount) * Math.PI * 2 + (burst * 0.3);
      particles.push({
        angle,
        distance: baseDistance + Math.random() * 10,
        delay: baseDelay + Math.random() * 0.1,
        color: colors[(i + burst) % colors.length]
      });
    }
  }

  return (
    <div style={{ position: 'absolute', left: x, top: y, zIndex: 20 }}>
      {particles.map((p, i) => (
        <FireworkParticle
          key={i}
          angle={p.angle}
          distance={p.distance}
          delay={p.delay}
          color={p.color}
        />
      ))}
    </div>
  );
}

export function GameBoard({ gameState, showFireworks }: GameBoardProps) {
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

        {/* Fireworks on puzzle completion */}
        <AnimatePresence>
          {showFireworks && (
            <FireworksBurst
              x={BOARD_PADDING + (gameState.robot.position.x - minX) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2}
              y={BOARD_PADDING + (gameState.robot.position.y - minY) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
