import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('\n🔧 Skapar chunks_v2 tabell via Supabase API...\n');

// Försök skapa tabellen direkt
const createTableSQL = `
-- Skapa chunks_v2 tabell
CREATE TABLE IF NOT EXISTS chunks_v2 (
  id BIGSERIAL PRIMARY KEY,
  page_id BIGINT NOT NULL REFERENCES pages(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  embedding vector(1536),
  chunk_order INT NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'Övrigt',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX IF NOT EXISTS idx_chunks_v2_page_id ON chunks_v2(page_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_category ON chunks_v2(category);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_embedding ON chunks_v2 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
`;

console.log('SQL som ska köras:');
console.log(createTableSQL);
console.log('\n⚠️  Detta script kan inte köra SQL direkt via JS-klienten.');
console.log('⚠️  Du måste köra SQL-filen i Supabase Dashboard SQL Editor.\n');
console.log('📋 Steg:');
console.log('1. Gå till: https://supabase.com/dashboard/project/jeyuyizfiqowqswcymfd/sql/new');
console.log('2. Öppna filen: supabase-v2-setup.sql');
console.log('3. Kopiera HELA innehållet');
console.log('4. Klistra in i SQL Editor');
console.log('5. Klicka "Run" (nere till höger)');
console.log('6. Verifiera att du ser "Success" meddelandet\n');
