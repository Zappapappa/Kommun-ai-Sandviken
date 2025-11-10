# RAG-systemets tekniska specifikation
## Sandvikens Kommun AI-assistent

*Genererad: 2025-11-09*

---

## Sammanfattning

Detta dokument beskriver alla tekniska parametrar och inställningar som används i Sandvikens Kommuns RAG-baserade AI-assistent. Informationen är avsedd för att replikera samma beteende i ett administrativt gränssnitt där svar kan förhandsgranskas.

---

## 1. Crawling och inmatning

### 1.1 Crawling-process (`ingest.js`)

**Bibliotek:**
- `axios` - HTTP-förfrågningar
- `jsdom` - DOM-parsing
- `@mozilla/readability` - Rensa bort menyer, sidfötter och annat brus

**Process:**
1. Hämta HTML från varje URL
2. Parsa med JSDOM
3. Extrahera läsbar text med Readability (Mozilla)
4. Beräkna SHA1-hash av innehållet för att detektera ändringar
5. Upsert till `pages`-tabellen i Supabase

**Metadata som sparas:**
- `url` - Källans URL
- `title` - Sidans titel (från Readability eller URL som fallback)
- `content` - Rengjord textinnehåll
- `hash` - SHA1-checksumma för att undvika dubbelarbete

---

## 2. Chunkning och kategorisering

### 2.1 Chunking-strategi (`embed-v2.js`)

**Chunk-storlek och överlappning:**
```javascript
size = 1200       // Tecken per chunk
overlap = 150     // Tecken som överlappar mellan chunks
```

**Algoritm:**
- Sliding window med 1200 tecken per chunk
- 150 tecken överlappning mellan chunks för att bevara kontext
- Garanterar att ingen information förloras vid chunk-gränser

**Exempel:**
- Dokument på 3500 tecken → ca 3-4 chunks
- Överlappningen gör att viktiga meningar som ligger vid chunk-gränser inte bryts

### 2.2 Kategori-klassificering

**Automatisk kategorisering baserat på URL-mönster:**

| Kategori | URL-mönster |
|----------|-------------|
| Utbildning och förskola | `/utbildningochforskola/` |
| Omsorg och stöd | `/omsorgochstod/` |
| Kultur och fritid | `/kulturochfritid/` |
| Bygga, bo och miljö | `/byggaboochmiljo/` |
| Trafik och infrastruktur | `/trafikochinfrastruktur/` |
| Näringsliv och arbete | `/naringslivocharbete/` |
| Kommun och politik | `/kommunochpolitik/` |
| Övrigt | Allt annat |

**Funktion:** `getCategoryFromUrl(url)`

---

## 3. Embeddings och vektorlagring

### 3.1 Embedding-modell

**OpenAI-modell:**
```
text-embedding-3-small
```

**Dimensionalitet:**
- 1536 dimensioner
- Kostnadseffektiv och snabb
- Tillräcklig precision för semantisk sökning

### 3.2 Databas-schema (Supabase/PostgreSQL)

