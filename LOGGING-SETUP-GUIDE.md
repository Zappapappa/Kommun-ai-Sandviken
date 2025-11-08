# Logging Implementation Guide

## ✅ Vad vi har gjort

1. **Skapat databastabeller**
   - `tenants` - För multi-tenant support
   - `query_logs` - Loggar varje AI-fråga med kostnader och prestanda
   - `daily_stats` - Aggregerad statistik för snabbare rapporter
   
2. **Lagt till logging-funktioner**
   - `lib/logging.js` - Hjälpfunktioner för att logga queries
   - Integrerat i både `api/search-v2.js` och `server.js`
   
3. **Uppdaterat .env**
   - Lagt till `IP_SALT` och `TENANT_ID` variabler

---

## 🚀 Installation (steg-för-steg)

### Steg 1: Kör SQL-migration i Supabase

1. Öppna Supabase Dashboard: https://supabase.com/dashboard
2. Välj ditt projekt: `jeyuyizfiqowqswcymfd`
3. Gå till **SQL Editor** i vänstermenyn
4. Öppna filen `supabase-logging-setup.sql` och kopiera hela innehållet
5. Klistra in i SQL Editor
6. Klicka **RUN** längst ner till höger

**VIKTIGT:** Efter migration, kör denna query för att hämta din API key:

```sql
SELECT 
  name,
  domain,
  api_key,
  id
FROM tenants 
WHERE domain = 'sandviken.se';
```

**Spara API key och tenant ID säkert!**

---

### Steg 2: Uppdatera .env filen

1. Öppna `.env` filen
2. Hitta de nya raderna längst ner:

```env
# Logging & Multi-tenant
IP_SALT=your_random_salt_here_change_this
TENANT_ID=will_be_set_after_sql_migration
```

3. Byt ut värdena:
   - `IP_SALT`: Generera ett random string (t.ex. `openssl rand -hex 32` i terminal)
   - `TENANT_ID`: UUID från SQL-queryn ovan (kolumn `id`)

**Exempel:**
```env
IP_SALT=8f3a9b2c5d7e1f4a6b8c9d0e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1
TENANT_ID=123e4567-e89b-12d3-a456-426614174000
```

4. Spara filen

---

### Steg 3: Installera dependencies (om nödvändigt)

```bash
npm install
```

---

### Steg 4: Testa lokalt

```bash
npm run server
```

Gör en test-query:
```bash
curl "http://localhost:3000/api/search-v2?q=Hur%20söker%20man%20bygglov?"
```

Du bör se i console:
```
✅ Response generated in 2341ms with 4 sources
✅ Logged query 1: $0.003215 (1234 tokens)
```

---

### Steg 5: Verifiera i Supabase

1. Gå till **Table Editor** i Supabase
2. Öppna `query_logs` tabellen
3. Du ska se din test-query loggad med:
   - Query text
   - Kostnad i USD
   - Token counts
   - Response time
   - Session ID
   - IP hash

**Success!** 🎉

---

## 📊 Vad loggas nu?

Varje gång någon ställer en fråga loggas:

### Query Data
- Frågetexten
- AI:ns svar
- Antal källor
- Detekterad kategori

### Kostnader
- Embedding tokens (från OpenAI)
- Prompt tokens (GPT-4o-mini input)
- Response tokens (GPT-4o-mini output)
- **Total kostnad i USD** (beräknat enligt aktuella priser)

### Prestanda
- Svarstid i millisekunder
- Antal chunks hittade
- Similarity threshold

### Användare (anonymiserat)
- Session ID (cookie-baserad)
- Språk (sv/en)
- Hashad IP-address (för abuse-detection)
- User agent

---

## 🔍 Vad kan vi göra med datan?

### Direkt i Supabase

**Se alla queries idag:**
```sql
SELECT 
  created_at,
  query_text,
  category,
  total_cost_usd,
  response_time_ms
FROM query_logs
WHERE DATE(created_at) = CURRENT_DATE
ORDER BY created_at DESC;
```

**Total kostnad denna månad:**
```sql
SELECT 
  COUNT(*) as total_queries,
  SUM(total_cost_usd) as total_cost,
  AVG(total_cost_usd) as avg_cost_per_query,
  AVG(response_time_ms) as avg_response_time
FROM query_logs
WHERE created_at >= DATE_TRUNC('month', CURRENT_DATE);
```

**Populäraste kategorier:**
```sql
SELECT 
  category,
  COUNT(*) as query_count,
  AVG(response_time_ms) as avg_time
FROM query_logs
WHERE category IS NOT NULL
GROUP BY category
ORDER BY query_count DESC;
```

**Kostnad per dag senaste veckan:**
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as queries,
  SUM(total_cost_usd) as cost,
  AVG(response_time_ms) as avg_time
FROM query_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

## 🎯 Nästa steg

Nu när loggning fungerar kan du:

1. **Testa i produktion**
   - Commita ändringarna
   - Pusha till GitHub
   - Vercel deployer automatiskt
   - Uppdatera TENANT_ID och IP_SALT i Vercel Environment Variables

2. **Verifiera data**
   - Använd widgeten på vercel-urlen
   - Kolla att queries loggas i Supabase

3. **Börja bygga Admin Dashboard**
   - Nästa fas: Skapa `kommun-ai-admin` Next.js projekt
   - Bygga dashboards för att visualisera datan
   - Real-time monitoring

---

## 🔒 Säkerhet

- ✅ IP-addresser hashas (inte sparade i klartext)
- ✅ Inga personuppgifter loggas
- ✅ Session IDs är anonyma cookies
- ✅ RLS (Row Level Security) aktiverat
- ✅ Service key används endast på backend

---

## 📝 Environment Variables Checklist

Before deploying to Vercel, make sure you have:

**Existing:**
- ✅ OPENAI_API_KEY
- ✅ OPENAI_PROJECT_ID
- ✅ SUPABASE_URL
- ✅ SUPABASE_SERVICE_ROLE_KEY
- ✅ AZURE_SPEECH_KEY
- ✅ AZURE_SPEECH_REGION
- ✅ AZURE_TRANSLATOR_KEY
- ✅ AZURE_TRANSLATOR_REGION

**New:**
- ⚠️ IP_SALT (generate with `openssl rand -hex 32`)
- ⚠️ TENANT_ID (från Supabase efter migration)

---

## ❓ Troubleshooting

**Fel: "relation query_logs does not exist"**
- Du har inte kört SQL-migrationen i Supabase
- Lösning: Kör `supabase-logging-setup.sql` i SQL Editor

**Fel: "Logging failed: invalid input syntax for type uuid"**
- TENANT_ID är inte satt eller fel format
- Lösning: Kolla att TENANT_ID är en giltig UUID från tenants-tabellen

**Fel: "IP_SALT is not defined"**
- Glömde lägga till IP_SALT i .env
- Lösning: Lägg till i `.env` och starta om servern

**Queries loggas inte**
- Kolla console output - ska se "✅ Logged query X: $0.00XXXX"
- Om inte: Kolla att TENANT_ID och SUPABASE_SERVICE_ROLE_KEY är korrekta

---

## 🎉 Klart!

Nu loggas alla queries automatiskt och du kan börja bygga admin-dashboarden för att visualisera datan!

**Frågor?** Se över koden i `lib/logging.js` för att förstå hur det fungerar.
