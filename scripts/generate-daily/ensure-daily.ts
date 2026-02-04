#!/usr/bin/env npx tsx
/**
 * Lightweight Daily Challenge Check Script
 *
 * This script runs at midnight UTC to ensure today's daily challenges are in place.
 * It does NOT generate new puzzles - it only selects from the existing pool.
 * This serves as a safety net in case the 10pm generation script failed.
 *
 * Usage:
 *   npx tsx scripts/generate-daily/ensure-daily.ts
 */

import { createClient } from '@supabase/supabase-js';
import type { ChallengeType } from '../../src/engine/types';

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Get today's date in YYYY-MM-DD format (UTC)
function getTodayDate(): string {
  return new Date().toISOString().split('T')[0];
}

// Get yesterday's date in YYYY-MM-DD format (UTC)
function getYesterdayDate(): string {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  return yesterday.toISOString().split('T')[0];
}

// Check if rankings have already been finalized for a given date and type
// After finalization, points range from 5-100 based on rank (default is 10)
async function isAlreadyFinalized(date: string, challengeType: ChallengeType): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_leaderboard')
    .select('points')
    .eq('date', date)
    .eq('challenge_type', challengeType)
    .eq('is_late', false)
    .neq('points', 10)
    .limit(1);

  if (error) {
    console.error('Error checking finalization status:', error);
    return false; // Assume not finalized if we can't check
  }

  return data && data.length > 0;
}

// Finalize daily rankings for a given date and challenge type
async function finalizeDailyRankings(date: string, challengeType: ChallengeType): Promise<boolean> {
  // Check if already finalized (idempotency)
  const alreadyFinalized = await isAlreadyFinalized(date, challengeType);
  if (alreadyFinalized) {
    console.log(`Rankings for ${date} ${challengeType} already finalized, skipping`);
    return true;
  }

  // Check if there are any entries to finalize
  const { count, error: countError } = await supabase
    .from('daily_leaderboard')
    .select('*', { count: 'exact', head: true })
    .eq('date', date)
    .eq('challenge_type', challengeType)
    .eq('is_late', false);

  if (countError) {
    console.error('Error counting leaderboard entries:', countError);
    return false;
  }

  if (!count || count === 0) {
    console.log(`No entries to finalize for ${date} ${challengeType}`);
    return true;
  }

  console.log(`Finalizing ${count} entries for ${date} ${challengeType}...`);

  // Call the database function via RPC
  const { error } = await supabase.rpc('finalize_daily_rankings', {
    p_date: date,
    p_challenge_type: challengeType,
  });

  if (error) {
    console.error(`Error finalizing ${challengeType} rankings for ${date}:`, error);
    return false;
  }

  console.log(`Successfully finalized ${challengeType} rankings for ${date}`);
  return true;
}

// Check if a daily challenge exists for a given date and type
async function hasDailyChallenge(date: string, challengeType: ChallengeType): Promise<boolean> {
  const { data, error } = await supabase
    .from('daily_challenges')
    .select('id')
    .eq('date', date)
    .eq('challenge_type', challengeType)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('Error checking daily challenge:', error);
  }
  return !!data;
}

// Get the next daily number based on archive count
async function getNextDailyNumber(challengeType: ChallengeType): Promise<number> {
  const { count, error } = await supabase
    .from('daily_challenges')
    .select('*', { count: 'exact', head: true })
    .eq('challenge_type', challengeType);

  if (error) {
    console.error('Error counting daily challenges:', error);
    return 1;
  }
  return (count || 0) + 1;
}

// Select a puzzle from the pool and set it as the daily for a given date
async function selectDailyPuzzle(challengeType: ChallengeType, targetDate: string): Promise<boolean> {
  // Get an available puzzle from the pool
  const { data: poolEntry, error: poolError } = await supabase
    .from('generated_puzzle_pool')
    .select('puzzle_id, id')
    .eq('mechanic_category', challengeType)
    .is('used_for_daily', null)
    .order('quality_score', { ascending: false })
    .limit(1)
    .single();

  if (poolError || !poolEntry) {
    console.log(`No available ${challengeType} puzzles in pool`);
    return false;
  }

  const puzzleId = poolEntry.puzzle_id;
  const poolId = poolEntry.id;

  // Get next daily number
  const dailyNumber = await getNextDailyNumber(challengeType);
  const dailyTitle = `Daily ${challengeType === 'easy' ? 'Easy' : 'Challenge'} #${dailyNumber}`;

  console.log(`Selecting ${challengeType} puzzle ${puzzleId} as "${dailyTitle}"`);

  // Update puzzle title
  const { error: titleError } = await supabase
    .from('puzzles')
    .update({ title: dailyTitle, description: null })
    .eq('id', puzzleId);

  if (titleError) {
    console.error('Error updating puzzle title:', titleError);
    return false;
  }

  // Mark as used in pool
  const { error: usedError } = await supabase
    .from('generated_puzzle_pool')
    .update({ used_for_daily: targetDate })
    .eq('id', poolId);

  if (usedError) {
    console.error('Error marking puzzle as used:', usedError);
    return false;
  }

  // Create daily challenge entry
  const { error: dailyError } = await supabase
    .from('daily_challenges')
    .insert({
      date: targetDate,
      puzzle_id: puzzleId,
      challenge_type: challengeType,
    });

  if (dailyError) {
    console.error('Error creating daily challenge:', dailyError);
    return false;
  }

  console.log(`Successfully set ${dailyTitle} for ${targetDate}`);
  return true;
}

async function main() {
  console.log('=== Daily Challenge Safety Check ===');
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // Step 1: Finalize yesterday's rankings
  const yesterday = getYesterdayDate();
  console.log(`\n--- Finalizing Rankings for ${yesterday} ---`);

  const easyFinalized = await finalizeDailyRankings(yesterday, 'easy');
  const challengeFinalized = await finalizeDailyRankings(yesterday, 'challenge');

  if (!easyFinalized || !challengeFinalized) {
    console.warn('Warning: Some rankings could not be finalized. Check logs above.');
    // Continue anyway - don't block daily setup
  }

  // Step 2: Ensure today's dailies exist
  const today = getTodayDate();
  console.log(`\n--- Checking Dailies for ${today} ---`);

  // Check and ensure today's dailies exist
  const hasTodayEasy = await hasDailyChallenge(today, 'easy');
  const hasTodayChallenge = await hasDailyChallenge(today, 'challenge');

  if (hasTodayEasy) {
    console.log('Easy daily: OK');
  } else {
    console.log('Easy daily: MISSING - selecting from pool...');
    const success = await selectDailyPuzzle('easy', today);
    if (success) {
      console.log('Easy daily: Fixed');
    } else {
      console.error('Easy daily: FAILED to fix - pool may be empty');
    }
  }

  if (hasTodayChallenge) {
    console.log('Challenge daily: OK');
  } else {
    console.log('Challenge daily: MISSING - selecting from pool...');
    const success = await selectDailyPuzzle('challenge', today);
    if (success) {
      console.log('Challenge daily: Fixed');
    } else {
      console.error('Challenge daily: FAILED to fix - pool may be empty');
    }
  }

  console.log('\n=== Check Complete ===');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
