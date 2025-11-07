import 'dotenv/config';
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

(async () => {
  try {
    const r = await client.models.list();
    console.log('OK:', r.data[0].id);
  } catch (e) {
    console.error('FAIL:', e.status, e.message);
  }
})();
