import { forwardRef } from 'react';
import type { PuzzleConfig, Program, FunctionName, Instruction } from '../../engine/types';

// Import sprite images
import robotSprite from '../../assets/sprites/robot.png';
import starSprite from '../../assets/sprites/star.png';
import tileRed from '../../assets/sprites/tile_red.png';
import tileGreen from '../../assets/sprites/tile_green.png';
import tileBlue from '../../assets/sprites/tile_blue.png';
import tileDefault from '../../assets/sprites/tile_default.png';

interface ShareCardProps {
  puzzle: PuzzleConfig;
  program?: Program;
  stats: {
    steps: number;
    instructions: number;
  };
  showSolution: boolean;
  shareUrl: string;
  category: 'daily' | 'classic';
  dailyNumber?: number;
  date?: string;
}

const TILE_SPRITES: Record<string, string> = {
  red: tileRed,
  green: tileGreen,
  blue: tileBlue,
  null: tileDefault,
};

const DIRECTION_ROTATION: Record<string, number> = {
  up: -90,
  right: 0,
  down: 90,
  left: 180,
};

// Gradient backgrounds matching the app's instruction styling
const CONDITION_BACKGROUNDS: Record<string, string> = {
  red: 'linear-gradient(135deg, #EF4444, #F87171)',
  green: 'linear-gradient(135deg, #10B981, #4ADE80)',
  blue: 'linear-gradient(135deg, #3B82F6, #60A5FA)',
};

// Rainbow gradient for "any" condition
const ANY_CONDITION_BACKGROUND = 'linear-gradient(135deg, rgba(239, 68, 68, 0.7) 0%, rgba(251, 191, 36, 0.7) 25%, rgba(34, 197, 94, 0.7) 50%, rgba(59, 130, 246, 0.7) 75%, rgba(168, 85, 247, 0.7) 100%)';

// SVG icons matching Lucide icons used in the app
function ArrowUpIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  );
}

function CornerUpLeftIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 14 4 9 9 4" />
      <path d="M20 20v-7a4 4 0 0 0-4-4H4" />
    </svg>
  );
}

function CornerUpRightIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 14 20 9 15 4" />
      <path d="M4 20v-7a4 4 0 0 1 4-4h12" />
    </svg>
  );
}

