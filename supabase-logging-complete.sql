-- ============================================
-- KOMPLETT LOGGING SETUP - KÖR DENNA!
-- ============================================

-- Radera gamla tabeller om de finns (säkerhetsåtgärd)
DROP TABLE IF EXISTS daily_stats CASCADE;
DROP TABLE IF EXISTS query_logs CASCADE;
DROP TABLE IF EXISTS tenants CASCADE;

-- 1. Tenant-tabell
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT UNIQUE NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- 2. Query logs
CREATE TABLE query_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  
  -- Fråga & Svar
  query_text TEXT NOT NULL,
  category TEXT,
  response_text TEXT,
  sources_count INT DEFAULT 0,
  
  -- AI Kostnader
  embedding_tokens INT DEFAULT 0,
  completion_prompt_tokens INT DEFAULT 0,
  completion_response_tokens INT DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  
  -- Prestanda
  response_time_ms INT,
  similarity_threshold DECIMAL(3, 2),
  chunks_found INT DEFAULT 0,
  
  -- Användare (anonymiserat)
  session_id TEXT,
  user_language TEXT DEFAULT 'sv',
  user_agent TEXT,
  
  -- Kvalitet & Feedback
  user_feedback SMALLINT,
  followed_source BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_hash TEXT
);

-- 3. Daglig statistik
CREATE TABLE daily_stats (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  total_queries INT DEFAULT 0,
  unique_sessions INT DEFAULT 0,
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  avg_cost_per_query DECIMAL(10, 6),
  avg_response_time_ms INT,
  max_response_time_ms INT,
  min_response_time_ms INT,
  positive_feedback INT DEFAULT 0,
  negative_feedback INT DEFAULT 0,
  satisfaction_rate DECIMAL(5, 2),
  category_breakdown JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

-- 4. Index
CREATE INDEX idx_query_logs_tenant ON query_logs(tenant_id);
CREATE INDEX idx_query_logs_created ON query_logs(created_at DESC);
CREATE INDEX idx_query_logs_category ON query_logs(category);
CREATE INDEX idx_query_logs_session ON query_logs(session_id);
CREATE INDEX idx_daily_stats_tenant_date ON daily_stats(tenant_id, date DESC);

-- 5. Uppdatera befintliga tabeller
ALTER TABLE pages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chunks_v2 ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_pages_tenant ON pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_tenant ON chunks_v2(tenant_id);

-- 6. Row Level Security
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY tenant_isolation_query_logs ON query_logs
  FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_daily_stats ON daily_stats
  FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY super_admin_query_logs ON query_logs
  FOR ALL
  USING (current_setting('app.user_role', true) = 'super_admin');

CREATE POLICY super_admin_daily_stats ON daily_stats
  FOR ALL
  USING (current_setting('app.user_role', true) = 'super_admin');

-- 7. Helper function
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Aggregeringsfunktion
CREATE OR REPLACE FUNCTION aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS void AS $$
BEGIN
  INSERT INTO daily_stats (
    tenant_id, date, total_queries, unique_sessions, total_cost_usd,
    avg_cost_per_query, avg_response_time_ms, max_response_time_ms,
    min_response_time_ms, positive_feedback, negative_feedback,
    satisfaction_rate, category_breakdown
  )
  SELECT 
    tenant_id,
    DATE(created_at) as date,
    COUNT(*) as total_queries,
    COUNT(DISTINCT session_id) as unique_sessions,
    COALESCE(SUM(total_cost_usd), 0) as total_cost_usd,
    COALESCE(AVG(total_cost_usd), 0) as avg_cost_per_query,
    AVG(response_time_ms)::INT as avg_response_time_ms,
    MAX(response_time_ms) as max_response_time_ms,
    MIN(response_time_ms) as min_response_time_ms,
    COUNT(*) FILTER (WHERE user_feedback = 1) as positive_feedback,
    COUNT(*) FILTER (WHERE user_feedback = -1) as negative_feedback,
    CASE 
      WHEN COUNT(*) FILTER (WHERE user_feedback IN (-1, 1)) > 0 
      THEN (COUNT(*) FILTER (WHERE user_feedback = 1)::DECIMAL / 
            COUNT(*) FILTER (WHERE user_feedback IN (-1, 1)) * 100)
      ELSE 0 
    END as satisfaction_rate,
    jsonb_object_agg(
      COALESCE(category, 'Okategoriserad'), 
      cat_count
    ) FILTER (WHERE category IS NOT NULL) as category_breakdown
  FROM (
    SELECT DISTINCT ON (tenant_id, DATE(created_at), category)
      tenant_id, created_at, session_id, total_cost_usd, response_time_ms,
      user_feedback, category,
      COUNT(*) OVER (PARTITION BY tenant_id, DATE(created_at), category) as cat_count
    FROM query_logs
    WHERE DATE(created_at) = target_date
  ) subquery
  WHERE DATE(created_at) = target_date
  GROUP BY tenant_id, DATE(created_at)
  ON CONFLICT (tenant_id, date) DO UPDATE SET
    total_queries = EXCLUDED.total_queries,
    unique_sessions = EXCLUDED.unique_sessions,
    total_cost_usd = EXCLUDED.total_cost_usd,
    avg_cost_per_query = EXCLUDED.avg_cost_per_query,
    avg_response_time_ms = EXCLUDED.avg_response_time_ms,
    max_response_time_ms = EXCLUDED.max_response_time_ms,
    min_response_time_ms = EXCLUDED.min_response_time_ms,
    positive_feedback = EXCLUDED.positive_feedback,
    negative_feedback = EXCLUDED.negative_feedback,
    satisfaction_rate = EXCLUDED.satisfaction_rate,
    category_breakdown = EXCLUDED.category_breakdown;
END;
$$ LANGUAGE plpgsql;

-- 9. SKAPA SANDVIKEN TENANT
INSERT INTO tenants (name, domain, api_key, settings)
VALUES (
  'Sandvikens kommun',
  'sandviken.se',
  'sk_' || encode(gen_random_bytes(32), 'hex'),
  '{"max_queries_per_day": 10000, "alert_email": "admin@sandviken.se"}'::jsonb
)
ON CONFLICT (domain) DO NOTHING
RETURNING id, name, domain, api_key;

-- 10. UPPDATERA BEFINTLIG DATA
DO $$
DECLARE
  sandviken_id UUID;
BEGIN
  SELECT id INTO sandviken_id FROM tenants WHERE domain = 'sandviken.se';
  
  IF sandviken_id IS NOT NULL THEN
    UPDATE pages SET tenant_id = sandviken_id WHERE tenant_id IS NULL;
    UPDATE chunks_v2 SET tenant_id = sandviken_id WHERE tenant_id IS NULL;
    
    RAISE NOTICE 'Updated % pages and % chunks with tenant_id', 
      (SELECT COUNT(*) FROM pages WHERE tenant_id = sandviken_id),
      (SELECT COUNT(*) FROM chunks_v2 WHERE tenant_id = sandviken_id);
  END IF;
END $$;

-- ============================================
-- VIKTIGT: KOPIERA DESSA VÄRDEN TILL .env
-- ============================================

SELECT 
  '=== KOPIERA DESSA VÄRDEN ===' as info,
  '' as blank1;

SELECT 
  'TENANT_ID' as variable_name,
  id::text as value,
  'Kopiera detta UUID till .env' as note
FROM tenants 
WHERE domain = 'sandviken.se';

SELECT 
  'API_KEY (för framtida bruk)' as variable_name,
  api_key as value,
  'Spara säkert!' as note
FROM tenants 
WHERE domain = 'sandviken.se';

SELECT 
  '' as blank2,
  '=== VERIFIERING ===' as info;

SELECT 
  'Tenants' as table_name,
  COUNT(*)::text as count
FROM tenants;

SELECT 
  'Pages med tenant_id' as table_name,
  COUNT(*)::text as count
FROM pages 
WHERE tenant_id IS NOT NULL;

SELECT 
  'Chunks med tenant_id' as table_name,
  COUNT(*)::text as count
FROM chunks_v2 
WHERE tenant_id IS NOT NULL;

-- Klart! Kör denna SQL och kopiera TENANT_ID från resultatet till .env
