#!/usr/bin/env npx tsx
/**
 * One-time backfill script for daily rankings
 * Run this ONCE to finalize all historical daily rankings
 */

import { createClient } from '@supabase/supabase-js';
import type { ChallengeType } from '../../src/engine/types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  console.log('=== Daily Rankings Backfill ===\n');

  // Step 1: Check current state
  console.log('--- Current State ---');

  const { count: monthlyCount } = await supabase
    .from('monthly_daily_rankings')
    .select('*', { count: 'exact', head: true });
  console.log(`monthly_daily_rankings rows: ${monthlyCount ?? 0}`);

  const { data: alreadyFinalized } = await supabase
    .from('daily_leaderboard')
    .select('date, challenge_type')
    .eq('is_late', false)
    .neq('points', 10)
    .limit(5);

  if (alreadyFinalized && alreadyFinalized.length > 0) {
    console.log(`Already finalized entries found (sample): ${JSON.stringify(alreadyFinalized)}`);
  } else {
    console.log('No finalized entries found (all points = 10)');
  }

  // Step 2: Get all distinct date/challenge_type combinations
  const { data: entries, error: entriesError } = await supabase
    .from('daily_leaderboard')
    .select('date, challenge_type')
    .eq('is_late', false)
    .order('date', { ascending: true });

  if (entriesError) {
    console.error('Error fetching entries:', entriesError);
    process.exit(1);
  }

  // Get unique date/type combinations
  const uniqueCombos = new Map<string, { date: string; challengeType: ChallengeType }>();
  for (const entry of entries || []) {
    const key = `${entry.date}-${entry.challenge_type}`;
    if (!uniqueCombos.has(key)) {
      uniqueCombos.set(key, { date: entry.date, challengeType: entry.challenge_type as ChallengeType });
    }
  }

  console.log(`\nFound ${uniqueCombos.size} date/type combinations to process\n`);

  if (uniqueCombos.size === 0) {
    console.log('Nothing to backfill!');
    return;
  }

  // Step 3: Check if we should truncate monthly_daily_rankings
  if (monthlyCount && monthlyCount > 0) {
    console.log('WARNING: monthly_daily_rankings already has data.');
    console.log('If this data is incorrect, you should truncate it first.');
    console.log('Continuing anyway (the DB function is not idempotent!)...\n');
  }

  // Step 4: Process each combination
  console.log('--- Processing ---');
  let successCount = 0;
  let skipCount = 0;
  let errorCount = 0;

  for (const [key, { date, challengeType }] of uniqueCombos) {
    // Check if already finalized
    const { data: finalized } = await supabase
      .from('daily_leaderboard')
      .select('points')
      .eq('date', date)
      .eq('challenge_type', challengeType)
      .eq('is_late', false)
      .neq('points', 10)
      .limit(1);

    if (finalized && finalized.length > 0) {
      console.log(`SKIP: ${date} ${challengeType} (already finalized)`);
      skipCount++;
      continue;
    }

    // Call finalize function
    const { error } = await supabase.rpc('finalize_daily_rankings', {
      p_date: date,
      p_challenge_type: challengeType,
    });

    if (error) {
      console.error(`ERROR: ${date} ${challengeType} - ${error.message}`);
      errorCount++;
    } else {
      console.log(`OK: ${date} ${challengeType}`);
      successCount++;
    }
  }

  // Summary
  console.log('\n--- Summary ---');
  console.log(`Success: ${successCount}`);
  console.log(`Skipped (already finalized): ${skipCount}`);
  console.log(`Errors: ${errorCount}`);

  // Final state
  const { count: finalCount } = await supabase
    .from('monthly_daily_rankings')
    .select('*', { count: 'exact', head: true });
  console.log(`\nmonthly_daily_rankings now has ${finalCount ?? 0} rows`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
