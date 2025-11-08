// lib/logging.js
// Hjälpfunktioner för att logga AI-queries till Supabase

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY // Använd service key för backend
);

// OpenAI Pricing (2025) - uppdatera vid behov
const PRICING = {
  EMBEDDING_PER_1M_TOKENS: 0.13,      // text-embedding-3-small
  GPT4O_MINI_INPUT_PER_1M: 0.15,      // gpt-4o-mini input
  GPT4O_MINI_OUTPUT_PER_1M: 0.60,     // gpt-4o-mini output
};

/**
 * Beräkna kostnad för en query
 */
export function calculateCost(data) {
  const embeddingCost = (data.embeddingTokens / 1000000) * PRICING.EMBEDDING_PER_1M_TOKENS;
  const inputCost = (data.promptTokens / 1000000) * PRICING.GPT4O_MINI_INPUT_PER_1M;
  const outputCost = (data.responseTokens / 1000000) * PRICING.GPT4O_MINI_OUTPUT_PER_1M;
  
  return embeddingCost + inputCost + outputCost;
}

/**
 * Hash IP address för privacy
 */
function hashIP(ip) {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip + process.env.IP_SALT || 'default-salt').digest('hex');
}

/**
 * Logga en query till databasen
 */
export async function logQuery({
  tenantId,
  query,
  category,
  answer,
  sources,
  
  // Token counts från OpenAI
  embeddingTokens,
  promptTokens,
  responseTokens,
  
  // Prestanda
  responseTime,
  chunksFound,
  similarityThreshold,
  
  // Användare (anonymiserat)
  sessionId,
  userLanguage = 'sv',
  userAgent,
  ipAddress,
}) {
  try {
    const totalCost = calculateCost({
      embeddingTokens,
      promptTokens,
      responseTokens,
    });

    const { data, error } = await supabase
      .from('query_logs')
      .insert({
        tenant_id: tenantId,
        
        query_text: query,
        category: category || null,
        response_text: answer,
        sources_count: sources?.length || 0,
        
        embedding_tokens: embeddingTokens,
        completion_prompt_tokens: promptTokens,
        completion_response_tokens: responseTokens,
        total_cost_usd: totalCost,
        
        response_time_ms: responseTime,
        similarity_threshold: similarityThreshold,
        chunks_found: chunksFound,
        
        session_id: sessionId,
        user_language: userLanguage,
        user_agent: userAgent,
        ip_hash: hashIP(ipAddress),
        
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Failed to log query:', error);
      return null;
    }

    console.log(`✅ Logged query ${data.id}: $${totalCost.toFixed(6)} (${embeddingTokens + promptTokens + responseTokens} tokens)`);
    return data;
    
  } catch (err) {
    console.error('❌ Exception in logQuery:', err);
    return null;
  }
}

/**
 * Uppdatera user feedback för en query
 */
export async function updateQueryFeedback(queryId, feedback) {
  try {
    const { error } = await supabase
      .from('query_logs')
      .update({ user_feedback: feedback })
      .eq('id', queryId);

    if (error) {
      console.error('❌ Failed to update feedback:', error);
      return false;
    }

    console.log(`✅ Updated feedback for query ${queryId}: ${feedback}`);
    return true;
    
  } catch (err) {
    console.error('❌ Exception in updateQueryFeedback:', err);
    return false;
  }
}

/**
 * Markera att användaren följde en source-länk
 */
export async function markSourceFollowed(queryId) {
  try {
    const { error } = await supabase
      .from('query_logs')
      .update({ followed_source: true })
      .eq('id', queryId);

    if (error) {
      console.error('❌ Failed to mark source followed:', error);
      return false;
    }

    return true;
    
  } catch (err) {
    console.error('❌ Exception in markSourceFollowed:', err);
    return false;
  }
}

/**
 * Hämta tenant från domain eller API key
 */
export async function getTenant(identifier, identifierType = 'domain') {
  try {
    const column = identifierType === 'domain' ? 'domain' : 'api_key';
    
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq(column, identifier)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      console.error(`❌ Tenant not found: ${identifier}`);
      return null;
    }

    return data;
    
  } catch (err) {
    console.error('❌ Exception in getTenant:', err);
    return null;
  }
}

/**
 * Generera eller hämta session ID från request
 */
export function getOrCreateSessionId(req) {
  // Försök hämta från cookie
  const existingSession = req.cookies?.['ai_session_id'];
  if (existingSession) return existingSession;
  
  // Försök från header (för embedded widget)
  const headerSession = req.headers['x-session-id'];
  if (headerSession) return headerSession;
  
  // Generera ny
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Extrahera IP från request (fungerar både för Vercel och local)
 */
export function getClientIP(req) {
  // Vercel
  if (req.headers['x-real-ip']) return req.headers['x-real-ip'];
  if (req.headers['x-forwarded-for']) {
    return req.headers['x-forwarded-for'].split(',')[0].trim();
  }
  
  // Local development
  return req.socket?.remoteAddress || 'unknown';
}
