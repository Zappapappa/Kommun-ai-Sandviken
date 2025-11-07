import fs from 'fs';

try {
  const txt = fs.readFileSync('.env', 'utf8');
  console.log('CWD:', process.cwd());
  console.log('ENV FILE PRESENT:', 'YES');
  console.log('ENV FIRST LINE:', (txt.split(/\r?\n/)[0] || '').trim());
} catch (e) {
  console.log('CWD:', process.cwd());
  console.log('ENV FILE PRESENT:', 'NO (.env not found)');
}
