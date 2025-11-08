# RAG v2 Implementation - Summary

## Vad har skapats?

### 1. Nya filer

| Fil | Beskrivning |
|-----|-------------|
| `embed-v2.js` | Reindexering med kategori-metadata |
| `api/search-v2.js` | Ny search API med kategorifilter |
| `test-v2.js` | Automatiska tester (10 testfrågor) |
| `supabase-v2-setup.sql` | SQL för databas-setup |
| `README-v2.md` | Fullständig dokumentation |
| `QUICKSTART-v2.md` | Snabbstartsguide |

### 2. Uppdaterade filer

| Fil | Ändring |
|-----|---------|
| `vercel.json` | Lade till `/api/search-v2` rewrite |

## Funktionalitet

### Kategori-mappning

URL-prefix automatiskt mappas till kategorier:

```
/utbildningochforskola/  → Utbildning och förskola
/omsorgochstod/          → Omsorg och stöd
/kulturochfritid/        → Kultur och fritid
/byggaboochmiljo/        → Bygga, bo och miljö
/trafikochinfrastruktur/ → Trafik och infrastruktur
/naringslivocharbete/    → Näringsliv och arbete
/kommunochpolitik/       → Kommun och politik
(övriga)                 → Övrigt
```

### Databas-struktur

**Ny tabell:** `chunks_v2`
- Samma struktur som `chunks`
- PLUS: `category TEXT NOT NULL DEFAULT 'Övrigt'`
- Index på category för snabb filtrering

**Ny RPC-funktion:** `match_chunks_v2()`
- Similarity search med pgvector
- PLUS: Optional `filter_category` parameter

### API-endpoints

**Ny endpoint:** `/api/search-v2`

Query parameters:
- `q` (required): Sökfråga
- `category` (optional): Kategorifilter

Response:
```json
{
  "answer": "...",
  "sources": [
    {
      "url": "...",
      "title": "...",
      "category": "Bygga, bo och miljö"
    }
  ],
  "metadata": {
    "version": "v2",
    "filtered_category": "Bygga, bo och miljö" | null,
    "chunks_found": 5
  }
}
```

## Nästa steg för dig

### 1. Kör databas-setup (MÅSTE göras först)

```bash
# Öppna Supabase Dashboard
# Gå till SQL Editor
# Kopiera innehållet från supabase-v2-setup.sql
# Kör queryn
```

### 2. Test-kör reindexering (DRY RUN)

```bash
node embed-v2.js
```

Detta visar:
- Totalt antal dokument (bör vara ~20)
- Fördelning per kategori
- Antal "Övrigt"

**Förväntat resultat:**
```
RAG v2 REINDEXERING (DRY RUN - INGEN SKRIVNING)
============================================================

📄 Totalt antal dokument att bearbeta: 20

🧩 Hur lång tid tar bygglov... → 3 chunks → Bygga, bo och miljö
🧩 Vad kostar bygglov... → 2 chunks → Bygga, bo och miljö
...

============================================================
SAMMANFATTNING
============================================================
✅ Totalt antal dokument: 20
✅ Bearbetade: 20
❌ Misslyckade: 0

📊 Antal per kategori:
   Bygga, bo och miljö            8
   Omsorg och stöd                4
   Kommun och politik             1
   Övrigt                         7
============================================================
```

### 3. Kör skarp reindexering

Om dry-run ser bra ut:

```bash
node embed-v2.js --run
```

**Tid:** Ca 2-3 minuter (beroende på antal dokument och OpenAI API-latens)

**Kostnad:** ~$0.03 för embeddings (engångskostnad)

### 4. Testa lokalt

```bash
# Terminal 1: Starta dev server
npm run dev

# Terminal 2: Kör tester
node test-v2.js
```

**Förväntat resultat:**
10 testfrågor körs, var och en visar:
- Svarstid (bör vara <2000ms)
- Antal chunks hittade (bör vara 1-5)
- Källor med kategori
- Preview av AI-svar

### 5. Deploya till Vercel (när du är redo)

```bash
git add .
git commit -m "Add: RAG v2 med kategoriserad sökning"
git push
```

**OBS:** Vercel deployment-limit (100/dag) - vänta tills limiten resettas

### 6. Testa i produktion (efter deploy)

```bash
export TEST_BASE_URL=https://sandviken-rag-2025.vercel.app
node test-v2.js
```

### 7. Godkänn och byt till v2 (när du är nöjd)

Se "Byta från v1 till v2" i `README-v2.md`

## Säkerhet & Rollback

✅ **Säkert:**
- Inget i produktion påverkas
- Gamla `chunks` tabellen finns kvar
- `/api/search` fungerar som vanligt
- Alla nya resurser har `_v2` suffix

🔄 **Rollback:**
- Radera bara de nya filerna
- Eller kör `DROP TABLE chunks_v2` i Supabase

## Support

Om problem uppstår:
1. Kontrollera logs från `embed-v2.js`
2. Verifiera SQL-setup kördes: `SELECT COUNT(*) FROM chunks_v2;`
3. Testa RPC-funktion: Se `README-v2.md` för SQL-query
4. Kontakta mig med felmeddelanden och logs

## Estimerad tid

- Databas-setup: 2 minuter
- Dry-run: 1 minut
- Skarp indexering: 3 minuter
- Lokala tester: 2 minuter
- Deploy & prod-test: 5 minuter

**Total: ~15 minuter**

## Frågor att svara på innan cutover

- [ ] Ser kategori-fördelningen rimlig ut?
- [ ] Är "Övrigt"-kategorin <10% av dokumenten?
- [ ] Fungerar kategorifilter som förväntat?
- [ ] Är svarstiderna acceptabla (<2s)?
- [ ] Är svars-kvaliteten likvärdig eller bättre än v1?

När alla är "Ja" → Gå vidare med cutover!
