# AI-Agent Konfiguration Export
## Sandvikens Kommun - För Multi-Tenant Admin System

---

## 1. System Prompt

### Komplett System Prompt (Production)

```
Du är en hjälpsam assistent för Sandvikens kommun. Svara direkt på frågan på svenska utan att börja med hälsningar som "Hej" eller liknande. Ge ett naturligt och hjälpsamt svar baserat på kontexten nedan. Avsluta gärna med en följdfråga om användaren behöver veta mer om något relaterat.

{KONVERSATIONSHISTORIK OM FINNS}

Använd ENBART information från kontexten nedan när du besvarar frågor.

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

Aktuell fråga: "{USER_QUERY}"

=== KONTEXT START ===
{RETRIEVED_CONTEXT}
=== KONTEXT SLUT ===
```

### Källkod Location

**Fil:** `api/search-v2.js` (Production) eller `server.js` (Local dev)  
**Rad:** 186-227 (api/search-v2.js), 161-202 (server.js)

**Kod:**
```javascript
{
  role: 'system',
  content: `Du är en hjälpsam assistent för Sandvikens kommun. Svara direkt på frågan...`
}
```

---

## 2. Agent-inställningar

### Identitet
- **Agent namn**: "Sandvikens Kommun Assistent" (inte explicit namngiven i prompten)
- **Tenant ID**: `fda40f49-f0bf-47eb-b2dc-675e7385dc42` (Sandviken)
- **Organisation**: Sandvikens kommun

### Tonalitet & Stil
- **Tonalitet**: Vänlig och informativ (balans mellan professionell och tillgänglig)
- **Hälsningsstil**: **INGEN hälsning** - börjar direkt på sak
  - Explicit regel: "Svara direkt på frågan på svenska utan att börja med hälsningar som 'Hej' eller liknande"
  - Upprepar inte frågan heller
- **Språk**: Svenska
- **Stil**: 
  - Naturlig konversation
  - Hjälpsam och förstående
  - Ger gärna extra relevant information

### Följdfrågor
- **Används**: JA - aktivt uppmuntrat
- **Regler**:
  1. Avsluta gärna med följdfråga om användaren kan behöva mer hjälp
  2. Exempel-följdfrågor:
     - "Vill du veta mer om...?"
     - "Behöver du hjälp med något relaterat?"
     - "Har du fler frågor om...?"
  3. Vid bristande kontext: Ställ preciserande frågor för att förstå behov
  4. **Intelligent uppföljning**: Om användaren svarar "ja", "ok", "gärna" → kolla tidigare konversation och ge mer detaljer om det ämnet

### Korta svar-hantering
- **Specialfall**: "ja", "nej", "ok", "gärna", "kanske", "inte", "visst", "absolut"
- **Logik**: 
  ```javascript
  const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);
  ```
- **Beteende**: Återanvänd kategori från tidigare fråga och ge utförligt svar

### Max svarslängd
- **Begränsning**: Ingen explicit max-längd
- **Model max tokens**: Standard för gpt-4o-mini (ej explicit satt)

### Kontakt/Fallback
- **Vid saknad information**: 
  - Säger INTE bara "Jag hittar inte det i källorna"
  - Ställer preciserande frågor istället
  - Exempel:
    - Bygglov: "Vad är det du tänker söka bygglov för? En altan, öppen spis, carport eller något annat?"
    - Tider: "För att ge dig en exakt tid behöver jag veta mer om ditt specifika ärende."
    - Kostnader: "Kostnaden varierar beroende på vad det gäller. Kan du specificera?"
- **Ingen telefon/email**: Inte explicit i prompten (kan läggas till)

### Anpassade instruktioner
1. **INGEN URL:er i svar** - visas separat i källista
2. **Konversationshistorik-medveten** - använder tidigare utbyten för sammanhang
3. **Kategori-medveten** - förstår vilken typ av fråga det är (bygglov, omsorg, etc)

---

## 3. RAG-parametrar

### OpenAI Model Settings
```javascript
{
  model: 'gpt-4o-mini',
  temperature: 0.5,
  // max_tokens: inte explicit satt (använder default)
}
```

### Embedding Model
```javascript
{
  model: 'text-embedding-3-small',
  dimensions: 1536
}
```

