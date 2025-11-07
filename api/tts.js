export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { text, language = 'sv' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION;

    if (!speechKey || !speechRegion) {
      return res.status(500).json({ error: 'Azure credentials not configured' });
    }

    // Select voice based on language
    const voiceName = language === 'en' ? 'en-GB-LibbyNeural' : 'sv-SE-SofieNeural';
    const xmlLang = language === 'en' ? 'en-GB' : 'sv-SE';

    // Use Azure REST API instead of SDK
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voiceName}'>${text}</voice></speak>`;

    const response = await fetch(
      `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': speechKey,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-16khz-32kbitrate-mono-mp3',
          'User-Agent': 'vercel-tts',
        },
        body: ssml,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure TTS error details:', errorText);
      throw new Error(`Azure TTS failed: ${response.status} - ${errorText}`);
    }

    // Get audio as array buffer and convert to base64
    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString('base64');

    res.status(200).json({
      audio: audioBase64,
      format: 'mp3'
    });

  } catch (err) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message });
  }
}
