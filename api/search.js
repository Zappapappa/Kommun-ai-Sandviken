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

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    // 1. Create embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: q,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Search in Supabase
    const { data: chunks, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_threshold: 0.35,
      match_count: 5,
    });

    if (error) throw error;

    // 3. Build context
    let context = '';
    const sourceMap = new Map();
    
    if (chunks && chunks.length > 0) {
      chunks.forEach((chunk) => {
        context += chunk.content + '\n\n';
        if (chunk.page_url && chunk.page_title) {
          sourceMap.set(chunk.page_url, chunk.page_title);
        }
      });
    }

    // 4. Get AI response
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: `Du är en hjälpsam assistent för Sandvikens kommun. Svara direkt på frågan på svenska utan att börja med hälsningar som "Hej" eller liknande. Ge ett naturligt och hjälpsamt svar baserat på kontexten nedan. Avsluta gärna med en följdfråga om användaren behöver veta mer om något relaterat.

VIKTIGT: Börja INTE svaret med "Hej" eller andra hälsningsfraser.
VIKTIGT: Inkludera INTE käll-URL:er i ditt svar - dessa visas separat.

Om användaren svarar "ja", "ok", "gärna" eller liknande - tolka det som att de vill ha mer information om det huvudämne som finns i kontexten.

Kontext:
${context || 'Ingen relevant information hittades.'}`,
        },
        {
          role: 'user',
          content: q,
        },
      ],
    });

    const answer = completion.choices[0].message.content;
    const sources = Array.from(sourceMap.entries()).map(([url, title]) => ({
      url,
      title,
    }));

    res.status(200).json({ answer, sources });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
}
