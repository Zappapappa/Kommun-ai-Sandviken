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

// Automatisk kategoridetektion baserat på nyckelord i frågan
function detectCategoryFromQuery(query) {
  const q = query.toLowerCase();
  
  // Bygga, bo och miljö
  if (q.match(/bygglov|ritning|bygga|hus|villa|altan|inglasning|tillbyggnad|fasad|carport|garage|attefallshus/)) {
    return 'Bygga, bo och miljö';
  }
  
  // Omsorg och stöd
  if (q.match(/hemtjänst|äldreomsorg|omsorg|stöd|personlig assistent|funktionsnedsättning|lss|boende|vård/)) {
    return 'Omsorg och stöd';
  }
  
  // Utbildning och förskola
  if (q.match(/skola|förskola|fritids|grundskola|gymnasium|utbildning|elev|lärare|pedagogisk/)) {
    return 'Utbildning och förskola';
  }
  
  // Kultur och fritid
  if (q.match(/kultur|bibliotek|idrott|fritid|museum|teater|konsert|sport|aktivitet/)) {
    return 'Kultur och fritid';
  }
  
  // Trafik och infrastruktur
  if (q.match(/trafik|parkering|väg|gata|snöröjning|vinter|cykel|gång|infart|parkerings/)) {
    return 'Trafik och infrastruktur';
  }
  
  // Näringsliv och arbete
  if (q.match(/företag|näringsliv|tillstånd|serveringstillstånd|etablera|starta företag|jobb|arbete/)) {
    return 'Näringsliv och arbete';
  }
  
  // Kommun och politik
  if (q.match(/kommun|politik|nämnd|styrelse|fullmäktige|kontakt|kommun/)) {
    return 'Kommun och politik';
  }
  
  return null; // Sök i alla kategorier
}

app.get('/api/search-v2', async (req, res) => {
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

    // Kolla om detta är en kort följdfråga (ja, ok, etc)
    const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);
    
    // Automatisk kategoridetektion
    let detectedCategory = null;
    
    if (isShortFollowUp && chatHistory.length > 0) {
      // För "ja", "ok" etc: använd samma kategori som i tidigare konversation
      const lastRealQuestion = chatHistory.filter(h => h.type === 'question' && h.text.length > 10).pop();
      if (lastRealQuestion) {
        detectedCategory = detectCategoryFromQuery(lastRealQuestion.text);
        console.log(`📌 Follow-up detected, reusing category from: "${lastRealQuestion.text}"`);
      }
    } else if (!isShortFollowUp) {
      // Normal fråga: detektera kategori från själva frågan
      detectedCategory = detectCategoryFromQuery(q);
    }
    
    console.log(`🔍 Search v2 query: "${q}" ${detectedCategory ? `[auto-detected: ${detectedCategory}]` : '[all categories]'} ${isShortFollowUp ? '(follow-up)' : ''}`);

    // 1. Create embedding for query
    const embeddingResponse = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: q,
    });
    const queryEmbedding = embeddingResponse.data[0].embedding;

    // 2. Search in Supabase using v2 RPC (with auto-detected category filter)
    const { data: chunks, error } = await supabase.rpc('match_chunks_v2', {
      query_embedding: queryEmbedding,
      match_count: 5,
      similarity_threshold: 0.35,
      filter_category: detectedCategory,
    });

    if (error) {
      console.error('RPC error:', error);
      throw error;
    }

    console.log(`📦 Found ${chunks?.length || 0} chunks`);

    // 3. Get page info for sources
    const pageIds = chunks ? [...new Set(chunks.map(c => c.page_id))] : [];
    const { data: pages } = await supabase
      .from('pages')
      .select('id, url, title')
      .in('id', pageIds);

    // 4. Build context and sources (include category info)
    let context = '';
    const sourceMap = new Map();
    const categoryInfo = new Map();
    
    if (chunks && chunks.length > 0) {
      chunks.forEach((chunk) => {
        context += chunk.content + '\n\n';
        if (chunk.category) {
          categoryInfo.set(chunk.page_id, chunk.category);
        }
      });
      
      // Add sources from pages with category
      if (pages && pages.length > 0) {
        pages.forEach((page) => {
          if (page.url && page.title) {
            const cat = categoryInfo.get(page.id) || 'Okänd';
            sourceMap.set(page.url, { title: page.title, category: cat });
          }
        });
      }
    }

    // 5. Bygg konversationskontext från historik
    const conversationContext = chatHistory
      .filter(h => h.type === 'question' || h.type === 'answer')
      .map(h => {
        if (h.type === 'question') return `Användare: ${h.text}`;
        if (h.type === 'answer') return `Assistent: ${h.text}`;
        return '';
      })
      .join('\n');

    // 6. Get AI response with conversation context
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.5,
      messages: [
        {
          role: 'system',
          content: `Du är en hjälpsam assistent för Sandvikens kommun. Svara direkt på frågan på svenska utan att börja med hälsningar som "Hej" eller liknande. Ge ett naturligt och hjälpsamt svar baserat på kontexten nedan. Avsluta gärna med en följdfråga om användaren behöver veta mer om något relaterat.

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
- Avsluta gärna med en följdfråga om användaren kan behöva mer hjälp

VIKTIGT: 
- Börja INTE svaret med "Hej" eller andra hälsningar
- Inkludera INTE käll-URL:er i ditt svar (de visas separat)
- Upprepa INTE frågan i ditt svar

Aktuell fråga: "${q}"

=== KONTEXST START ===
${context || 'Ingen relevant information hittades.'}
=== KONTEXT SLUT ===`,
        },
        {
          role: 'user',
          content: q,
        },
      ],
    });

    const answer = completion.choices[0].message.content;
    const sources = Array.from(sourceMap.entries()).map(([url, data]) => ({
      url,
      title: data.title,
      category: data.category,
    }));

    console.log(`✅ Response generated with ${sources.length} sources`);

    res.status(200).json({ 
      answer, 
      sources,
      metadata: {
        version: 'v2',
        detected_category: detectedCategory,
        chunks_found: chunks?.length || 0,
      }
    });
  } catch (err) {
    console.error('Search v2 error:', err);
    res.status(500).json({ error: err.message });
  }
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
