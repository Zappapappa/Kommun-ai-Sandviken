import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// Supabase-klient
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// OpenAI-klient (viktigt: inkludera project)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
});

async function embedQueryVec(q) {
  const r = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input: q,
  });
  return r.data[0].embedding;
}

async function run(q = 'Hur lång tid tar bygglov i Sandviken?') {
  console.log('🔎 Fråga:', q);

  // 1) Embedding för frågan
  const queryEmbedding = await embedQueryVec(q);

  // 2) Hämta top-chunks från Postgres-funktionen
  const { data: matches, error } = await supabase.rpc('match_chunks', {
    query_embedding: queryEmbedding,
    match_count: 5,
    similarity_threshold: 0.35,
  });
  if (error) throw error;
  if (!matches?.length) {
    console.log('Inga träffar.');
    return;
  }

  // 3) Hämta käll-URL:er
  const ids = [...new Set(matches.map((m) => m.page_id))];
  const { data: pages } = await supabase
    .from('pages')
    .select('id,title,url')
    .in('id', ids);
  const byId = Object.fromEntries((pages || []).map((p) => [p.id, p]));

  // 4) Bygg kontext
  const context = matches
    .map((m, i) => {
      const p = byId[m.page_id];
      return `# Källa ${i + 1}
Titel: ${p?.title}
URL: ${p?.url}
Utdrag:
${m.content}
`;
    })
    .join('\n');

  // 5) Generera kort svar
  const prompt = `
Svara KORT och tydligt på svenska baserat ENBART på kontexten nedan. Om svaret inte finns, säg "Jag hittar inte det i källorna".
Lista sedan käll-URL:er som punktlista.

Fråga: "${q}"

=== KONTEKST START ===
${context}
=== KONTEKST SLUT ===
  `.trim();

  const resp = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.2,
  });

  console.log('\n— SVAR —\n' + resp.choices[0].message.content.trim());
}

run(process.argv.slice(2).join(' ') || undefined).catch((e) => {
  console.error('Fel:', e.status || '', e.message || e);
});
