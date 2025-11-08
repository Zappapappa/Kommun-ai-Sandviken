-- ============================================
-- LOGGING & MULTI-TENANT SETUP
-- ============================================

-- 1. Tenant-tabell för att hantera flera kommuner
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,              -- "Sandvikens kommun"
  domain TEXT UNIQUE,               -- "sandviken.se"
  api_key TEXT UNIQUE,              -- För API-access (genereras automatiskt)
  settings JSONB DEFAULT '{}',      -- Anpassningar per kommun
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true
);

-- 2. Query logs - Loggar varje AI-fråga
CREATE TABLE IF NOT EXISTS query_logs (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  
  -- Fråga & Svar
  query_text TEXT NOT NULL,
  category TEXT,
  response_text TEXT,
  sources_count INT DEFAULT 0,
  
  -- AI Kostnader (OpenAI tokens & pricing)
  embedding_tokens INT DEFAULT 0,
  completion_prompt_tokens INT DEFAULT 0,
  completion_response_tokens INT DEFAULT 0,
  total_cost_usd DECIMAL(10, 6) DEFAULT 0,
  
  -- Prestanda
  response_time_ms INT,
  similarity_threshold DECIMAL(3, 2),
  chunks_found INT DEFAULT 0,
  
  -- Användare (anonymiserat)
  session_id TEXT,                  -- Cookie/localStorage baserad
  user_language TEXT DEFAULT 'sv',  -- sv/en
  user_agent TEXT,
  
  -- Kvalitet & Feedback
  user_feedback SMALLINT,           -- -1 (dåligt), 0 (ingen), 1 (bra)
  followed_source BOOLEAN DEFAULT false,
  
  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  ip_hash TEXT                      -- Hashad IP för abuse-detection
);

-- 3. Daglig aggregerad statistik (snabbare rapporter)
CREATE TABLE IF NOT EXISTS daily_stats (
  id BIGSERIAL PRIMARY KEY,
  tenant_id UUID REFERENCES tenants(id),
  date DATE NOT NULL,
  
  -- Användning
  total_queries INT DEFAULT 0,
  unique_sessions INT DEFAULT 0,
  
  -- Kostnader
  total_cost_usd DECIMAL(10, 4) DEFAULT 0,
  avg_cost_per_query DECIMAL(10, 6),
  
  -- Prestanda
  avg_response_time_ms INT,
  max_response_time_ms INT,
  min_response_time_ms INT,
  
  -- Kvalitet
  positive_feedback INT DEFAULT 0,
  negative_feedback INT DEFAULT 0,
  satisfaction_rate DECIMAL(5, 2),
  
  -- Kategorier (JSON för flexibilitet)
  category_breakdown JSONB DEFAULT '{}',  -- {"Bygglov": 45, "Skola": 23}
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, date)
);

-- 4. Index för snabba queries
CREATE INDEX IF NOT EXISTS idx_query_logs_tenant ON query_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_query_logs_created ON query_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_query_logs_category ON query_logs(category);
CREATE INDEX IF NOT EXISTS idx_query_logs_session ON query_logs(session_id);
CREATE INDEX IF NOT EXISTS idx_daily_stats_tenant_date ON daily_stats(tenant_id, date DESC);

-- 5. Uppdatera befintliga tabeller med tenant_id
-- VARNING: Detta ändrar befintliga tabeller!
ALTER TABLE pages ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);
ALTER TABLE chunks_v2 ADD COLUMN IF NOT EXISTS tenant_id UUID REFERENCES tenants(id);

CREATE INDEX IF NOT EXISTS idx_pages_tenant ON pages(tenant_id);
CREATE INDEX IF NOT EXISTS idx_chunks_v2_tenant ON chunks_v2(tenant_id);

-- 6. Row Level Security (RLS) för tenant-isolering
ALTER TABLE query_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Policy: Endast se sin egen tenants data
CREATE POLICY tenant_isolation_query_logs ON query_logs
  FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant', true));

CREATE POLICY tenant_isolation_daily_stats ON daily_stats
  FOR SELECT
  USING (tenant_id::text = current_setting('app.current_tenant', true));

-- Super admin kan se allt (sätt via JWT claim)
CREATE POLICY super_admin_query_logs ON query_logs
  FOR ALL
  USING (
    current_setting('app.user_role', true) = 'super_admin'
  );

CREATE POLICY super_admin_daily_stats ON daily_stats
  FOR ALL
  USING (
    current_setting('app.user_role', true) = 'super_admin'
  );

-- 7. Function för att sätta tenant context
CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.current_tenant', tenant_uuid::text, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Skapa första tenant (Sandviken)
INSERT INTO tenants (name, domain, api_key, settings)
VALUES (
  'Sandvikens kommun',
  'sandviken.se',
  'sk_' || encode(gen_random_bytes(32), 'hex'),  -- Genererar random API key
  '{"max_queries_per_day": 10000, "alert_email": "admin@sandviken.se"}'
)
ON CONFLICT (domain) DO NOTHING;

-- 9. Uppdatera befintlig data med Sandvikens tenant_id
DO $$
DECLARE
  sandviken_id UUID;
BEGIN
  SELECT id INTO sandviken_id FROM tenants WHERE domain = 'sandviken.se';
  
  IF sandviken_id IS NOT NULL THEN
    UPDATE pages SET tenant_id = sandviken_id WHERE tenant_id IS NULL;
    UPDATE chunks_v2 SET tenant_id = sandviken_id WHERE tenant_id IS NULL;
  END IF;
END $$;

-- 10. Visa skapad API key för Sandviken
SELECT 
  name,
  domain,
  api_key,
  'Spara denna API key säkert!' as note
FROM tenants 
WHERE domain = 'sandviken.se';

-- ============================================
-- AGGREGERING: Kör denna nightly för statistik
-- (Sätt upp som cron job i Supabase eller externt)
-- ============================================

CREATE OR REPLACE FUNCTION aggregate_daily_stats(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS void AS $$
BEGIN
  INSERT INTO daily_stats (
    tenant_id,
    date,
    total_queries,
    unique_sessions,
    total_cost_usd,
    avg_cost_per_query,
    avg_response_time_ms,
    max_response_time_ms,
    min_response_time_ms,
    positive_feedback,
    negative_feedback,
    satisfaction_rate,
    category_breakdown
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
    ) as category_breakdown
  FROM (
    SELECT 
      tenant_id,
      created_at,
      session_id,
      total_cost_usd,
      response_time_ms,
      user_feedback,
      category,
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

-- Kommentar: Kör denna function varje natt kl 02:00
-- Exempel med pg_cron (om tillgänglig):
-- SELECT cron.schedule('aggregate-stats', '0 2 * * *', 'SELECT aggregate_daily_stats()');
