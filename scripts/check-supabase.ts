import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  // Check the user that needs a profile
  const userId = 'bbe11f64-ab90-4a14-b1ef-757bd08a408f';
  
  console.log('Checking profiles table...\n');

  // Get existing profiles
  const { data: existing } = await supabase
    .from('profiles')
    .select('*');
  
  console.log('Existing profiles:', existing?.length);
  console.log(JSON.stringify(existing, null, 2));

  // Try inserting with service role (bypasses RLS)
  console.log('\nAttempting to create profile for user:', userId);
  
  const { data: insertData, error: insertError } = await supabase
    .from('profiles')
    .upsert({
      id: userId,
      username: 'aurelius_google',
    })
    .select();

  if (insertError) {
    console.log('Insert error:', insertError.message);
    console.log('Full error:', insertError);
  } else {
    console.log('Insert success:', insertData);
  }
}

main().catch(console.error);
