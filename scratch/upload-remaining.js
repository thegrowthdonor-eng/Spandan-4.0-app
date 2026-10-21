const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

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

async function run() {
  for (const slug of ['relay-4x100m-boys', 'table-tennis-singles-boys']) {
    const file = path.join(__dirname, '..', 'public', 'event-posters', slug + '.webp');
    const comp = fs.readFileSync(file);
    await supabase.storage.from('fest-media').upload('posters/' + slug + '.webp', comp, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: true
    });
    console.log('Uploaded to Supabase Storage:', slug);
  }
}

run().catch(console.error);
