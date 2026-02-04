import type { Direction, Position, Tile } from '../../engine/types';
import styles from './SimulationBoard.module.css';

// Import sprite images
import defaultRobotSprite from '../../assets/sprites/robot.png';
import starSprite from '../../assets/sprites/star.png';
import tileRed from '../../assets/sprites/tile_red.png';
import tileGreen from '../../assets/sprites/tile_green.png';
import tileBlue from '../../assets/sprites/tile_blue.png';
import tileDefault from '../../assets/sprites/tile_default.png';

interface SimulationBoardProps {
  grid: (Tile | null)[][];
  robotPosition: Position;
  robotDirection: Direction;
  robotPath: Position[];
  turnPositions: Position[];
  skinImage?: string;
}

const TILE_SIZE = 24;
const TILE_GAP = 1;
const BOARD_PADDING = 12;

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

export function SimulationBoard({
  grid,
  robotPosition,
  robotDirection,
  robotPath,
  turnPositions,
  skinImage,
}: SimulationBoardProps) {
  const robotSprite = skinImage || defaultRobotSprite;
  // Calculate bounding box of non-null tiles
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;

  grid.forEach((row, y) => {
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
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }

  // Calculate cropped board dimensions
  const tilesWidth = (maxX - minX + 1) * (TILE_SIZE + TILE_GAP) - TILE_GAP;
  const tilesHeight = (maxY - minY + 1) * (TILE_SIZE + TILE_GAP) - TILE_GAP;

  const boardWidth = tilesWidth + BOARD_PADDING * 2;
  const boardHeight = tilesHeight + BOARD_PADDING * 2;

  // Convert grid position to pixel position
  const gridToPixel = (pos: Position) => ({
    x: BOARD_PADDING + (pos.x - minX) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
    y: BOARD_PADDING + (pos.y - minY) * (TILE_SIZE + TILE_GAP) + TILE_SIZE / 2,
  });

  // Create SVG path for robot movement
  const pathPoints = robotPath.map(gridToPixel);
  const pathD =
    pathPoints.length > 0
      ? `M ${pathPoints[0].x} ${pathPoints[0].y} ` +
        pathPoints
          .slice(1)
          .map(p => `L ${p.x} ${p.y}`)
          .join(' ')
      : '';

  // Deduplicate turn positions for rendering stars
  const uniqueTurns = new Map<string, Position>();
  turnPositions.forEach(pos => {
    const key = `${pos.x}-${pos.y}`;
    uniqueTurns.set(key, pos);
  });

  return (
    <div className={styles.container}>
      <div
        className={styles.board}
        style={{
          width: boardWidth,
          height: boardHeight,
        }}
      >
        {/* Path overlay */}
        <svg
          className={styles.pathOverlay}
          width={boardWidth}
          height={boardHeight}
        >
          {pathD && (
            <path
              d={pathD}
              fill="none"
              stroke="rgba(59, 130, 246, 0.5)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>

        {/* Render tiles */}
        {grid.map((row, y) =>
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
              />
            );
          })
        )}

        {/* Turn position markers */}
        {Array.from(uniqueTurns.values()).map((pos, idx) => {
          const pixel = gridToPixel(pos);
          return (
            <img
              key={`turn-${idx}`}
              src={starSprite}
              alt="turn"
              className={styles.turnMarker}
              style={{
                left: pixel.x - 8,
                top: pixel.y - 8,
              }}
            />
          );
        })}

        {/* Final position marker */}
        {robotPath.length > 0 && (
          <img
            src={starSprite}
            alt="final"
            className={styles.finalMarker}
            style={{
              left: gridToPixel(robotPosition).x - 10,
              top: gridToPixel(robotPosition).y - 10,
            }}
          />
        )}

        {/* Robot */}
        <div
          className={styles.robot}
          style={{
            left:
              BOARD_PADDING +
              (robotPosition.x - minX) * (TILE_SIZE + TILE_GAP) +
              (TILE_SIZE - 20) / 2,
            top:
              BOARD_PADDING +
              (robotPosition.y - minY) * (TILE_SIZE + TILE_GAP) +
              (TILE_SIZE - 20) / 2,
            transform: `rotate(${DIRECTION_ROTATION[robotDirection]}deg)`,
          }}
        >
          <img src={robotSprite} alt="robot" className={styles.robotSprite} />
        </div>
      </div>
    </div>
  );
}
