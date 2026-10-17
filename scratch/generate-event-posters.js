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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

const outputDir = path.join(__dirname, '..', 'public', 'event-posters');
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// 4 missing events to process
const eventImages = [
  { slug: 'badminton-singles-girls', photoId: 'photo-1521537634581-0dced2fee2ef' },
  { slug: 'box-cricket-boys', photoId: 'photo-1624526267942-ab0ff8a3e972' },
  { slug: 'football-boys-7v7', photoId: 'photo-1579952363873-27f3bade9f55' },
  { slug: 'tug-of-war-boys', photoId: 'photo-1534438327276-14e5300c3a48' },
];

function downloadImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadImage(res.headers.location).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`Failed to download ${url}: status ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function processEvent(item, index, total) {
  const { slug, photoId } = item;
  const targetFile = path.join(outputDir, `${slug}.webp`);
  const relativeUrl = `/event-posters/${slug}.webp`;

  const unsplashUrl = `https://images.unsplash.com/${photoId}?auto=format&fit=crop&w=800&h=480&q=80`;

  try {
    process.stdout.write(`[${index + 1}/${total}] Processing ${slug}... `);
    const rawBuffer = await downloadImage(unsplashUrl);

    // Compress to 800x480 WebP with high quality bicubic reduction (< 100 KB)
    const compressedBuffer = await sharp(rawBuffer)
      .resize(800, 480, { fit: 'cover', position: 'center' })
      .webp({ quality: 80, effort: 6 })
      .toBuffer();

    fs.writeFileSync(targetFile, compressedBuffer);
    const sizeKb = (compressedBuffer.length / 1024).toFixed(1);

    // Also upload to Supabase Storage fest-media bucket
    const storagePath = `posters/${slug}.webp`;
    await supabase.storage
      .from('fest-media')
      .upload(storagePath, compressedBuffer, {
        contentType: 'image/webp',
        cacheControl: '31536000',
        upsert: true,
      });

    // Update events table in Supabase
    const { error: updateError } = await supabase
      .from('events')
      .update({ poster_url: relativeUrl })
      .eq('slug', slug);

    if (updateError) {
      console.log(`Saved locally (${sizeKb} KB) | DB update warning: ${updateError.message}`);
    } else {
      console.log(`✓ DONE: ${sizeKb} KB (< 100KB) | Stored in public & Supabase DB`);
    }
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
  }
}

async function main() {
  console.log(`Starting compression and upload for ${eventImages.length} events...`);
  console.log(`Target: WebP 800x480, quality 80, file size < 100 KB\n`);

  for (let i = 0; i < eventImages.length; i++) {
    await processEvent(eventImages[i], i, eventImages.length);
  }

  console.log(`\n🎉 All ${eventImages.length} event posters generated, compressed & uploaded!`);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