**Tabell: `document_chunks` (multi-tenant)**
```sql
CREATE TABLE IF NOT EXISTS document_chunks (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID NOT NULL,
  page_id BIGINT REFERENCES pages(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),      -- pgvector
  category TEXT,                -- Kategori från URL
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Index:**
```sql
-- IVFFlat-index för snabb cosine similarity-sökning
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Index på tenant + kategori för multi-tenant filtrering
CREATE INDEX IF NOT EXISTS document_chunks_tenant_idx ON document_chunks(tenant_id);
CREATE INDEX IF NOT EXISTS document_chunks_category_idx ON document_chunks(category);
CREATE INDEX IF NOT EXISTS document_chunks_tenant_category_idx ON document_chunks(tenant_id, category);
```

**Viktigt för multi-tenant:**
- Alla queries MÅSTE inkludera `tenant_id`
- Sandviken tenant_id: `fda40f49-f0bf-47eb-b2dc-675e7385dc42`

---

## 4. Sökning och retrieval

### 4.1 Retrieval-parametrar

**Antal chunks som hämtas:**
```javascript
match_count: 5
```

**Similarity threshold (cosine similarity):**
```javascript
similarity_threshold: 0.35
```

**Distance metric:**
- Cosine similarity (1 - cosine distance)
- Värden mellan 0 och 1, där 1 = identisk

### 4.2 Automatisk kategoridetektion vid sökning

**Sökning med kategorifilter:**

När en fråga ställs detekteras relevant kategori automatiskt baserat på nyckelord:

| Nyckelord i fråga | Detekterad kategori |
|-------------------|---------------------|
| bygglov, bygga, hus, villa, altan, tillbyggnad | Bygga, bo och miljö |
| hemtjänst, äldreomsorg, funktionsnedsättning | Omsorg och stöd |
| skola, förskola, utbildning | Utbildning och förskola |
| kultur, bibliotek, idrott, fritid | Kultur och fritid |
| trafik, parkering, väg, snöröjning | Trafik och infrastruktur |
| företag, näringsliv, tillstånd | Näringsliv och arbete |
| kommun, politik, nämnd, styrelse | Kommun och politik |

**Fallback:** Om ingen kategori detekteras söks i alla kategorier.

**Följdfrågor:** 
- Korta svar som "ja", "ok", "gärna" använder samma kategori som föregående fråga
- Bevarar kontext i konversationen

### 4.3 Sökfunktion (`match_chunks`)

**PostgreSQL-funktion (multi-tenant):**
```sql
CREATE OR REPLACE FUNCTION match_chunks(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  tenant_id_param uuid,
  filter_category text DEFAULT NULL
)
RETURNS TABLE (
  id bigint,
  page_id bigint,
  content text,
  similarity float,
  category text
)
LANGUAGE sql STABLE
AS $$
  SELECT
    document_chunks.id,
    document_chunks.page_id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity,
    document_chunks.category
  FROM document_chunks
  WHERE 
    document_chunks.tenant_id = tenant_id_param
    AND 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR document_chunks.category = filter_category)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
```

**SQL-logik:**
1. **Filtrera på tenant_id** (multi-tenant isolation)
2. Beräkna cosine similarity för alla chunks
3. Filtrera på threshold (0.35)
4. Filtrera på kategori (om angiven)
5. Sortera på similarity DESC
6. Returnera top 5

---

## 5. AI-modell och prompt

### 5.1 Generativ modell

**OpenAI-modell:**
```
gpt-4o-mini
```

**Temperatur:**
```javascript
temperature: 0.5
```

**Varför 0.5?**
- Balans mellan konsistens (0.0) och kreativitet (1.0)
- Tillräckligt naturlig ton
- Minimerar hallucinationer
- Ger varierade men faktabaserade svar

### 5.2 System-prompt (förkortad)

**Huvudinstruktioner:**
1. Svara på svenska utan hälsningar
2. Använd ENDAST information från kontexten
3. Vid saknad information: ställ preciserande frågor
4. Avsluta gärna med en följdfråga
5. Inkludera INTE URL:er i svaret (visas separat)

**Konversationskontext:**
- Tidigare frågor och svar inkluderas i prompten
- Format: "Användare: [fråga]" / "Assistent: [svar]"
- Max 5 senaste utbyten

**Kontextformat:**
```
=== KONTEXT START ===
[Chunk 1 innehåll]