### Retrieval Parameters
```javascript
{
  match_threshold: 0.35,        // Similarity threshold (cosine similarity)
  match_count: 5,               // Top K chunks
  tenant_id_param: TENANT_ID,   // Multi-tenant isolation
  filter_category: detectedCategory || null  // Auto-detected category
}
```

### Chunking Configuration
```javascript
{
  size: 1200,          // Characters per chunk
  overlap: 150,        // Character overlap between chunks
  algorithm: 'sliding_window'
}
```

**Kod location:** `embed-v2.js`, rad 31-41
```javascript
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
```

### Vector Search
- **Index type**: IVFFlat (pgvector)
- **Distance metric**: Cosine similarity (`vector_cosine_ops`)
- **Lists parameter**: 100

---

## 4. Kategori-hantering

### Kategorier (7 st)

1. **Bygga, bo och miljö**
2. **Omsorg och stöd**
3. **Utbildning och förskola**
4. **Kultur och fritid**
5. **Trafik och infrastruktur**
6. **Näringsliv och arbete**
7. **Kommun och politik**
8. **Övrigt** (fallback)

### Kategori-detektion

**Metod**: Keyword matching (regex)  
**Kod location:** `api/search-v2.js` rad 18-55, `server.js` rad 36-73

```javascript
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
```

### Keywords per kategori

| Kategori | Keywords |
|----------|----------|
| **Bygga, bo och miljö** | bygglov, ritning, bygga, hus, villa, altan, inglasning, tillbyggnad, fasad, carport, garage, attefallshus |
| **Omsorg och stöd** | hemtjänst, äldreomsorg, omsorg, stöd, personlig assistent, funktionsnedsättning, lss, boende, vård |
| **Utbildning och förskola** | skola, förskola, fritids, grundskola, gymnasium, utbildning, elev, lärare, pedagogisk |
| **Kultur och fritid** | kultur, bibliotek, idrott, fritid, museum, teater, konsert, sport, aktivitet |
| **Trafik och infrastruktur** | trafik, parkering, väg, gata, snöröjning, vinter, cykel, gång, infart, parkerings |
| **Näringsliv och arbete** | företag, näringsliv, tillstånd, serveringstillstånd, etablera, starta företag, jobb, arbete |
| **Kommun och politik** | kommun, politik, nämnd, styrelse, fullmäktige, kontakt, kommun |

### Kategori-återanvändning vid uppföljning

**Intelligent logik:**
```javascript
const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);

if (isShortFollowUp && chatHistory.length > 0) {
  // Återanvänd kategori från tidigare fråga
  const lastRealQuestion = chatHistory.filter(h => h.type === 'question' && h.text.length > 10).pop();
  if (lastRealQuestion) {
    detectedCategory = detectCategoryFromQuery(lastRealQuestion.text);
  }
}
```

### Kategori-specifika följdfrågor
**Används INTE explicit** - samma prompt för alla kategorier. Följdfrågor genereras av AI baserat på kontext.

---

## 5. Konversations-historik

### Historik-längd
- **Max utbyten**: Ingen explicit begränsning i koden
- **I praktiken**: Frontend skickar alla tidigare meddelanden
- **Rekommendation**: Begränsa till senaste 5-10 utbyten för att hålla prompt-längd nere

### Context-format

**Format i prompt:**
```
=== TIDIGARE KONVERSATION ===
Användare: {fråga 1}
Assistent: {svar 1}
Användare: {fråga 2}
Assistent: {svar 2}
=== SLUT PÅ TIDIGARE KONVERSATION ===
```

**Kod:**
```javascript
const conversationContext = chatHistory
  .filter(h => h.type === 'question' || h.type === 'answer')
  .map(h => {
    if (h.type === 'question') return `Användare: ${h.text}`;
    if (h.type === 'answer') return `Assistent: ${h.text}`;
    return '';
  })
  .join('\n');
```

**Location:** `api/search-v2.js` rad 171-178, `server.js` rad 146-153

### Historik inkluderas när
- Historik finns tillgänglig från frontend (`req.query.history`)
- Läggs FÖRE kontexten från chunks
- Används för att förstå korta uppföljningar ("ja", "ok", etc)

---

## 6. Källhantering

### Källor visas med
```javascript
{
  url: string,
  title: string,
  category: string
}
```

### Deduplicering
**Metod:** Map med URL som key
```javascript
const sourceMap = new Map();
// ...
sourceMap.set(page.url, { title: page.title, category: cat });
```

