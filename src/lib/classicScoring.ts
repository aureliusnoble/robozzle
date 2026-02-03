/**
 * Classic Ranking Scoring System
 *
 * Formula: S² × 10 × log₂(N+1) for base points, with penalty factor based on easier puzzles completed
 *
 * The formula encourages breadth (completing puzzles at various difficulty levels) while still
 * rewarding harder puzzles with higher scores. Completing only easy puzzles has diminishing returns.
 *
 * Example: 3×1-star, 1×3-star, 1×5-star = 20 + 23 + 36 = 79pts
 */

/**
 * Calculate the classic score for a user based on puzzles completed by star rating
 *
 * @param puzzlesByStars - Map of star level to count of puzzles completed at that level
 * @returns The total classic score
 */
export function calculateClassicScore(puzzlesByStars: Map<number, number>): number {
  let total = 0;
  let totalEasier = 0;

  // Sort by star level ascending (easier puzzles first)
  const sorted = [...puzzlesByStars.entries()].sort((a, b) => a[0] - b[0]);

  for (const [stars, count] of sorted) {
    if (count <= 0 || stars <= 0) continue;

    // S² × 10 × log₂(N+1) for base points
    const basePoints = stars * stars * 10 * Math.log2(count + 1);

    // Penalty factor: 10 / (10 + totalEasier)
    // This reduces the value of harder puzzles if you have many easier ones
    // But it also means early puzzles at each difficulty level are worth more
    const penaltyFactor = 10 / (10 + totalEasier);

    total += basePoints * penaltyFactor;
    totalEasier += count;
  }

  return Math.round(total * 100) / 100; // Round to 2 decimal places
}

/**
 * Calculate detailed breakdown of classic score by star level
 * Useful for displaying to users
 */
export function calculateClassicScoreBreakdown(puzzlesByStars: Map<number, number>): {
  total: number;
  breakdown: Array<{
    stars: number;
    count: number;
    basePoints: number;
    penaltyFactor: number;
    finalPoints: number;
  }>;
} {
  const breakdown: Array<{
    stars: number;
    count: number;
    basePoints: number;
    penaltyFactor: number;
    finalPoints: number;
  }> = [];

  let total = 0;
  let totalEasier = 0;

  const sorted = [...puzzlesByStars.entries()].sort((a, b) => a[0] - b[0]);

  for (const [stars, count] of sorted) {
    if (count <= 0 || stars <= 0) continue;

    const basePoints = stars * stars * 10 * Math.log2(count + 1);
    const penaltyFactor = 10 / (10 + totalEasier);
    const finalPoints = basePoints * penaltyFactor;

    breakdown.push({
      stars,
      count,
      basePoints: Math.round(basePoints * 100) / 100,
      penaltyFactor: Math.round(penaltyFactor * 1000) / 1000,
      finalPoints: Math.round(finalPoints * 100) / 100,
    });

    total += finalPoints;
    totalEasier += count;
  }

  return {
    total: Math.round(total * 100) / 100,
    breakdown,
  };
}

/**
 * Calculate weekly movement (rank change)
 *
 * @param currentRank - Current rank position
 * @param previousRank - Rank position from 7 days ago (null if no history)
 * @returns Movement value: positive = improved (moved up), negative = dropped, 0 = same, null = new
 */
export function calculateWeeklyMovement(
  currentRank: number,
  previousRank: number | null
): number | null {
  if (previousRank === null) {
    return null; // New to rankings
  }

  // Previous rank was higher number (worse), current is lower (better) = positive movement
  return previousRank - currentRank;
}

/**
 * Get total stars collected from puzzle metadata
 *
 * @param solvedPuzzleIds - Array of solved puzzle IDs
 * @param puzzleStarsMap - Map of puzzle ID to star rating
 * @returns Total stars collected
 */
export function calculateTotalStars(
  solvedPuzzleIds: string[],
  puzzleStarsMap: Map<string, number>
): number {
  return solvedPuzzleIds.reduce((total, puzzleId) => {
    const stars = puzzleStarsMap.get(puzzleId) || 0;
    return total + stars;
  }, 0);
}

/**
 * Get hardest puzzle stars (max stars from solved puzzles)
 *
 * @param solvedPuzzleIds - Array of solved puzzle IDs
 * @param puzzleStarsMap - Map of puzzle ID to star rating
 * @returns Maximum star rating among solved puzzles
 */
export function calculateHardestPuzzleStars(
  solvedPuzzleIds: string[],
  puzzleStarsMap: Map<string, number>
): number {
  return solvedPuzzleIds.reduce((max, puzzleId) => {
    const stars = puzzleStarsMap.get(puzzleId) || 0;
    return Math.max(max, stars);
  }, 0);
}

/**
 * Build puzzles by stars map from solved puzzle IDs
 *
 * @param solvedPuzzleIds - Array of solved puzzle IDs
 * @param puzzleStarsMap - Map of puzzle ID to star rating
 * @returns Map of star level to count of puzzles at that level
 */
export function buildPuzzlesByStarsMap(
  solvedPuzzleIds: string[],
  puzzleStarsMap: Map<string, number>
): Map<number, number> {
  const puzzlesByStars = new Map<number, number>();

  for (const puzzleId of solvedPuzzleIds) {
    const stars = puzzleStarsMap.get(puzzleId);
    if (stars && stars > 0) {
      const currentCount = puzzlesByStars.get(stars) || 0;
      puzzlesByStars.set(stars, currentCount + 1);
    }
  }

  return puzzlesByStars;
}
