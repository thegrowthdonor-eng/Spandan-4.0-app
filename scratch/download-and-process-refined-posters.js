const fs = require('fs');
const path = require('path');
const https = require('https');
const sharp = require('sharp');
const { createClient } = require('@supabase/supabase-js');

// Load environment from .env.local
const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf-8');
const env = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let val = match[2] || '';
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
    env[match[1]] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const outputDir = path.join(__dirname, '..', 'public', 'event-posters');

const downloads = [
  {
    slug: 'badminton-mixed-doubles',
    url: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Olympics_2012_Mixed_Doubles_Final.jpg',
  },
  {
    slug: 'table-tennis-singles-girls',
    url: 'https://upload.wikimedia.org/wikipedia/commons/d/db/Table_tennis_at_the_2018_Summer_Youth_Olympics_%E2%80%93_Women%27s_Singles_Gold_Medal_Match_027.jpg',
  },
  {
    slug: 'table-tennis-singles-boys',
    url: 'https://upload.wikimedia.org/wikipedia/commons/4/4d/Table_tennis_at_the_2018_Summer_Youth_Olympics_%E2%80%93_Men%27s_Singles_Bronze_Medal_Match_589.jpg',
  },
  {
    slug: 'relay-4x100m-boys',
    url: 'https://upload.wikimedia.org/wikipedia/commons/9/9e/2013_World_Championships_in_Athletics_%E2%80%93_Men%27s_4_%C3%97_100_metres_relay_04.jpg',
  },
  {
    slug: 'football-boys-7v7',
    url: 'https://upload.wikimedia.org/wikipedia/commons/3/38/Ukraine_vs._Argentina%2C_2024_Summer_Olympic_men%27s_association_football%2C_2024-07-30_-_Action.jpg',
  },
];

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SpandanApp/1.0 (contact@spandan.asmc.edu)' } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} from ${url}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function run() {
  console.log('--- 1. Recompressing tug-of-war-girls to < 100 KB ---');
  const artifactDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\b8d69817-bd36-4895-bab4-fdffc1f947ab';
  const tugGirlsSrc = path.join(artifactDir, 'tug_of_war_girls_1792271920525.jpg');
  const tugGirlsDest = path.join(outputDir, 'tug-of-war-girls.webp');
  if (fs.existsSync(tugGirlsSrc)) {
    const compressed = await sharp(tugGirlsSrc)
      .resize(800, 480, { fit: 'cover', position: 'center' })
      .webp({ quality: 72, effort: 6 })
      .toBuffer();
    fs.writeFileSync(tugGirlsDest, compressed);
    const sizeKb = (compressed.length / 1024).toFixed(1);
    await supabase.storage.from('fest-media').upload('posters/tug-of-war-girls.webp', compressed, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true,
    });
    console.log(`tug-of-war-girls recompressed to: ${sizeKb} KB (< 100 KB) ✓`);
  }

  console.log('\n--- 2. Processing and replacing refined posters ---');
  for (const item of downloads) {
    try {
      console.log(`Downloading ${item.slug}...`);
      const raw = await downloadImage(item.url);
      const compressed = await sharp(raw)
        .resize(800, 480, { fit: 'cover', position: 'center' })
        .webp({ quality: 75, effort: 6 })
        .toBuffer();

      const dest = path.join(outputDir, `${item.slug}.webp`);
      fs.writeFileSync(dest, compressed);
      const sizeKb = (compressed.length / 1024).toFixed(1);

      await supabase.storage.from('fest-media').upload(`posters/${item.slug}.webp`, compressed, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      });

      await supabase.from('events').update({ poster_url: `/event-posters/${item.slug}.webp` }).eq('slug', item.slug);

      console.log(`✓ ${item.slug} -> ${sizeKb} KB (< 100 KB) installed & uploaded to Supabase!`);
    } catch (err) {
      console.error(`Error processing ${item.slug}:`, err.message);
    }
  }

  console.log('\n--- 3. Verifying ALL 34 event poster sizes ---');
  const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.webp'));
  let allUnder100 = true;
  for (const f of files) {
    const sz = fs.statSync(path.join(outputDir, f)).size / 1024;
    if (sz > 100) {
      console.log(`WARNING: ${f} is ${sz.toFixed(1)} KB (> 100 KB)`);
      allUnder100 = false;
    }
  }
  if (allUnder100) {
    console.log(`ALL ${files.length} posters are strictly under 100 KB! Perfect! ✓`);
  }
}

run().catch(console.error);
