import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Initiera klienter EN gång
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
});

// Enkel chunkning (ca 1200 tecken, 150 överlapp)
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

async function embedChunksForPage(page) {
  const chunks = chunkText(page.content);
  if (chunks.length === 0) return;

  console.log(`🧩 ${page.title} → ${chunks.length} chunks`);

  // Skapa embeddings
  const resp = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: chunks,
  });
  const vectors = resp.data.map((d) => d.embedding);

  // Rensa gamla och spara nya
  await supabase.from('chunks').delete().eq('page_id', page.id);

  const rows = chunks.map((content, idx) => ({
    page_id: page.id,
    content,
    embedding: vectors[idx],
    chunk_order: idx,
  }));

  const batchSize = 200;
  for (let i = 0; i < rows.length; i += batchSize) {
    const { error } = await supabase.from('chunks').insert(rows.slice(i, i + batchSize));
    if (error) throw error;
  }
}

async function run() {
  const { data: pages, error } = await supabase
    .from('pages')
    .select('id, title, content')
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error) throw error;
  if (!pages?.length) {
    console.log('Inga sidor i pages-tabellen.');
    return;
  }

  for (const p of pages) {
    try {
      await embedChunksForPage(p);
    } catch (e) {
      console.error('Fel vid embedding:', p.title, e.message);
    }
  }

  console.log('✅ Klart: embeddings sparade i "chunks".');
}

run().catch((e) => {
  console.error('Fel vid körning:', e.message || e);
});
