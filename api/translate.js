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
    const { text, targetLang = 'en' } = req.body;
    
    if (!text) {
      return res.status(400).json({ error: 'Missing text parameter' });
    }

  const translatorKey = process.env.AZURE_TRANSLATOR_KEY;
  const translatorRegion = process.env.AZURE_TRANSLATOR_REGION;

    if (!translatorKey || !translatorRegion) {
      console.error('Azure Translator credentials not found');
      return res.status(500).json({ 
        error: 'Server configuration error',
        code: 'MISSING_CREDENTIALS'
      });
    }

    // Use Azure Translator REST API
    const response = await fetch(
      `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLang}`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': translatorKey,
          'Ocp-Apim-Subscription-Region': translatorRegion,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([{ text }]),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Azure Translator error:', errorText);
      throw new Error(`Translation failed: ${response.status}`);
    }

    const data = await response.json();
    const translatedText = data[0]?.translations[0]?.text || text;

    res.status(200).json({
      originalText: text,
      translatedText,
      targetLang,
    });

  } catch (err) {
    console.error('Translation error:', err);
    res.status(500).json({ error: err.message });
  }
}
