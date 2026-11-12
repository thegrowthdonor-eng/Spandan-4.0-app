import assert from "node:assert/strict";
import test from "node:test";
import { programmeFetch, programmeCacheTag } from "./programme-fetch";

test("programme caching is bounded, anonymous, read-only and never includes live scores or writes", async () => {
  const previousUrl=process.env.NEXT_PUBLIC_SUPABASE_URL, previousKey=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL="https://example.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY="public-test-key";
  const calls:RequestInit[]=[];
  const original=globalThis.fetch;
  globalThis.fetch=async (_input,init)=>{calls.push(init??{});return new Response("[]");};
  try {
    const headers={authorization:"Bearer public-test-key"};
    for(const path of ["events","schedule_entries"]){
      await programmeFetch(`https://example.supabase.co/rest/v1/${path}`,{headers});
      assert.equal(calls.at(-1)?.cache,"force-cache");
      assert.deepEqual((calls.at(-1) as RequestInit & {next:unknown}).next,{revalidate:30,tags:[programmeCacheTag]});
    }
    for(const [url,init] of [
      ["https://example.supabase.co/rest/v1/events",{headers,method:"POST"}],
      ["https://example.supabase.co/rest/v1/events",{headers:{authorization:"Bearer user-token"}}],
      ["https://example.supabase.co/rest/v1/events",{headers:{...headers,cookie:"private-session"}}],
      ["https://other.example/rest/v1/events",{headers}],
      ["https://example.supabase.co/rest/v1/fixtures",{headers}],
      ["https://example.supabase.co/rest/v1/rpc/public_competition_schedule",{headers,method:"POST"}],
    ] as const){await programmeFetch(url,init);assert.equal(calls.at(-1)?.cache,undefined);}
  } finally {
    globalThis.fetch=original;
    if(previousUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=previousUrl;
    if(previousKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY=previousKey;
  }
});
