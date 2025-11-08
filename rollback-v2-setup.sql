-- ============================================================
-- ROLLBACK SUPABASE v2 DATABASE SETUP
-- Kör detta för att ta bort chunks_v2 och relaterade objekt
-- ============================================================

-- 1. Ta bort RPC-funktionen
DROP FUNCTION IF EXISTS match_chunks_v2(vector, INT, FLOAT, TEXT);

-- 2. Ta bort chunks_v2 tabell (indexes tas bort automatiskt)
DROP TABLE IF EXISTS chunks_v2 CASCADE;

-- OBS! Vi tar INTE bort pages-tabellen eftersom den kan innehålla data från v1

-- 3. Bekräftelse
DO $$
BEGIN
  RAISE NOTICE '✅ chunks_v2 tabell och match_chunks_v2 funktion har tagits bort!';
  RAISE NOTICE '📝 pages-tabellen finns kvar (innehåller eventuellt data)';
END $$;
