import 'dotenv/config';

const mask = (s) => s ? `${s.slice(0,10)}...${s.slice(-4)} (len:${s.length})` : 'MISSING';
console.log('API   ', mask(process.env.OPENAI_API_KEY));
console.log('PROJ  ', mask(process.env.OPENAI_PROJECT_ID));
console.log('ORG   ', mask(process.env.OPENAI_ORG_ID));
