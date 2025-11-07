export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const envCheck = {
    AZURE_SPEECH_KEY: !!process.env.AZURE_SPEECH_KEY,
    AZURE_SPEECH_REGION: process.env.AZURE_SPEECH_REGION || 'MISSING',
    AZURE_TRANSLATOR_KEY: !!process.env.AZURE_TRANSLATOR_KEY,
    AZURE_TRANSLATOR_REGION: process.env.AZURE_TRANSLATOR_REGION || 'MISSING',
    OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
    SUPABASE_URL: !!process.env.SUPABASE_URL,
    NODE_ENV: process.env.NODE_ENV,
    VERCEL_ENV: process.env.VERCEL_ENV
  };
  
  res.status(200).json(envCheck);
}
