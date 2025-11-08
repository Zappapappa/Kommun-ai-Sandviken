# RAG v2 - Quick Start Guide

## TL;DR

```bash
# 1. Skapa databas (kör SQL i Supabase)
cat supabase-v2-setup.sql
# Kopiera och kör i Supabase SQL Editor

# 2. Test-kör (ingen skrivning)
node embed-v2.js

# 3. Kör skarpt
node embed-v2.js --run

# 4. Testa API lokalt
npm run dev
# I annan terminal:
node test-v2.js

# 5. Testa i produktion (när deployad)
export TEST_BASE_URL=https://sandviken-rag-2025.vercel.app
node test-v2.js
```

## Checklista för godkännande

- [ ] SQL-setup kördes utan fel
- [ ] Dry-run visar rätt kategorier
- [ ] Skarp körning slutförde utan fel
- [ ] `SELECT COUNT(*) FROM chunks_v2;` visar chunks
- [ ] Lokala tester passerar
- [ ] Produkt tester passerar (om deployad)
- [ ] Kategorier stämmer med URL-mappning
- [ ] Antal "Övrigt" är acceptabelt (<10%)

## När alla checkboxar är ikryssade

→ Se "Byta från v1 till v2" i README-v2.md

## Filöversikt

| Fil | Syfte |
|-----|-------|
| `embed-v2.js` | Reindexering med kategorier |
| `api/search-v2.js` | Ny search API med kategorifilter |
| `test-v2.js` | Automatiska tester |
| `supabase-v2-setup.sql` | Databas-setup |
| `README-v2.md` | Fullständig dokumentation |

## Vanliga kommandon

```bash
# Se statistik utan att skriva
node embed-v2.js

# Reindexera alla dokument
node embed-v2.js --run

# Testa sökning
node test-v2.js

# Manuell API-test
curl "http://localhost:5173/api/search-v2?q=Hur%20ansöker%20jag%20om%20bygglov&category=Bygga,%20bo%20och%20miljö"

# Kolla chunks i databas
# Kör i Supabase SQL Editor:
SELECT category, COUNT(*) FROM chunks_v2 GROUP BY category ORDER BY COUNT(*) DESC;
```
