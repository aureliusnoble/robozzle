import type { LeaderboardEntry } from '../engine/types';

// Calculate points based on leaderboard position
export function calculatePoints(rank: number, totalParticipants: number): number {
  let points = 10; // Base participation points

  // Position bonuses
  if (rank === 1) points += 100;
  else if (rank === 2) points += 75;
  else if (rank === 3) points += 50;
  else if (rank <= 10) points += 25;
  else if (rank <= 25) points += 10;

  // Competition bonus (more participants = more points)
  const competitionBonus = Math.min(20, Math.floor(totalParticipants / 10));
  points += competitionBonus;

  return points;
}

// Compare solutions for ranking
// Returns: negative if a is better, positive if b is better, 0 if equal
export function compareSolutions(
  a: { instructions: number; steps: number; completedAt: Date },
  b: { instructions: number; steps: number; completedAt: Date }
): number {
  // Primary: fewer instructions (code golf)
  if (a.instructions !== b.instructions) {
    return a.instructions - b.instructions;
  }

  // Secondary: fewer steps (efficiency)
  if (a.steps !== b.steps) {
    return a.steps - b.steps;
  }

  // Tertiary: earlier completion time
  return a.completedAt.getTime() - b.completedAt.getTime();
}

// Assign ranks to leaderboard entries
export function assignRanks(entries: Omit<LeaderboardEntry, 'rank' | 'points'>[]): LeaderboardEntry[] {
  // Sort by solution quality
  const sorted = [...entries].sort((a, b) =>
    compareSolutions(
      { instructions: a.instructionsUsed, steps: a.steps, completedAt: a.completedAt },
      { instructions: b.instructionsUsed, steps: b.steps, completedAt: b.completedAt }
    )
  );

  const totalParticipants = sorted.length;

  return sorted.map((entry, index) => ({
    ...entry,
    rank: index + 1,
    points: calculatePoints(index + 1, totalParticipants),
  }));
}

// Format time difference for display
export function formatTimeDiff(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}

// Get day-of-week difficulty
export function getDayDifficulty(date: Date): string {
  const day = date.getDay();
  // Mon-Tue easy, Wed-Thu medium, Fri hard, Sat-Sun expert
  if (day === 1 || day === 2) return 'easy';
  if (day === 3 || day === 4) return 'medium';
  if (day === 5) return 'hard';
  return 'expert'; // Sat (6) and Sun (0)
}
