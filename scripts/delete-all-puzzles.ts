/**
 * Delete all generated puzzles from the database.
 * Run with: npx tsx scripts/delete-all-puzzles.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function deleteAllPuzzles() {
  console.log('Deleting all generated puzzles...\n');

  // Delete all from pool first
  console.log('1. Deleting from generated_puzzle_pool...');
  const { error: poolError, count: poolCount } = await supabase
    .from('generated_puzzle_pool')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('*', { count: 'exact', head: true });

  if (poolError) {
    console.error('Error deleting from pool:', poolError);
  } else {
    console.log(`   Deleted ${poolCount ?? 'unknown'} pool entries`);
  }

  // Delete all daily challenges
  console.log('2. Deleting from daily_challenges...');
  const { error: dailyError, count: dailyCount } = await supabase
    .from('daily_challenges')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000')
    .select('*', { count: 'exact', head: true });

  if (dailyError) {
    console.error('Error deleting daily challenges:', dailyError);
  } else {
    console.log(`   Deleted ${dailyCount ?? 'unknown'} daily challenges`);
  }

  // Delete all generated puzzles (where generation_source is 'generated')
  console.log('3. Deleting puzzles with generation_source = "generated"...');
  const { error: puzzleError, count: puzzleCount } = await supabase
    .from('puzzles')
    .delete()
    .eq('generation_source', 'generated')
    .select('*', { count: 'exact', head: true });

  if (puzzleError) {
    console.error('Error deleting puzzles:', puzzleError);
  } else {
    console.log(`   Deleted ${puzzleCount ?? 'unknown'} puzzles`);
  }

  console.log('\nDone!');
}

deleteAllPuzzles().catch(console.error);