function getInstructionContent(type: string, size: number): React.ReactNode {
  const iconSize = Math.floor(size * 0.6);

  switch (type) {
    case 'forward':
      return <ArrowUpIcon size={iconSize} />;
    case 'left':
      return <CornerUpLeftIcon size={iconSize} />;
    case 'right':
      return <CornerUpRightIcon size={iconSize} />;
    case 'paint_red':
    case 'paint_green':
    case 'paint_blue':
      return null; // Handled separately with paint dot
    case 'noop':
      return (
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 'f1':
    case 'f2':
    case 'f3':
    case 'f4':
    case 'f5':
      return <span style={{ fontSize: Math.floor(size * 0.4), fontWeight: 700 }}>{type.toUpperCase()}</span>;
    default:
      return null;
  }
}

function getDifficultyStars(difficulty: string): string {
  switch (difficulty) {
    case 'easy': return '\u2605';
    case 'medium': return '\u2605\u2605';
    case 'hard': return '\u2605\u2605\u2605';
    case 'expert': return '\u2605\u2605\u2605\u2605';
    case 'impossible': return '\u2605\u2605\u2605\u2605\u2605';
    default: return '\u2605';
  }
}

function getDifficultyLabel(difficulty: string): string {
  return difficulty.charAt(0).toUpperCase() + difficulty.slice(1);
}

export const ShareCard = forwardRef<HTMLDivElement, ShareCardProps>(
  ({ puzzle, program, stats, showSolution, shareUrl, category, dailyNumber, date }, ref) => {
    // Calculate grid bounds
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

    const gridCols = maxX - minX + 1;
    const gridRows = maxY - minY + 1;

    // Calculate tile size to fit grid nicely (max 280px width for grid area)
    const maxGridWidth = 280;
    const tileSize = Math.min(36, Math.floor(maxGridWidth / gridCols));
    const tileGap = 3;

    const gridWidth = gridCols * (tileSize + tileGap) - tileGap;
    const gridHeight = gridRows * (tileSize + tileGap) - tileGap;

    // Get non-empty functions for solution display
    const nonEmptyFunctions: { name: FunctionName; instructions: (Instruction | null)[] }[] = [];
    if (showSolution && program) {
      const funcNames: FunctionName[] = ['f1', 'f2', 'f3', 'f4', 'f5'];
      for (const fname of funcNames) {
        const funcLength = puzzle.functionLengths[fname];
        if (funcLength > 0) {
          const instructions = program[fname].slice(0, funcLength);
          const hasAnyInstruction = instructions.some(i => i !== null);
          if (hasAnyInstruction) {
            nonEmptyFunctions.push({ name: fname, instructions });
          }
        }
      }
    }

    // Format date for display
    const formattedDate = date
      ? new Date(date + 'T12:00:00').toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        })
      : '';

    return (
      <div
        ref={ref}
        style={{
          width: 400,
          background: 'linear-gradient(180deg, #0F172A 0%, #1E293B 100%)',
          borderRadius: 20,
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
          color: 'white',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <span style={{ fontSize: 24 }}>{'\uD83E\uDD16'}</span>
          <span style={{ fontSize: 18, fontWeight: 700 }}>RoboZZle</span>
        </div>

        {/* Title Section */}
        <div
          style={{
            padding: '24px 20px',
            textAlign: 'center',
          }}
        >
          {category === 'daily' ? (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                Daily Challenge #{dailyNumber}
              </div>
              <div style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)' }}>
                {formattedDate}
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 4 }}>
                "{puzzle.title}"
              </div>
              {puzzle.author && (
                <div style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)', marginBottom: 4 }}>
                  by {puzzle.author}
                </div>
              )}
              <div style={{ fontSize: 14, color: '#FBBF24' }}>
                {getDifficultyStars(puzzle.difficulty)} {getDifficultyLabel(puzzle.difficulty)}
              </div>
            </>
          )}
        </div>

        {/* Grid */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '0 20px 24px',
          }}
        >
          <div
            style={{
              position: 'relative',
              width: gridWidth + 16,
              height: gridHeight + 16,
              background: 'rgba(0, 0, 0, 0.3)',
              borderRadius: 12,
              padding: 8,
            }}
          >
            {/* Tiles */}
            {puzzle.grid.map((row, y) =>
              row.map((tile, x) => {
                if (tile === null) return null;
                const isRobotStart =
                  puzzle.robotStart.position.x === x && puzzle.robotStart.position.y === y;

                return (
                  <div
                    key={`${x}-${y}`}
                    style={{
                      position: 'absolute',
                      left: (x - minX) * (tileSize + tileGap),
                      top: (y - minY) * (tileSize + tileGap),
                      width: tileSize,
                      height: tileSize,
                      backgroundImage: `url(${TILE_SPRITES[tile.color || 'null']})`,
                      backgroundSize: 'cover',
                      borderRadius: 4,
                    }}
                  >
                    {/* Star */}
                    {tile.hasStar && (
                      <img
                        src={starSprite}
                        alt=""
                        style={{
                          position: 'absolute',
                          width: tileSize * 0.7,
                          height: tileSize * 0.7,
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                        }}
                      />
                    )}
                    {/* Robot at start position */}
                    {isRobotStart && (
                      <img
                        src={robotSprite}
                        alt=""
                        style={{
                          position: 'absolute',
                          width: tileSize * 0.85,
                          height: tileSize * 0.85,
                          left: '50%',
                          top: '50%',
                          transform: `translate(-50%, -50%) rotate(${DIRECTION_ROTATION[puzzle.robotStart.direction]}deg)`,
                        }}
                      />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Solution Section (conditional) */}
        {showSolution && nonEmptyFunctions.length > 0 && (
          <div
            style={{
              borderTop: '1px solid rgba(255, 255, 255, 0.1)',
              padding: '16px 20px',
            }}
          >
            {nonEmptyFunctions.map(({ name, instructions }) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginBottom: name !== nonEmptyFunctions[nonEmptyFunctions.length - 1].name ? 12 : 0,
                }}
              >
                {/* Function label - styled like app tabs */}
                <div
                  style={{
                    background: '#6366F1',
                    borderRadius: 8,
                    padding: '6px 12px',
                    fontSize: 14,
                    fontWeight: 700,
                    color: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    minWidth: 48,
                    justifyContent: 'center',
                  }}
                >
                  {name.toUpperCase()}
                  {name === 'f1' && <span style={{ fontSize: 12, opacity: 0.8 }}>↻</span>}
                </div>
                {/* Instructions */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {instructions.map((inst, idx) => {
                    if (!inst) return null;
                    const hasCondition = inst.condition !== null;
                    const isPaint = inst.type.startsWith('paint_');
                    const paintColor = isPaint ? inst.type.replace('paint_', '') : null;
                    const instructionSize = 44;

                    // Background style matching the app
                    const backgroundStyle = hasCondition
                      ? CONDITION_BACKGROUNDS[inst.condition!]
                      : ANY_CONDITION_BACKGROUND;

                    return (
                      <div
                        key={idx}
                        style={{
                          width: instructionSize,
                          height: instructionSize,
                          borderRadius: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'white',
                          background: backgroundStyle,
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                          border: hasCondition ? 'none' : '2px solid rgba(255, 255, 255, 0.4)',
                          position: 'relative',
                        }}
                      >
                        {isPaint ? (
                          <div
                            style={{
                              width: instructionSize * 0.45,
                              height: instructionSize * 0.45,
                              borderRadius: '50%',
                              background:
                                paintColor === 'red'
                                  ? '#EF4444'
                                  : paintColor === 'green'
                                  ? '#22C55E'
                                  : '#3B82F6',
                              border: '3px solid white',
                              boxShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                            }}
                          />
                        ) : (
                          getInstructionContent(inst.type, instructionSize)
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div
          style={{
            borderTop: '1px solid rgba(255, 255, 255, 0.1)',
            padding: '16px 20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ color: '#22C55E', fontSize: 16 }}>{'\u2713'}</span>
            <span style={{ fontSize: 14, fontWeight: 600 }}>Solved!</span>
            <span style={{ fontSize: 14, color: 'rgba(255, 255, 255, 0.6)' }}>
              {stats.steps} steps {'\u00B7'} {stats.instructions} instructions
            </span>
          </div>
        </div>

        {/* URL */}
        <div
          style={{
            padding: '0 20px 16px',
          }}
        >
          <div
            style={{
              fontSize: 12,
              color: 'rgba(255, 255, 255, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span>{'\uD83D\uDD17'}</span>
            <span>{shareUrl}</span>
          </div>
        </div>
      </div>
    );
  }
);

ShareCard.displayName = 'ShareCard';
