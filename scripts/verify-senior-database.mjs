// Runs only in-memory Postgres; this script has no hosted database connection.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const loadModule = createRequire(import.meta.url);
const moduleName = process.env.PGLITE_MODULE || '@electric-sql/pglite';
const { PGlite } = loadModule(moduleName);
const { pgcrypto } = loadModule(path.join(path.dirname(loadModule.resolve(moduleName)), 'contrib/pgcrypto.cjs'));
let database;
(async () => {
  const db = database = new PGlite({ extensions: { pgcrypto } });
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create schema auth; create schema storage; create schema extensions;
    create extension pgcrypto with schema extensions;
    create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}',raw_app_meta_data jsonb default '{}');
    create table auth.sessions(id uuid primary key,user_id uuid references auth.users(id));
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claims',true)::jsonb->>'sub','')::uuid $$;
    create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb $$;
    grant usage on schema auth to anon,authenticated,service_role;
    grant execute on all functions in schema auth to anon,authenticated,service_role;
    create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text,owner uuid,owner_id text,metadata jsonb);
    alter table storage.objects enable row level security;
  `);
  for (const filename of fs.readdirSync('supabase/migrations').filter(name => name.endsWith('.sql')).sort()) {
    let sql = fs.readFileSync(path.join('supabase/migrations', filename), 'utf8');
    // The historical hosted-only publisher is absent locally; omit only its redundant ACL revoke.
    if (filename === '20261111143013_database_warning_hardening.sql') sql = sql.replace(/^revoke execute on function public.publish_result_positions_v1[^\n]+$/m, '');
    try { await db.exec(sql); }
    catch (error) { throw new Error(`${filename}: ${error.message}`); }
  }
  await db.exec("set spandan.isolated_tests='on'");
  await db.exec(fs.readFileSync('supabase/tests/senior_signup_and_entries.sql', 'utf8'));
  assert.equal((await db.query('select count(*)::int as n from public.senior_event_registrations')).rows[0].n, 0);
  console.log('Local migrations, senior isolation, privacy, signup and voting checks passed; fixtures rolled back.');
  await db.close();
})().catch(async error => { console.error(error.message); await database?.close(); process.exitCode = 1; });
