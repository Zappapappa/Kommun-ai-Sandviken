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

// Multi-tenant: Sandviken tenant ID
const TENANT_ID = process.env.TENANT_ID || 'fda40f49-f0bf-47eb-b2dc-675e7385dc42';

// Automatisk kategoridetektion baserat på nyckelord i frågan
function detectCategoryFromQuery(query) {
  const q = query.toLowerCase();

  if (q.match(/bygglov|ritning|bygga|hus|villa|altan|inglasning|tillbyggnad|fasad|carport|garage|attefallshus/)) {
    return 'Bygga, bo och miljö';
  }

  if (q.match(/hemtjänst|äldreomsorg|omsorg|stöd|personlig assistent|funktionsnedsättning|lss|boende|vård/)) {
    return 'Omsorg och stöd';
  }

  if (q.match(/skola|förskola|fritids|grundskola|gymnasium|utbildning|elev|lärare|pedagogisk/)) {
    return 'Utbildning och förskola';
  }

  if (q.match(/kultur|bibliotek|idrott|fritid|museum|teater|konsert|sport|aktivitet/)) {
    return 'Kultur och fritid';
  }

  if (q.match(/trafik|parkering|väg|gata|snöröjning|vinter|cykel|gång|infart|parkerings/)) {
    return 'Trafik och infrastruktur';
  }

  if (q.match(/företag|näringsliv|tillstånd|serveringstillstånd|etablera|starta företag|jobb|arbete/)) {
    return 'Näringsliv och arbete';
  }

  if (q.match(/kommun|politik|nämnd|styrelse|fullmäktige|kontakt|kommun/)) {
    return 'Kommun och politik';
  }

  return null;
}

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

    // Enkel konversationshistorik från frontend
    let chatHistory = [];
    try {
      chatHistory = JSON.parse(req.query.history || '[]');
    } catch (e) {
      console.log('Could not parse history:', e);
    }

    // Identifiera korta följdfrågor (ja, ok, etc)
    const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);
    let detectedCategory = null;

    if (isShortFollowUp && chatHistory.length > 0) {
      const lastRealQuestion = chatHistory
        .filter((h) => h.type === 'question' && h.text.length > 10)
        .pop();
      if (lastRealQuestion) {
        detectedCategory = detectCategoryFromQuery(lastRealQuestion.text);
      }
    } else if (!isShortFollowUp) {
      detectedCategory = detectCategoryFromQuery(q);
    }

    console.log(`🔍 API /search query: "${q}" ${detectedCategory ? `[auto-detected: ${detectedCategory}]` : '[all categories]'}`);

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
      tenant_id_param: TENANT_ID,
      filter_category: detectedCategory,
    });

    if (error) throw error;

    // 3. Get page info for sources
    const pageIds = chunks ? [...new Set(chunks.map((c) => c.page_id))] : [];
    const { data: pages } = await supabase
      .from('pages')
      .select('id, url, title')
      .eq('tenant_id', TENANT_ID)
      .in('id', pageIds);

    // 4. Build context and sources (include kategori)
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
      
      // Add sources from pages
      if (pages && pages.length > 0) {
        pages.forEach((page) => {
          if (page.url && page.title) {
            const cat = categoryInfo.get(page.id) || 'Okänd';
            sourceMap.set(page.url, { title: page.title, category: cat });
          }
        });
      }
    }

    // 4.5. Konversationskontext (enkel)
    const conversationContext = chatHistory
      .filter((h) => h.type === 'question' || h.type === 'answer')
      .map((h) => {
        if (h.type === 'question') return `Användare: ${h.text}`;
        if (h.type === 'answer') return `Assistent: ${h.text}`;
        return '';
      })
      .join('\n');

    // 5. Get AI response
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

` : ''}Använd ENBART information från kontexten nedan när du besvarar frågor.

VIKTIGT OM KORTA SVAR:
- Om användaren svarar "ja", "ok", "gärna" eller liknande - kolla i tidigare konversationen vad de frågade om och ge mer detaljer om det ämnet
- Använd kontexten nedan för att ge ett utförligt svar

OM INFORMATION SAKNAS I KONTEXTEN:
- Säg INTE bara "Jag hittar inte det i källorna" och sluta där
- Var hjälpsam och förstående
- Ställ preciserande frågor för att förstå vad användaren behöver
- Exempel vid bygglovsfrågor: "Vad är det du tänker söka bygglov för? En altan, öppen spis, carport eller något annat? Berätta gärna mer så kan jag hjälpa dig bättre!"
- Exempel vid tidsfrågor: "För att ge dig en exakt tid behöver jag veta mer om ditt specifika ärende. Kan du berätta lite mer om vad det gäller?"
- Exempel vid kostnader: "Kostnaden varierar beroende på vad det gäller. Kan du specificera vad du är intresserad av?"

Ditt svar ska vara:
- Vänligt och informativt i tonen
- Hjälpsamt även när exakt information saknas
- Ställ uppföljande frågor för att kunna hjälpa bättre
- Ge gärna lite extra information som kan vara relevant
- Avsluta gärna med en följdfråga om användaren kan behöva mer hjälp

VIKTIGT: 
- Börja INTE svaret med "Hej" eller andra hälsningar
- Inkludera INTE käll-URL:er i ditt svar (de visas separat)
- Upprepa INTE frågan i ditt svar

Aktuell fråga: "${q}"

=== KONTEXT START ===
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

    res.status(200).json({
      answer,
      sources,
      metadata: {
        version: 'v2',
        detected_category: detectedCategory,
        chunks_found: chunks?.length || 0,
      },
    });
  } catch (err) {
    console.error('Search error:', err);
    res.status(500).json({ error: err.message });
  }
}
