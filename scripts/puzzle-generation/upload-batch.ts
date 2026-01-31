#!/usr/bin/env npx tsx
// Upload generated puzzles from JSON file to Supabase

import { uploadBatch, loadBatchFromFile } from './uploader';

async function main() {
  const filepath = process.argv[2] || 'generated-puzzles.json';

  console.log(`Loading puzzles from ${filepath}...`);
  const batch = loadBatchFromFile(filepath);

  if (!batch) {
    console.error('Failed to load batch file');
    process.exit(1);
  }

  console.log(`Uploading ${batch.puzzles.length} puzzles...`);
  const result = await uploadBatch(batch);

  console.log('\nUpload result:');
  console.log(`  Uploaded: ${result.uploaded}`);
  console.log(`  Failed: ${result.failed}`);

  if (result.errors.length > 0) {
    console.log('\nErrors:');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  process.exit(result.success ? 0 : 1);
}

main();
