import 'dotenv/config';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const app = express();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const distPath = path.resolve(__dirname, 'dist');
const indexHtmlPath = path.join(distPath, 'index.html');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Viktigt: skicka med Project ID
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  project: process.env.OPENAI_PROJECT_ID,
});

app.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    if (!q) return res.status(400).json({ error: 'Missing q' });

    // Hämta konversationshistorik från frontend
    let chatHistory = [];
    try {
      chatHistory = JSON.parse(req.query.history || '[]');
    } catch (e) {
      console.log('Could not parse history:', e);
    }

    // 1) Query embedding
    const er = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: q,
    });
    const queryEmbedding = er.data[0].embedding;

    // 2) Top chunks via pg RPC
    const { data: matches, error } = await supabase.rpc('match_chunks', {
      query_embedding: queryEmbedding,
      match_count: 5,
      similarity_threshold: 0.35,
    });
    if (error) throw error;
    if (!matches?.length) {
      return res.json({ answer: 'Jag hittar inte det i källorna.', sources: [] });
    }

    // 3) Hämta källor
    const ids = [...new Set(matches.map((m) => m.page_id))];
    const { data: pages } = await supabase
      .from('pages')
      .select('id,title,url')
      .in('id', ids);
    const byId = Object.fromEntries((pages || []).map((p) => [p.id, p]));

    // 4) Bygg konversationskontext från historik
    const conversationContext = chatHistory
      .filter(h => h.type === 'question' || h.type === 'answer')
      .map(h => {
        if (h.type === 'question') return `Användare: ${h.text}`;
        if (h.type === 'answer') return `Assistent: ${h.text}`;
        return '';
      })
      .join('\n');

    // 5) Kontext från dokument
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

    // 6) Svar med konversationskontext
    const prompt = `
Du är en hjälpsam assistent för Sandvikens kommun. Svara direkt på frågan på svenska utan att börja med hälsningar som "Hej" eller liknande.

${conversationContext ? `=== TIDIGARE KONVERSATION ===
${conversationContext}
=== SLUT PÅ TIDIGARE KONVERSATION ===

` : ''}Använd ENBART information från kontexten nedan. Om svaret inte finns där, säg "Jag hittar inte det i källorna."

VIKTIGT OM KORTA SVAR:
- Om användaren svarar "ja", "ok", "gärna" eller liknande - kolla i tidigare konversationen vad de frågade om och ge mer detaljer om det ämnet
- Använd kontexten nedan för att ge ett utförligt svar

Ditt svar ska vara:
- Vänligt och informativt i tonen
- Ge gärna lite extra information som kan vara relevant
- Avsluta gärna med en följdfråga om användaren kan behöva mer hjälp, t.ex:
  * "Vill du veta mer om...?"
  * "Behöver du hjälp med något relaterat?"
  * "Har du fler frågor om...?"

VIKTIGT: 
- Börja INTE svaret med "Hej" eller andra hälsningar
- Inkludera INTE käll-URL:er i ditt svar (de visas separat)
- Upprepa INTE frågan i ditt svar

Aktuell fråga: "${q}"

=== KONTEKST START ===
${context}
=== KONTEKST SLUT ===
    `.trim();

    const cr = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5, // Högre temperatur för mer konversationell stil
    });

    const answer = cr.choices[0].message.content.trim();
    const sources = matches.map((m) => byId[m.page_id]?.url).filter(Boolean);

    res.json({ answer, sources: [...new Set(sources)] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message || 'Server error' });
  }
});

// Servera statiska filer från dist/
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
} else {
  console.log('Dist-mappen saknas. Kör "npm run build" för att generera frontend innan du kör endast servern.');
}

app.listen(3000, () =>
  console.log('API up on http://localhost:3000')
);