**Resultat:** Endast unika URL:er returneras

### Metadata som returneras

```javascript
{
  answer: string,
  sources: [
    { url, title, category }
  ],
  metadata: {
    version: 'v2',
    detected_category: string | null,
    chunks_found: number,
    response_time_ms: number,
    session_id: string,
    query_id: number  // För feedback
  }
}
```

### Similarity scores
- **Visas INTE** i frontend
- **Lagras** i databas-loggen
- **Används** för debugging och analys

---

## 7. Felhantering

### Inga chunks hittade
```javascript
if (!matches?.length) {
  return res.json({ 
    answer: 'Jag hittar inte det i källorna.', 
    sources: [] 
  });
}
```

**Alternativ (bättre):** I v2 används system prompt som hanterar detta genom att ställa preciserande frågor istället.

### API-fel (OpenAI)
```javascript
try {
  // API calls...
} catch (err) {
  console.error('Search v2 error:', err);
  res.status(500).json({ error: err.message });
}
```

**Status kod:** 500  
**Response:** `{ error: "error message" }`

### Timeout-hantering
**Explicit timeout:** Inte implementerad  
**OpenAI default timeout:** ~60s  
**Rekommendation:** Lägg till request timeout på 30s

### Logging vid fel
- **Non-blocking:** Logging-fel påverkar inte användarens svar
```javascript
const queryLog = await logQuery({...}).catch(err => {
  console.error('Logging failed (non-blocking):', err);
  return null;
});
```

---

## 8. Kod-exempel

### System Prompt-generering (Full)

```javascript
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
```

### RAG Pipeline (Komplett flöde)

```javascript
// 1. Parse query och historik
const q = req.query.q.trim();
const chatHistory = JSON.parse(req.query.history || '[]');

// 2. Detektera kategori (med follow-up logik)
const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);
let detectedCategory = null;

if (isShortFollowUp && chatHistory.length > 0) {
  const lastRealQuestion = chatHistory
    .filter(h => h.type === 'question' && h.text.length > 10)
    .pop();
  if (lastRealQuestion) {
    detectedCategory = detectCategoryFromQuery(lastRealQuestion.text);
  }
} else if (!isShortFollowUp) {
  detectedCategory = detectCategoryFromQuery(q);
}

// 3. Skapa embedding
const embeddingResponse = await openai.embeddings.create({
  model: 'text-embedding-3-small',
  input: q,
});
const queryEmbedding = embeddingResponse.data[0].embedding;

// 4. Hämta relevanta chunks (multi-tenant + kategorifilter)
const { data: chunks, error } = await supabase.rpc('match_chunks', {
  query_embedding: queryEmbedding,
  match_threshold: 0.35,
  match_count: 5,
  tenant_id_param: TENANT_ID,
  filter_category: detectedCategory,
});

// 5. Hämta source pages
const pageIds = [...new Set(chunks.map(c => c.page_id))];
const { data: pages } = await supabase
  .from('pages')
  .select('id, url, title')
  .eq('tenant_id', TENANT_ID)
  .in('id', pageIds);

// 6. Bygg kontext och källor
let context = '';
const sourceMap = new Map();
const categoryInfo = new Map();

chunks.forEach((chunk) => {
  context += chunk.content + '\n\n';
  if (chunk.category) {
    categoryInfo.set(chunk.page_id, chunk.category);
  }
});

pages.forEach((page) => {
  const cat = categoryInfo.get(page.id) || 'Okänd';
  sourceMap.set(page.url, { title: page.title, category: cat });
});

// 7. Bygg konversationskontext
const conversationContext = chatHistory
  .filter(h => h.type === 'question' || h.type === 'answer')
  .map(h => {
    if (h.type === 'question') return `Användare: ${h.text}`;
    if (h.type === 'answer') return `Assistent: ${h.text}`;
    return '';
  })
  .join('\n');

// 8. Generera svar med OpenAI
const completion = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  temperature: 0.5,
  messages: [
    {
      role: 'system',
      content: buildSystemPrompt(q, context, conversationContext)
    },
    {
      role: 'user',
      content: q,
    },
  ],
});

// 9. Returnera svar
const answer = completion.choices[0].message.content;
const sources = Array.from(sourceMap.entries()).map(([url, data]) => ({
  url,
  title: data.title,
  category: data.category,
}));

return {
  answer,
  sources,
  metadata: {
    version: 'v2',
    detected_category: detectedCategory,
    chunks_found: chunks.length,
    response_time_ms: responseTime,
    session_id: sessionId,
    query_id: queryLog?.id,
  }
};
```

