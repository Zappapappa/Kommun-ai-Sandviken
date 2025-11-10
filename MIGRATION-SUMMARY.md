# Migration till Multi-Tenant Schema - Sammanfattning

*Datum: 2025-11-10*

## Översikt

Alla Supabase-queries har uppdaterats från gamla single-tenant tabeller till nya multi-tenant strukturer.

---

## Databas-ändringar

### Gamla tabeller (backup)
- `pages` → `pages_sandviken_backup`
- `chunks_v2` → `chunks_v2_sandviken_backup`

### Nya multi-tenant tabeller
- `pages` (med `tenant_id` UUID kolumn)
- `document_chunks` (ersätter `chunks_v2`, med `tenant_id`)

### Funktion uppdaterad
- `match_chunks_v2()` → `match_chunks()`
- Ny parameter: `tenant_id_param UUID` (obligatorisk)

---

## Kod-ändringar

### Tenant ID konstant

Alla filer fick denna konstant tillagd högst upp:

```javascript
const TENANT_ID = process.env.TENANT_ID || 'fda40f49-f0bf-47eb-b2dc-675e7385dc42';
```

### Filer som uppdaterades

#### 1. `server.js`
**Ändringar:**
- Lagt till `TENANT_ID` konstant
- `/api/search-v2` endpoint:
  - `match_chunks_v2` → `match_chunks`
  - Lagt till `tenant_id_param: TENANT_ID`
  - `similarity_threshold` → `match_threshold`
  - Pages query: `.eq('tenant_id', TENANT_ID)`
- `/search` endpoint:
  - Samma ändringar som ovan
  - `match_count` och `match_threshold` parametrar uppdaterade

**Före:**
```javascript
const { data: chunks } = await supabase.rpc('match_chunks_v2', {
  query_embedding: queryEmbedding,
  match_count: 5,
  similarity_threshold: 0.35,
  filter_category: detectedCategory,
});

const { data: pages } = await supabase
  .from('pages')
  .select('id, url, title')
  .in('id', pageIds);
```

**Efter:**
```javascript
const { data: chunks } = await supabase.rpc('match_chunks', {
  query_embedding: queryEmbedding,
  match_threshold: 0.35,
  match_count: 5,
  tenant_id_param: TENANT_ID,
  filter_category: detectedCategory,
});

const { data: pages } = await supabase
  .from('pages')
  .select('id, url, title')
  .eq('tenant_id', TENANT_ID)
  .in('id', pageIds);
```

---

#### 2. `api/search-v2.js`
**Ändringar:**
- Lagt till `TENANT_ID` konstant
- Samma RPC och query-uppdateringar som server.js
- Loggar nu med `tenantId: TENANT_ID` istället för att läsa från env varje gång

---

#### 3. `embed-v2.js`
**Ändringar:**
- Lagt till `TENANT_ID` konstant
- `chunks_v2` → `document_chunks` i alla queries
- Delete query: 
  ```javascript
  .delete()
  .eq('tenant_id', TENANT_ID)
  .eq('page_id', page.id)
  ```
- Insert med `tenant_id` i varje rad:
  ```javascript
  const rows = chunks.map((content, idx) => ({
    tenant_id: TENANT_ID,
    page_id: page.id,
    content,
    embedding: vectors[idx],
    chunk_index: idx,
    category,
  }));
  ```
- Pages query: `.eq('tenant_id', TENANT_ID)`
- Konsolmeddelanden uppdaterade: "chunks_v2" → "document_chunks"

---

#### 4. `ingest.js`
**Ändringar:**
- Lagt till `TENANT_ID` konstant
- upsertPage funktion:
  - Läser från pages med `.eq('tenant_id', TENANT_ID)`
  - Lägger till `tenant_id: TENANT_ID` i upsert-raden:
    ```javascript
    const rowWithTenant = { ...row, tenant_id: TENANT_ID };
    const { error } = await supabase.from("pages").upsert(rowWithTenant);
    ```

