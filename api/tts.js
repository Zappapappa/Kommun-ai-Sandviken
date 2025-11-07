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

    console.log('TTS API called');
    console.log('Speech Key exists:', !!speechKey);
    console.log('Speech Region:', speechRegion);

    if (!speechKey || !speechRegion) {
      console.error('Azure credentials missing!');
      console.error('AZURE_SPEECH_KEY:', speechKey ? 'EXISTS' : 'MISSING');
      console.error('AZURE_SPEECH_REGION:', speechRegion || 'MISSING');
      return res.status(500).json({ 
        error: 'Azure Speech credentials not configured in Vercel environment variables',
        details: 'Please add AZURE_SPEECH_KEY and AZURE_SPEECH_REGION in Vercel Dashboard'
      });
    }

    // Select voice based on language
    const voiceName = language === 'en' ? 'en-GB-LibbyNeural' : 'sv-SE-SofieNeural';
    const xmlLang = language === 'en' ? 'en-GB' : 'sv-SE';

    // Escape XML special characters
    const escapeXml = (unsafe) => {
      return unsafe.replace(/[<>&'"]/g, (c) => {
        switch (c) {
          case '<': return '&lt;';
          case '>': return '&gt;';
          case '&': return '&amp;';
          case '\'': return '&apos;';
          case '"': return '&quot;';
          default: return c;
        }
      });
    };

    const escapedText = escapeXml(text);

    // Use Azure REST API instead of SDK
    const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${xmlLang}'><voice name='${voiceName}'>${escapedText}</voice></speak>`;

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
      return res.status(500).json({ error: `Azure TTS failed: ${response.status}` });
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
    res.status(500).json({ error: err.message || 'TTS failed' });
  }
}
