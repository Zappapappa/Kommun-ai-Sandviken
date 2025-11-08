import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🔍 Verifierar Supabase-tabeller...\n');

// Test chunks_v2 table
const { data: chunks, error: chunksError } = await supabase
  .from('chunks_v2')
  .select('id')
  .limit(1);

if (chunksError) {
  console.log('❌ chunks_v2 finns INTE:', chunksError.message);
} else {
  console.log('✅ chunks_v2 finns! Rader:', chunks.length);
}

// Test pages table
const { data: pages, error: pagesError } = await supabase
  .from('pages')
  .select('id')
  .limit(1);

if (pagesError) {
  console.log('❌ pages finns INTE:', pagesError.message);
} else {
  console.log('✅ pages finns! Rader:', pages.length);
}

// Test match_chunks_v2 function
const { data: matchTest, error: matchError } = await supabase
  .rpc('match_chunks_v2', {
    query_embedding: Array(1536).fill(0),
    match_threshold: 0.5,
    match_count: 1
  });

if (matchError) {
  console.log('❌ match_chunks_v2 RPC finns INTE:', matchError.message);
} else {
  console.log('✅ match_chunks_v2 RPC finns!');
}

console.log('\n✅ Verifiering klar!\n');
