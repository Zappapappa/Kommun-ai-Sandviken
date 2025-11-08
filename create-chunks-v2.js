import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🔧 Skapar chunks_v2 och match_chunks_v2 via SQL...\n');

const sql = `
-- Skapa chunks_v2 tabellen
CREATE TABLE IF NOT EXISTS chunks_v2 (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT REFERENCES pages(id) ON DELETE CASCADE,
  chunk_index INT NOT NULL,
  content TEXT NOT NULL,
  embedding vector(1536),
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Skapa index på embedding-kolumnen
CREATE INDEX IF NOT EXISTS chunks_v2_embedding_idx ON chunks_v2 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Skapa index på category
CREATE INDEX IF NOT EXISTS chunks_v2_category_idx ON chunks_v2(category);

-- Skapa match_chunks_v2 funktion
CREATE OR REPLACE FUNCTION match_chunks_v2(
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
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
    chunks_v2.id,
    chunks_v2.page_id,
    chunks_v2.content,
    1 - (chunks_v2.embedding <=> query_embedding) AS similarity,
    chunks_v2.category
  FROM chunks_v2
  WHERE 
    1 - (chunks_v2.embedding <=> query_embedding) > match_threshold
    AND (filter_category IS NULL OR chunks_v2.category = filter_category)
  ORDER BY similarity DESC
  LIMIT match_count;
$$;
`;

// Kör SQL via Supabase
const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

if (error) {
  console.log('❌ Kunde inte köra SQL via RPC. Prova istället via Supabase Dashboard > SQL Editor:');
  console.log('\n' + sql);
} else {
  console.log('✅ SQL kördes!');
  console.log('Data:', data);
}
