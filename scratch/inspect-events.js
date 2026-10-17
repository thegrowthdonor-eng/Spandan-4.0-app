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
  const { data, error } = await supabase.from('events').select('id, slug, title, category, poster_url, eligibility');
  if (error) return console.error(error);
  console.log('Total events in DB:', data.length);
  const sports = data.filter(e => e.category === 'sport');
  console.log('Sports events count:', sports.length);
  sports.forEach(s => {
    console.log(s.slug.padEnd(26), '|', (s.eligibility?.division || 'open').padEnd(7), '|', (s.eligibility?.sub_category || 'NONE').padEnd(10), '|', s.title);
  });
}

run();
