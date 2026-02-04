/**
 * Timezone-aware date utilities for streak tracking
 */

/**
 * Get today's date in the user's timezone (YYYY-MM-DD format)
 */
export function getUserLocalDate(timezone: string = 'UTC'): string {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    // Fallback to UTC if timezone is invalid
    return new Date().toLocaleDateString('en-CA', { timeZone: 'UTC' });
  }
}

/**
 * Get yesterday's date in the user's timezone (YYYY-MM-DD format)
 */
export function getYesterdayLocalDate(timezone: string = 'UTC'): string {
  try {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA', { timeZone: timezone });
  } catch {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return yesterday.toLocaleDateString('en-CA', { timeZone: 'UTC' });
  }
}

/**
 * Check if a date string is yesterday in the user's timezone
 */
export function isYesterday(dateStr: string, timezone: string = 'UTC'): boolean {
  return dateStr === getYesterdayLocalDate(timezone);
}

/**
 * Get the user's browser timezone
 */
export function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'UTC';
  }
}

/**
 * Calculate days between two date strings (YYYY-MM-DD format)
 */
export function daysBetween(dateStr1: string, dateStr2: string): number {
  const date1 = new Date(dateStr1 + 'T00:00:00');
  const date2 = new Date(dateStr2 + 'T00:00:00');
  const diffTime = date2.getTime() - date1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}
