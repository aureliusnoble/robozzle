/**
 * Upload puzzles to Supabase
 *
 * Usage:
 *   SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx npx tsx scripts/upload-puzzles.ts
 *
 * Or set these in .env.local and run:
 *   npx tsx scripts/upload-puzzles.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env.local if it exists
const envPath = path.join(__dirname, '..', '.env.local');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8');
  for (const line of envContent.split('\n')) {
    const match = line.match(/^(\w+)=(.*)$/);
    if (match) {
      process.env[match[1]] = match[2];
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing environment variables!');
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY (service role key, not anon key)');
  console.error('');
  console.error('Usage:');
  console.error('  SUPABASE_URL=https://xxx.supabase.co SUPABASE_SERVICE_KEY=xxx npx tsx scripts/upload-puzzles.ts');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

interface PuzzleData {
  id: string;
  title: string;
  description?: string;
  grid: any;
  robotStart: { position: { x: number; y: number }; direction: string };
  functionLengths: { f1: number; f2: number; f3: number; f4: number; f5: number };
  allowedInstructions: string[];
  category: string;
  difficulty: string;
  author?: string;
  stars?: number;
  communityDifficulty?: number;
}

// Convert from app format to DB format
function toDBFormat(puzzle: PuzzleData) {
  return {
    id: puzzle.id,
    title: puzzle.title,
    description: puzzle.description || null,
    grid: puzzle.grid,
    robot_start: puzzle.robotStart,
    function_lengths: puzzle.functionLengths,
    allowed_instructions: puzzle.allowedInstructions,
    category: puzzle.category,
    difficulty: puzzle.difficulty,
    author: puzzle.author || null,
    stars: puzzle.stars || null,
    community_difficulty: puzzle.communityDifficulty || null,
  };
}

async function runMigration() {
  console.log('Running migration...');

  // Check if we need to update the stars constraint by testing a high value
  const testResult = await supabase
    .from('puzzles')
    .select('stars')
    .gt('stars', 5)
    .limit(1);

  // If the query fails due to constraint, we need to update it
  // Try to run the SQL directly via rpc if available, otherwise print instructions
  console.log('Please run this SQL in your Supabase dashboard SQL editor if uploads fail:');
  console.log(`
-- Update stars constraint to allow 1-20
ALTER TABLE public.puzzles DROP CONSTRAINT IF EXISTS puzzles_stars_check;
ALTER TABLE public.puzzles ADD CONSTRAINT puzzles_stars_check CHECK (stars >= 1 AND stars <= 20);

-- Update difficulty constraint to include 'impossible'
ALTER TABLE public.puzzles DROP CONSTRAINT IF EXISTS puzzles_difficulty_check;
ALTER TABLE public.puzzles ADD CONSTRAINT puzzles_difficulty_check CHECK (difficulty IN ('easy', 'medium', 'hard', 'expert', 'impossible'));
  `);

  return true;
}

async function main() {
  const dataPath = path.join(__dirname, 'full-data.json');

  if (!fs.existsSync(dataPath)) {
    console.error('full-data.json not found! Run convert-puzzles.ts first.');
    process.exit(1);
  }

  // Check/run migration
  const migrationOk = await runMigration();
  if (!migrationOk) {
    console.log('\nRun the migration SQL above, then re-run this script.');
    process.exit(1);
  }

  console.log('\nLoading puzzles from full-data.json...');
  const puzzles: PuzzleData[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${puzzles.length} puzzles`);

  // Convert to DB format
  const dbPuzzles = puzzles.map(toDBFormat);

  // Upload in batches (Supabase recommends batches of 1000 or less)
  const BATCH_SIZE = 500;
  let uploaded = 0;
  let errors = 0;

  console.log(`\nUploading in batches of ${BATCH_SIZE}...`);

  for (let i = 0; i < dbPuzzles.length; i += BATCH_SIZE) {
    const batch = dbPuzzles.slice(i, i + BATCH_SIZE);

    const { error } = await supabase
      .from('puzzles')
      .upsert(batch, { onConflict: 'id' });

    if (error) {
      console.error(`Error uploading batch ${Math.floor(i / BATCH_SIZE) + 1}:`, error.message);
      errors += batch.length;
    } else {
      uploaded += batch.length;
      const percent = Math.round((uploaded / dbPuzzles.length) * 100);
      process.stdout.write(`\rUploaded: ${uploaded}/${dbPuzzles.length} (${percent}%)`);
    }
  }

  console.log('\n');
  console.log(`Done! Uploaded ${uploaded} puzzles, ${errors} errors`);

  // Verify count
  const { count, error: countError } = await supabase
    .from('puzzles')
    .select('*', { count: 'exact', head: true })
    .eq('category', 'classic');

  if (!countError) {
    console.log(`Total classic puzzles in database: ${count}`);
  }
}

main().catch(console.error);
