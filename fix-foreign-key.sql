-- ============================================================
-- FIX FOREIGN KEY CONSTRAINT
-- document_chunks ska peka på pages, inte pages_sandviken_backup
-- ============================================================

-- 1. Ta bort felaktig foreign key constraint
ALTER TABLE document_chunks 
DROP CONSTRAINT IF EXISTS document_chunks_page_id_fkey;

-- 2. Lägg till korrekt foreign key constraint som pekar på pages
ALTER TABLE document_chunks 
ADD CONSTRAINT document_chunks_page_id_fkey 
FOREIGN KEY (page_id) 
REFERENCES pages(id) 
ON DELETE CASCADE;

-- 3. Verifiera att constraint är korrekt
SELECT 
  conname AS constraint_name,
  conrelid::regclass AS table_name,
  confrelid::regclass AS referenced_table
FROM pg_constraint
WHERE conname = 'document_chunks_page_id_fkey';

-- Förväntat resultat:
-- constraint_name: document_chunks_page_id_fkey
-- table_name: document_chunks
-- referenced_table: pages
