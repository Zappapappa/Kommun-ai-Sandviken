-- Hämta TENANT_ID från befintlig Sandviken tenant
SELECT 
  'TENANT_ID för .env:' as beskrivning,
  id as tenant_id,
  name,
  domain
FROM tenants 
WHERE domain = 'sandviken.se';