[Chunk 2 innehåll]
...
=== KONTEXT SLUT ===
```

---

## 6. Response-metadata

**Metadata som returneras i varje svar:**

```javascript
{
  answer: string,              // Det genererade svaret
  sources: [                   // Källor som användes
    {
      url: string,
      title: string,
      category: string
    }
  ],
  metadata: {
    version: 'v2',
    detected_category: string | null,
    chunks_found: number,      // Antal chunks som matchade
    response_time_ms: number,  // Total responstid
    session_id: string,        // Session-UUID
    query_id: number          // För feedback-systemet
  }
}
```

---

## 7. Sammanfattning av alla parametrar

### För admin-preview

**Ingest-parametrar:**
- Chunk size: **1200 tecken**
- Chunk overlap: **150 tecken**
- Embedding model: **text-embedding-3-small**
- Vector dimensions: **1536**

**Retrieval-parametrar:**
- Top K chunks: **5**
- Similarity threshold: **0.35**
- Distance metric: **Cosine similarity**
- Category filter: **Automatisk eller null**
- **Tenant ID: `fda40f49-f0bf-47eb-b2dc-675e7385dc42`** (Sandviken)

**Generation-parametrar:**
- Model: **gpt-4o-mini**
- Temperature: **0.5**
- Max conversation history: **5 senaste utbyten**

**Prompt-struktur:**
1. System-instruktioner (hjälpsam, svensk, faktabaserad)
2. Konversationshistorik (om finns)
3. Kontext från top 5 chunks
4. Användarens fråga

---

## 8. Exempel-flöde

**Användarfråga:** "Hur lång tid tar bygglov?"

1. **Embedding**: Frågan konverteras till 1536-dimensionell vektor
2. **Kategoridetektering**: "bygglov" → kategori "Bygga, bo och miljö"
3. **Tenant isolation**: Använd tenant_id `fda40f49-f0bf-47eb-b2dc-675e7385dc42`
4. **Retrieval**: Anropa `match_chunks()` med tenant_id och kategorifilter
5. **Ranking**: Hittar 5 chunks med similarity > 0.35
6. **Context building**: Kombinera chunk-innehåll till en kontext
7. **Generation**: gpt-4o-mini genererar svar baserat på kontext
8. **Response**: Returnera svar + källor + metadata

**Förväntad responstid:** 2000-6000ms beroende på API-latens

---

## 9. Implementation i admin-gränssnitt

### Rekommenderad preview-funktion

```javascript
async function previewRAGResponse(query, options = {}) {
  const {
    topK = 5,
    threshold = 0.35,
    temperature = 0.5,
    model = 'gpt-4o-mini',
    category = null,
    tenantId = 'fda40f49-f0bf-47eb-b2dc-675e7385dc42', // Sandviken
    conversationHistory = []
  } = options;

  // 1. Create embedding
  const embedding = await createEmbedding(query);

  // 2. Search chunks (multi-tenant)
  const { data: chunks } = await supabase.rpc('match_chunks', {
    query_embedding: embedding,
    match_threshold: threshold,
    match_count: topK,
    tenant_id_param: tenantId,
    filter_category: category
  });

  // 3. Build context
  const context = chunks.map(c => c.content).join('\n\n');

  // 4. Build conversation context
  const convContext = conversationHistory
    .map(h => `${h.role === 'user' ? 'Användare' : 'Assistent'}: ${h.text}`)
    .join('\n');

  // 5. Generate response
  const response = await generateResponse({
    model,
    temperature,
    query,
    context,
    conversationContext: convContext
  });

  return {
    answer: response,
    chunks,
    metadata: {
      chunks_found: chunks.length,
      category_filter: category,
      tenant_id: tenantId,
      model,
      temperature
    }
  };
}
```

### UI-rekommendationer för preview

**Parameterkontroller:**
- Slider för Top K (1-10, default: 5)
- Slider för Similarity threshold (0.0-1.0, default: 0.35)
- Slider för Temperature (0.0-1.0, default: 0.5)
- Dropdown för Category filter
- Checkbox för "Use conversation history"

**Resultatvisning:**
- Genererat svar
- Lista med matchade chunks (med similarity score)
- Källor med kategori
- Metadata (antal chunks, responstid)

---

## 10. Viktiga observationer

**Vad som fungerar bra:**
- ✅ 1200/150 chunking ger bra balans mellan kontext och precision
- ✅ 0.35 threshold filtrerar bort irrelevanta chunks
- ✅ 5 chunks ger tillräcklig kontext utan att överbelasta prompten
- ✅ Automatisk kategoridetektion förbättrar precision
- ✅ Temperature 0.5 ger naturliga men faktabaserade svar

**Rekommenderade justeringar för olika use cases:**
- **Högre precision, färre hallucinationer:** Höj threshold till 0.40-0.45
- **Bredare täckning, risk för irrelevans:** Sänk threshold till 0.30
- **Kortare svar:** Reducera top K till 3
- **Djupare svar:** Öka top K till 7-8
- **Mer kreativa svar:** Höj temperature till 0.7
- **Mer faktabaserade svar:** Sänk temperature till 0.3

---

## Kontakt

För frågor om denna implementation, kontakta utvecklingsteamet.

**Repository:** Kommun-ai-Sandviken  
**Branch:** main  
**Version:** Multi-tenant (document_chunks + match_chunks)  
**Tenant ID (Sandviken):** `fda40f49-f0bf-47eb-b2dc-675e7385dc42`
