import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initiera klienter
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
});

// Multi-tenant: Sandviken tenant ID
const TENANT_ID = process.env.TENANT_ID || 'fda40f49-f0bf-47eb-b2dc-675e7385dc42';

// Kategori-mappning baserat på URL
function getCategoryFromUrl(url) {
  if (url.includes('/utbildningochforskola/')) return 'Utbildning och förskola';
  if (url.includes('/omsorgochstod/')) return 'Omsorg och stöd';
  if (url.includes('/kulturochfritid/')) return 'Kultur och fritid';
  if (url.includes('/byggaboochmiljo/')) return 'Bygga, bo och miljö';
  if (url.includes('/trafikochinfrastruktur/')) return 'Trafik och infrastruktur';
  if (url.includes('/naringslivocharbete/')) return 'Näringsliv och arbete';
  if (url.includes('/kommunochpolitik/')) return 'Kommun och politik';
  return 'Övrigt';
}

// Chunkning (samma som v1)
function chunkText(text, size = 1200, overlap = 150) {
  const chunks = [];
  let i = 0;
  while (i < text.length) {
    const end = Math.min(i + size, text.length);
    const slice = text.slice(i, end).trim();
    if (slice) chunks.push(slice);
    i += Math.max(1, size - overlap);
  }
  return chunks;
}

async function embedChunksForPageV2(page, dryRun = false) {
  const chunks = chunkText(page.content);
  if (chunks.length === 0) return { chunks: 0, category: 'N/A' };

  const category = getCategoryFromUrl(page.url);
  console.log(`🧩 ${page.title} → ${chunks.length} chunks → ${category}`);

  if (dryRun) {
    return { chunks: chunks.length, category };
  }

  // Skapa embeddings
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks,
  });
  const vectors = resp.data.map((d) => d.embedding);

  // Rensa gamla chunks för denna page_id i multi-tenant tabellen
  await supabase.from('document_chunks')
    .delete()
    .eq('tenant_id', TENANT_ID)
    .eq('page_id', page.id);

  // Skapa chunks med metadata (multi-tenant)
  const rows = chunks.map((content, idx) => ({
    tenant_id: TENANT_ID,
    page_id: page.id,
    content,
    embedding: vectors[idx],
    chunk_index: idx,
    category,
  }));

  // Insert i batchar
  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from('document_chunks').insert(rows.slice(i, i + batchSize));
    if (error) throw error;
  }

  return { chunks: chunks.length, category };
}

async function run(dryRun = false) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`RAG v2 REINDEXERING ${dryRun ? '(DRY RUN - INGEN SKRIVNING)' : '(SKARP KÖRNING)'}`);
  console.log(`${'='.repeat(60)}\n`);

  // Hämta alla pages från multi-tenant tabell
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, content, url')
    .eq('tenant_id', TENANT_ID)
    .order('id', { ascending: true });

  if (error) throw error;
  if (!pages?.length) {
    console.log('❌ Inga sidor i pages-tabellen.');
    return;
  }

  console.log(`📄 Totalt antal dokument att bearbeta: ${pages.length}\n`);

  // Statistik
  const stats = {
    total: pages.length,
    processed: 0,
    failed: 0,
    categories: {},
  };

  for (const page of pages) {
    try {
      const result = await embedChunksForPageV2(page, dryRun);
      stats.processed++;
      stats.categories[result.category] = (stats.categories[result.category] || 0) + 1;
    } catch (e) {
      console.error(`❌ Fel vid bearbetning av: ${page.title} - ${e.message}`);
      stats.failed++;
    }
  }

  // Logga sammanfattning
  console.log(`\n${'='.repeat(60)}`);
  console.log('SAMMANFATTNING');
  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Totalt antal dokument: ${stats.total}`);
  console.log(`✅ Bearbetade: ${stats.processed}`);
  console.log(`❌ Misslyckade: ${stats.failed}`);
  console.log(`\n📊 Antal per kategori:`);
  
  Object.entries(stats.categories)
    .sort((a, b) => b[1] - a[1])
    .forEach(([cat, count]) => {
      console.log(`   ${cat.padEnd(30)} ${count}`);
    });
  
  console.log(`${'='.repeat(60)}\n`);

  if (dryRun) {
    console.log('💡 Detta var en DRY RUN - ingen data skrevs till databasen.');
    console.log('💡 Kör "node embed-v2.js --run" för att skriva till document_chunks.\n');
  } else {
    console.log('✅ Reindexering klar! Data finns nu i "document_chunks"-tabellen.\n');
  }
}

// Kör med argument: node embed-v2.js --dry (default) eller node embed-v2.js --run
const isDryRun = !process.argv.includes('--run');

run(isDryRun).catch((e) => {
  console.error('\n❌ FEL VID KÖRNING:', e.message || e);
  process.exit(1);
});
