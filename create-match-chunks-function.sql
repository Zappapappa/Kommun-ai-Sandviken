-- ============================================================
-- CREATE match_chunks RPC FUNCTION (MULTI-TENANT)
-- För att söka chunks med similarity threshold och kategorifilter
-- ============================================================

-- 1. Ta bort gamla funktionen först
DROP FUNCTION IF EXISTS match_chunks(vector, double precision, integer, uuid, text);

-- 2. Skapa ny funktion med korrekt signatur
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

-- Verifiera att funktionen finns
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public' 
AND routine_name = 'match_chunks';

-- Förväntat resultat:
-- routine_name: match_chunks
-- routine_type: FUNCTION
