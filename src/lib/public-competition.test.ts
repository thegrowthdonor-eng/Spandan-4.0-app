import assert from "node:assert/strict";
import test from "node:test";
import {readCompetition,voteCompetition} from "./public-competition";

test("public metadata deduplicates and vote retries bypass Vercel after bootstrap",async()=>{
  const previous=globalThis.fetch;const url=process.env.NEXT_PUBLIC_SUPABASE_URL;process.env.NEXT_PUBLIC_SUPABASE_URL="https://qa.supabase.co";
  const requests:string[]=[];
  globalThis.fetch=async(input)=>{const target=String(input);requests.push(target);return Response.json(target.startsWith("/api/") ? {token:"a".repeat(64),expiresAt:new Date(Date.now()+60_000).toISOString()} : target.endsWith("public_competition") ? {title:"QA"} : {receiptId:"receipt",optionId:"option"});};
  try {
    await Promise.all([readCompetition("test-dedupe"),readCompetition("test-dedupe")]);
    assert.equal(requests.length,1);
    await voteCompetition("round","option");await voteCompetition("round","option");
    assert.equal(requests.filter(url=>url.startsWith("/api/")).length,1);
    assert.equal(requests.filter(url=>url.endsWith("cast_competition_vote")).length,2);
  }finally{globalThis.fetch=previous;if(url===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=url;}
});
