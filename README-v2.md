# RAG v2 - Kategoriserad sökning

## Översikt

Detta är ett parallellt RAG-system (v2) som lägger till kategori-metadata till alla dokument baserat på deras URL-struktur. Det befintliga systemet (v1) påverkas inte.

## Kategorier

Dokument kategoriseras automatiskt baserat på URL:

| URL-prefix | Kategori |
|------------|----------|
| `/utbildningochforskola/` | Utbildning och förskola |
| `/omsorgochstod/` | Omsorg och stöd |
| `/kulturochfritid/` | Kultur och fritid |
| `/byggaboochmiljo/` | Bygga, bo och miljö |
| `/trafikochinfrastruktur/` | Trafik och infrastruktur |
| `/naringslivocharbete/` | Näringsliv och arbete |
| `/kommunochpolitik/` | Kommun och politik |
| (övriga) | Övrigt |

## Installation

### 1. Skapa databas-struktur i Supabase

Kör SQL-filen i Supabase SQL Editor:

```bash
# Kopiera innehållet från supabase-v2-setup.sql
# Klistra in i Supabase > SQL Editor > New query
# Kör queryn
```

Detta skapar:
- `chunks_v2` tabell med category-kolumn
- Index för snabb sökning
- `match_chunks_v2()` RPC-funktion med kategorifilter

### 2. Reindexera dokument (DRY RUN först)

```bash
# Torrkörning (visar vad som skulle hända, skriver inget)
node embed-v2.js

# Eller explicit:
node embed-v2.js --dry
```

Output visar:
- Totalt antal dokument
- Antal per kategori
- Antal "Övrigt"

### 3. Kör skarp reindexering

När dry-run ser bra ut:

```bash
node embed-v2.js --run
```

Detta:
- Läser alla dokument från `pages` tabellen
- Skapar embeddings (samma som v1)
- Sparar i `chunks_v2` med category-metadata
- Loggar statistik per kategori

**Obs:** OpenAI API-kostnad för embeddings tillkommer (ca $0.0001/1k tokens).

## Test av Search v2

### Lokal testning

```bash
# Starta dev server
npm run dev

# I en annan terminal, kör tester
node test-v2.js
```

### Test i produktion

```bash
# Sätt miljövariabel först
export TEST_BASE_URL=https://sandviken-rag-2025.vercel.app

# Kör tester
node test-v2.js
```

Test-scriptet kör 10 testfrågor och visar:
- Svarstid
- Antal chunks hittade
- Källor med kategori
- Preview av AI-svar

### Manuell testning av API

**Utan kategorifilter:**
```bash
curl "https://sandviken-rag-2025.vercel.app/api/search-v2?q=Hur%20ansöker%20jag%20om%20bygglov"
```

**Med kategorifilter:**
```bash
curl "https://sandviken-rag-2025.vercel.app/api/search-v2?q=Hur%20lång%20tid%20tar%20bygglov&category=Bygga,%20bo%20och%20miljö"
```

Response innehåller:
```json
{
  "answer": "...",
  "sources": [
    {
      "url": "https://...",
      "title": "...",
      "category": "Bygga, bo och miljö"
    }
  ],
  "metadata": {
    "version": "v2",
    "filtered_category": "Bygga, bo och miljö",
    "chunks_found": 5
  }
}
```

## Byta från v1 till v2 (när godkänt)

### Steg 1: Verifiera v2

1. Kör `node test-v2.js` och kontrollera resultat
2. Testa `/api/search-v2` manuellt med flera frågor
3. Kontrollera att kategorier är korrekta

### Steg 2: Uppdatera frontend (om kategorifilter önskas)

Lägg till kategoriväljare i `SearchWidget.jsx`:

```javascript
// Exempel på hur man kan lägga till kategorifilter
const [selectedCategory, setSelectedCategory] = useState(null);

// I API-anrop:
const categoryParam = selectedCategory ? `&category=${encodeURIComponent(selectedCategory)}` : '';
const url = `/api/search?q=${encodeURIComponent(query)}${categoryParam}`;
```

### Steg 3: Byt backend

**Alternativ A: Soft cutover (rekommenderas)**

1. Byt namn på filer:
```bash
mv api/search.js api/search-v1-backup.js
mv api/search-v2.js api/search.js
```

2. Uppdatera RPC-anrop i `api/search.js`:
```javascript
// Byt från:
supabase.rpc('match_chunks', ...)

// Till:
supabase.rpc('match_chunks_v2', ...)
```

3. Deploya till Vercel
4. Testa i produktion
5. Om problem: rulla tillbaka genom att byta tillbaka filerna

**Alternativ B: Hard cutover**

1. Radera gamla tabellen (VARNING - permanent!)
```sql
DROP TABLE chunks; -- OBS: Ta backup först!
ALTER TABLE chunks_v2 RENAME TO chunks;
```

2. Döp om RPC-funktionen:
```sql
DROP FUNCTION match_chunks;
ALTER FUNCTION match_chunks_v2 RENAME TO match_chunks;
```

3. Ingen kodändring behövs

### Steg 4: Cleanup (efter v2 är verifierad i produktion)

Om v2 fungerar perfekt i 1-2 veckor:

```sql
-- Ta bort gamla chunks (om du körde Alternativ A)
DROP TABLE IF EXISTS chunks;
DROP FUNCTION IF EXISTS match_chunks;
```

## Kostnad

**Reindexering (engångskostnad):**
- ~20 dokument @ 1200 tecken/chunk = ~200 chunks
- OpenAI embedding: $0.00013/1k tokens
- Estimerad kostnad: ~$0.03

**Löpande:**
- Ingen extra kostnad vs v1
- Samma antal API-anrop till OpenAI

## Rollback-plan

Om problem uppstår med v2:

1. **Soft rollback (om du använde Alternativ A):**
```bash
mv api/search.js api/search-v2-broken.js
mv api/search-v1-backup.js api/search.js
git push
```

2. **Hard rollback (om du använde Alternativ B):**
- Kör `embed.js` igen för att återskapa gamla `chunks` tabellen
- Återställ från Supabase backup

## Säkerhet

- Samma säkerhetsnivå som v1
- `chunks_v2` tabellen har samma behörigheter som `chunks`
- Ingen ny exponering av känslig data
- Category-metadata är offentlig information (från URL:er)

## Underhåll

### Lägga till nya dokument

När nya sidor läggs till i `pages` (via `ingest.js`):

```bash
# Kör embed-v2 igen för att uppdatera chunks_v2
node embed-v2.js --run
```

### Uppdatera kategori-mappning

Editera `getCategoryFromUrl()` i `embed-v2.js`:

```javascript
function getCategoryFromUrl(url) {
  // Lägg till nya kategorier här
  if (url.includes('/nyakategori/')) return 'Ny kategori';
  // ...
}
```

Kör sedan reindexering igen.

## Felsökning

### "RPC function match_chunks_v2 not found"

Kör SQL-setup igen: `supabase-v2-setup.sql`

### "relation chunks_v2 does not exist"

Tabellen skapades inte. Kör SQL-setup.

### Inga resultat returneras

Kontrollera:
1. `similarity_threshold` i RPC-anrop (prova sänka från 0.35 till 0.25)
2. Att embeddings skapades korrekt: `SELECT COUNT(*) FROM chunks_v2;`
3. Att category-filter matchar exakt (case-sensitive!)

### Kategorier är fel

Kör om reindexering efter att ha uppdaterat `getCategoryFromUrl()`.

## Support

Vid problem, kontakta utvecklingsteamet med:
- Felmeddelande
- Vilken operation som kördes
- Loggar från `embed-v2.js` eller `test-v2.js`