### Följdfråge-logik (Kategori-återanvändning)

```javascript
// Detektera kort uppföljning
const isShortFollowUp = q.match(/^(ja|nej|ok|gärna|kanske|inte|visst|absolut)$/i);

if (isShortFollowUp && chatHistory.length > 0) {
  // Hitta senaste "riktiga" frågan (minst 10 tecken)
  const lastRealQuestion = chatHistory
    .filter(h => h.type === 'question' && h.text.length > 10)
    .pop();
  
  if (lastRealQuestion) {
    // Återanvänd kategori från den frågan
    detectedCategory = detectCategoryFromQuery(lastRealQuestion.text);
    console.log(`📌 Follow-up detected, reusing category from: "${lastRealQuestion.text}"`);
  }
} else if (!isShortFollowUp) {
  // Normal fråga: detektera kategori direkt
  detectedCategory = detectCategoryFromQuery(q);
}
```

### Kategori-detektion (Komplett)

```javascript
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
```

---

## 9. Environment Variables

```env
# OpenAI
OPENAI_API_KEY=sk-...
OPENAI_PROJECT_ID=proj_...

# Supabase
SUPABASE_URL=https://...supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJh...

# Multi-tenant
TENANT_ID=fda40f49-f0bf-47eb-b2dc-675e7385dc42

# Translation (Optional)
AZURE_TRANSLATOR_KEY=...
AZURE_TRANSLATOR_REGION=swedencentral
```

---

## 10. Sammanfattning för Admin System

### Konfigurerbara fält

**Agent Profil:**
- Tenant ID (UUID)
- Agent namn (för display)
- Organisation namn
- System prompt (full text)

**Beteende:**
- Använd hälsning (boolean) - för Sandviken: `false`
- Upprepa fråga (boolean) - för Sandviken: `false`
- Aktivera följdfrågor (boolean) - för Sandviken: `true`
- Tonalitet (dropdown) - för Sandviken: "Vänlig och informativ"

**RAG Parametrar:**
- Model (dropdown: gpt-4o-mini, gpt-4, etc) - Sandviken: `gpt-4o-mini`
- Temperature (slider: 0-1) - Sandviken: `0.5`
- Top K chunks (number: 1-10) - Sandviken: `5`
- Similarity threshold (slider: 0-1) - Sandviken: `0.35`
- Chunk size (number) - Sandviken: `1200`
- Chunk overlap (number) - Sandviken: `150`

**Kategorier:**
- Lista med kategorier + keywords (dynamisk array)
- Auto-detektering aktiverad (boolean)

**Konversation:**
- Max historik-längd (number) - Rekommendation: `5-10`
- Format för historik (text template)

**Feedback:**
- Aktivera feedback (boolean) - Sandviken: `true`
- Feedback-typ: Thumbs up/down

---

## 11. Teknisk Stack

- **Backend:** Node.js + Express (local) / Vercel Serverless (production)
- **Database:** Supabase (PostgreSQL + pgvector)
- **LLM:** OpenAI gpt-4o-mini
- **Embeddings:** OpenAI text-embedding-3-small
- **Frontend:** React + Vite
- **Vector Search:** pgvector (IVFFlat index)
- **Multi-tenancy:** UUID-based tenant isolation

---

## 12. Kopiering till nytt system

**Steg:**
1. Kopiera environment variables
2. Implementera `detectCategoryFromQuery()` med dina kategorier
3. Kopiera system prompt-template
4. Sätt RAG-parametrar enligt konfiguration
5. Implementera konversationshistorik-hantering
6. Skapa multi-tenant RPC-funktion i Supabase
7. Implementera feedback-endpoint

**Validering:**
- Testa kategori-detektion med sample queries
- Verifiera att korta uppföljningar fungerar ("ja", "ok")
- Kontrollera att källor dedupliceras korrekt
- Testa konversationsminne med 5+ utbyten

---

**Exporterad:** 2025-11-10  
**Tenant:** Sandviken (`fda40f49-f0bf-47eb-b2dc-675e7385dc42`)  
**Version:** Multi-tenant v2
