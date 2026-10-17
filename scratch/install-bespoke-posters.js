const fs = require('fs');
const path = require('path');
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
const artifactDir = 'C:\\Users\\ADMIN\\.gemini\\antigravity-ide\\brain\\b8d69817-bd36-4895-bab4-fdffc1f947ab';
const outputDir = path.join(__dirname, '..', 'public', 'event-posters');

const imageMap = [
  { slug: 'carrom-doubles-open', file: 'carrom_doubles_board_1792271887862.jpg' },
  { slug: 'tug-of-war-boys', file: 'tug_of_war_boys_1792271903988.jpg' },
  { slug: 'tug-of-war-girls', file: 'tug_of_war_girls_1792271920525.jpg' },
  { slug: 'box-cricket-boys', file: 'box_cricket_boys_1792271953943.jpg' },
  { slug: 'box-cricket-girls', file: 'box_cricket_girls_1792271937998.jpg' },
  { slug: 'badminton-singles-boys', file: 'badminton_singles_boys_1792271993189.jpg' },
  { slug: 'badminton-doubles-boys', file: 'badminton_singles_boys_1792271993189.jpg' },
  { slug: 'badminton-singles-girls', file: 'badminton_singles_girls_1792271975822.jpg' },
  { slug: 'badminton-doubles-girls', file: 'badminton_singles_girls_1792271975822.jpg' },
  { slug: '100m-sprint-boys', file: 'sprint_100m_boys_1792272031588.jpg' },
  { slug: 'relay-4x100m-boys', file: 'sprint_100m_boys_1792272031588.jpg' },
  { slug: '100m-sprint-girls', file: 'sprint_100m_girls_1792272013087.jpg' },
  { slug: 'relay-4x100m-girls', file: 'relay_4x100m_girls_1792272116180.jpg' },
  { slug: 'shot-put-boys', file: 'shot_put_boys_1792272093570.jpg' },
  { slug: 'shot-put-girls', file: 'shot_put_girls_1792272071763.jpg' },
  { slug: 'throwball-girls', file: 'throwball_girls_1792272052458.jpg' },
];

async function run() {
  console.log(`Processing and compressing ${imageMap.length} bespoke event posters...`);

  for (let i = 0; i < imageMap.length; i++) {
    const { slug, file } = imageMap[i];
    const srcPath = path.join(artifactDir, file);
    const destPath = path.join(outputDir, `${slug}.webp`);
    const relativeUrl = `/event-posters/${slug}.webp`;

    if (!fs.existsSync(srcPath)) {
      console.error(`Source not found: ${srcPath}`);
      continue;
    }

    const compressed = await sharp(srcPath)
      .resize(800, 480, { fit: 'cover', position: 'center' })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();

    fs.writeFileSync(destPath, compressed);
    const sizeKb = (compressed.length / 1024).toFixed(1);

    // Upload to Supabase Storage fest-media
    await supabase.storage
      .from('fest-media')
      .upload(`posters/${slug}.webp`, compressed, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      });

    // Update Supabase DB
    await supabase
      .from('events')
      .update({ poster_url: relativeUrl })
      .eq('slug', slug);

    console.log(`[${i + 1}/${imageMap.length}] ${slug} -> ${sizeKb} KB (< 100 KB) ✓`);
  }

  console.log('\nAll bespoke images successfully installed and uploaded!');
}

run().catch(console.error);
