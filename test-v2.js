import 'dotenv/config';

// Test queries för olika kategorier
const testQueries = [
  { q: 'Hur lång tid tar bygglov?', category: 'Bygga, bo och miljö' },
  { q: 'Vad kostar bygglov?', category: 'Bygga, bo och miljö' },
  { q: 'Hur ansöker jag om bygglov för tillbyggnad?', category: 'Bygga, bo och miljö' },
  { q: 'Behöver jag bygglov för altan?', category: 'Bygga, bo och miljö' },
  { q: 'Vilken hjälp kan jag få från omsorg?', category: 'Omsorg och stöd' },
  { q: 'Hur kontaktar jag kommunen?', category: 'Kommun och politik' },
  { q: 'Parkeringstillstånd för rörelsehindrade', category: 'Omsorg och stöd' },
  { q: 'Ekonomiskt stöd och rådgivning', category: 'Omsorg och stöd' },
  { q: 'Vad finns det för fritidsaktiviteter?', category: null }, // No filter
  { q: 'Information om kommunens tjänster', category: null }, // No filter
];

async function testSearchV2() {
  console.log(`\n${'='.repeat(70)}`);
  console.log('TEST AV SEARCH V2 API');
  console.log(`${'='.repeat(70)}\n`);

  const baseUrl = process.env.TEST_BASE_URL || 'http://localhost:3000';
  
  for (let i = 0; i < testQueries.length; i++) {
    const { q, category } = testQueries[i];
    
    console.log(`\n[${ i + 1}/${testQueries.length}] Fråga: "${q}"`);
    if (category) console.log(`    Kategorifilter: ${category}`);
    
    const startTime = Date.now();
    
    try {
      const params = new URLSearchParams({ q });
      if (category) params.append('category', category);
      
      const url = `${baseUrl}/api/search-v2?${params}`;
      const response = await fetch(url);
      
      const elapsed = Date.now() - startTime;
      
      if (!response.ok) {
        console.log(`    ❌ Fel: ${response.status} ${response.statusText}`);
        continue;
      }
      
      const data = await response.json();
      
      console.log(`    ✅ Svarstid: ${elapsed}ms`);
      console.log(`    📦 Chunks hittade: ${data.metadata?.chunks_found || 0}`);
      console.log(`    📄 Källor (${data.sources?.length || 0}):`);
      
      if (data.sources && data.sources.length > 0) {
        data.sources.forEach((source, idx) => {
          console.log(`       ${idx + 1}. [${source.category}] ${source.title}`);
          console.log(`          ${source.url}`);
        });
      } else {
        console.log(`       (Inga källor hittades)`);
      }
      
      // Visa första 150 tecken av svaret
      const preview = data.answer?.substring(0, 150) || '(Inget svar)';
      console.log(`    💬 Svar: ${preview}${data.answer?.length > 150 ? '...' : ''}`);
      
    } catch (err) {
      console.log(`    ❌ Exception: ${err.message}`);
    }
  }
  
  console.log(`\n${'='.repeat(70)}`);
  console.log('TEST KLART');
  console.log(`${'='.repeat(70)}\n`);
}

// Kör tester
testSearchV2().catch((e) => {
  console.error('\n❌ FEL VID TEST:', e.message || e);
  process.exit(1);
});
