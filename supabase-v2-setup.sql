-- ============================================================
-- SUPABASE v2 DATABASE SETUP
-- Kör detta i Supabase SQL Editor
-- ============================================================

-- 0. Aktivera pgvector extension (borde redan vara aktiverad, men säkert är säkert)
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Skapa pages tabell om den inte finns (för inmatad data)
CREATE TABLE IF NOT EXISTS pages (
  id BIGSERIAL PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Skapa chunks_v2 tabell (samma struktur som chunks, men med category)
CREATE TABLE IF NOT EXISTS chunks_v2 (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_order INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Övrigt',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Index för snabbare sökning
CREATE INDEX IF NOT EXISTS idx_chunks_v2_page_id ON chunks_v2(page_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_category ON chunks_v2(category);

-- 4. Vector index för similarity search (ivfflat är snabbare än hnsw för mindre datasets)
CREATE INDEX IF NOT EXISTS idx_chunks_v2_embedding ON chunks_v2 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- 5. RPC-funktion för similarity search med kategorifilter
CREATE OR REPLACE FUNCTION match_chunks_v2(
  query_embedding vector(1536),
  match_count INT DEFAULT 5,
  similarity_threshold FLOAT DEFAULT 0.35,
  filter_category TEXT DEFAULT NULL
)
RETURNS TABLE (
  id BIGINT,
  page_id BIGINT,
  content TEXT,
  category TEXT,
  chunk_order INT,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.page_id,
    c.content,
    c.category,
    c.chunk_order,
    1 - (c.embedding <=> query_embedding) AS similarity
  FROM chunks_v2 c
  WHERE 
    1 - (c.embedding <=> query_embedding) > similarity_threshold
    AND (filter_category IS NULL OR c.category = filter_category)
  ORDER BY c.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 6. Grant permissions (om du använder RLS)
-- ALTER TABLE chunks_v2 ENABLE ROW LEVEL SECURITY;
-- Om du vill tillåta anonym läsning, lägg till policy här

-- 7. Bekräftelse
DO $$
BEGIN
  RAISE NOTICE 'chunks_v2 tabell och match_chunks_v2 RPC-funktion skapade!';
  RAISE NOTICE 'Kör nu: node embed-v2.js --dry för att testa reindexering';
END $$;
