import 'dotenv/config';

const m = s => (s ? `${s.slice(0,8)}...${s.slice(-6)} (len:${s.length})` : 'MISSING');

console.log('SUPABASE_URL            =', process.env.SUPABASE_URL || 'MISSING');
console.log('SUPABASE_SERVICE_ROLE_KEY =', m(process.env.SUPABASE_SERVICE_ROLE_KEY));
