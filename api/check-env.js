// Debug endpoint - remove after testing
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const envCheck = {
    hasAzureSpeechKey: !!process.env.AZURE_SPEECH_KEY,
    azureSpeechRegion: process.env.AZURE_SPEECH_REGION || 'MISSING',
    hasAzureTranslatorKey: !!process.env.AZURE_TRANSLATOR_KEY,
    azureTranslatorRegion: process.env.AZURE_TRANSLATOR_REGION || 'MISSING',
    hasOpenAI: !!process.env.OPENAI_API_KEY,
    hasSupabase: !!process.env.SUPABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
    vercelRegion: process.env.VERCEL_REGION || 'unknown'
  };
  
  res.status(200).json(envCheck);
}
