import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
});

console.log('\n🧪 TESTAR CHUNKS_V2 SÖKNING\n');
console.log('='.repeat(60));

// Test 1: Kolla att tabellen har data
console.log('\n📊 Test 1: Antal rader i chunks_v2...');
const { data: countData, error: countError } = await supabase
  .from('chunks_v2')
  .select('id', { count: 'exact', head: true });

if (countError) {
  console.log('❌ Fel:', countError.message);
} else {
  console.log(`✅ chunks_v2 innehåller ${countData?.length || 0} chunks`);
}

// Test 2: Visa kategorier
console.log('\n📂 Test 2: Kategorier i databasen...');
const { data: categories, error: catError } = await supabase
  .from('chunks_v2')
  .select('category')
  .limit(1000);

if (catError) {
  console.log('❌ Fel:', catError.message);
} else {
  const catCount = {};
  categories.forEach(row => {
    catCount[row.category] = (catCount[row.category] || 0) + 1;
  });
  console.log('Fördelning:');
  Object.entries(catCount)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`  ${cat.padEnd(30)} ${count} chunks`);
    });
}

// Test 3: Testa match_chunks_v2 RPC
console.log('\n🔍 Test 3: Testar match_chunks_v2 RPC-funktion...');
const testQuery = 'Hur ansöker jag om bygglov?';
console.log(`Fråga: "${testQuery}"`);

// Skapa embedding
const embeddingResp = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: testQuery,
});
const queryEmbedding = embeddingResp.data[0].embedding;

// Test utan kategorifilter
console.log('\n  → Söker utan kategorifilter...');
const { data: results1, error: error1 } = await supabase
  .rpc('match_chunks_v2', {
    query_embedding: queryEmbedding,
    match_count: 3,
    similarity_threshold: 0.3,
    filter_category: null
  });

if (error1) {
  console.log('  ❌ Fel:', error1.message);
} else {
  console.log(`  ✅ Hittade ${results1.length} resultat:`);
  results1.forEach((r, i) => {
    console.log(`     ${i+1}. [${r.category}] (similarity: ${r.similarity.toFixed(3)})`);
    console.log(`        ${r.content.substring(0, 80)}...`);
  });
}

// Test med kategorifilter
console.log('\n  → Söker med filter: "Bygga, bo och miljö"...');
const { data: results2, error: error2 } = await supabase
  .rpc('match_chunks_v2', {
    query_embedding: queryEmbedding,
    match_count: 3,
    similarity_threshold: 0.3,
    filter_category: 'Bygga, bo och miljö'
  });

if (error2) {
  console.log('  ❌ Fel:', error2.message);
} else {
  console.log(`  ✅ Hittade ${results2.length} resultat (endast Bygga, bo och miljö):`);
  results2.forEach((r, i) => {
    console.log(`     ${i+1}. [${r.category}] (similarity: ${r.similarity.toFixed(3)})`);
    console.log(`        ${r.content.substring(0, 80)}...`);
  });
}

console.log('\n' + '='.repeat(60));
console.log('✅ Test klart!\n');