---

#### 5. `test-chunks-v2.js`
**Ändringar:**
- Lagt till `TENANT_ID` konstant
- Alla queries från `chunks_v2` → `document_chunks`
- Alla queries filtrerar på `.eq('tenant_id', TENANT_ID)`
- RPC-anrop uppdaterade till `match_chunks` med `tenant_id_param`
- Konsolmeddelanden uppdaterade för multi-tenant

---

## Parameter-ändringar i match_chunks RPC

### Gamla parametrar (match_chunks_v2)
```javascript
{
  query_embedding: vector(1536),
  match_count: int,
  similarity_threshold: float,
  filter_category: text | null
}
```

### Nya parametrar (match_chunks)
```javascript
{
  query_embedding: vector(1536),
  match_threshold: float,           // Renamed från similarity_threshold
  match_count: int,
  tenant_id_param: uuid,             // NYTTillagt (obligatorisk)
  filter_category: text | null
}
```

**Observera ordningsändring:** `match_threshold` kommer nu före `match_count`!

---

## Miljövariabel

Alla filer använder nu:
```javascript
const TENANT_ID = process.env.TENANT_ID || 'fda40f49-f0bf-47eb-b2dc-675e7385dc42';
```

**Sandviken tenant_id:** `fda40f49-f0bf-47eb-b2dc-675e7385dc42`

Denna läses från `.env`:
```
TENANT_ID=fda40f49-f0bf-47eb-b2dc-675e7385dc42
```

---

## Verifiering

✅ **Build status:** Lyckades (npm run build)  
✅ **Syntax errors:** Inga  
✅ **Lint errors:** Inga (redeclare-varningar fixade med global konstant)

---

## Nästa steg

1. **Kör migrering lokalt:**
   ```bash
   # Hämta sidor (skriver till pages med tenant_id)
   node ingest.js
   
   # Generera chunks (skriver till document_chunks med tenant_id)
   node embed-v2.js --run
   
   # Testa sökning
   node test-chunks-v2.js
   ```

2. **Starta server:**
   ```bash
   npm run build
   node server.js
   ```

3. **Verifiera i browser:**
   - Testa sökning: http://localhost:3000
   - Kolla att källor visas
   - Testa feedback (thumbs up/down)

4. **Deploy till Vercel:**
   - Säkerställ att `TENANT_ID` finns i Vercel environment variables
   - Push till git → automatisk deployment
   - Testa på production URL

---

## Viktiga notes

⚠️ **Alla queries MÅSTE nu inkludera tenant_id:**
- Vid sökning i `pages`: `.eq('tenant_id', TENANT_ID)`
- Vid sökning i `document_chunks`: `.eq('tenant_id', TENANT_ID)`
- Vid RPC `match_chunks`: `tenant_id_param: TENANT_ID`

⚠️ **Gamla funktioner fungerar inte längre:**
- `match_chunks_v2` existerar inte
- `chunks_v2` tabellen är borta (backad upp)

✅ **Backup finns:**
- Gammal data finns i `*_sandviken_backup` tabeller
- Kan återställas vid behov

---

## Filer som INTE ändrades

Dessa filer refererar till gamla strukturer men används troligen inte i produktion:
- `create-chunks-v2.js` (SQL setup-script)
- `create-table-via-api.js` (SQL setup-script)

Om dessa behövs kan de uppdateras separat.

---

## Sammanfattning

Alla produktionsfiler (`server.js`, `api/search-v2.js`, `ingest.js`, `embed-v2.js`) är nu helt multi-tenant-kompatibla med Sandvikens tenant_id.

**Testfil** (`test-chunks-v2.js`) uppdaterad för att verifiera multi-tenant sökning.

**Rapport** (`RAG-TEKNISK-RAPPORT.md`) uppdaterad med korrekt schema och funktionsnamn.
