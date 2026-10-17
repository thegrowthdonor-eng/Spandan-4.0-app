const https = require('https');

function searchWiki(query) {
  return new Promise((resolve, reject) => {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query + ' filetype:bitmap')}&srnamespace=6&format=json`;
    https.get(url, { headers: { 'User-Agent': 'SpandanApp/1.0 (contact@spandan.asmc.edu)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json.query.search);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function getImageUrl(title) {
  return new Promise((resolve, reject) => {
    const url = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=imageinfo&iiprop=url&format=json`;
    https.get(url, { headers: { 'User-Agent': 'SpandanApp/1.0 (contact@spandan.asmc.edu)' } }, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const pages = json.query.pages;
          const firstKey = Object.keys(pages)[0];
          resolve(pages[firstKey]?.imageinfo?.[0]?.url);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

async function test() {
  const queries = [
    'badminton mixed doubles match',
    'table tennis women singles match',
    'table tennis men match action',
    'football soccer match action men',
    'relay 4x100m men baton handover'
  ];

  for (const q of queries) {
    console.log(`\n=== Query: "${q}" ===`);
    const results = await searchWiki(q);
    for (let i = 0; i < Math.min(3, results.length); i++) {
      const title = results[i].title;
      const imgUrl = await getImageUrl(title);
      console.log(`- ${title} -> ${imgUrl}`);
    }
  }
}

test().catch(console.error);
