import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { optimiseMedia,MAX_MEDIA_BYTES } from "./image";

test("media rejects spoofed, oversized and invalid files, and produces safe WebP variants",async()=>{
  await assert.rejects(()=>optimiseMedia(new Uint8Array(MAX_MEDIA_BYTES+1),"image/png"));
  await assert.rejects(()=>optimiseMedia(Buffer.from("not an image"),"image/png"));
  const png=await sharp({create:{width:800,height:500,channels:3,background:"green"}}).png().toBuffer();
  await assert.rejects(()=>optimiseMedia(png,"image/jpeg"));
  const image=await optimiseMedia(png,"image/png");
  const metadata=await sharp(image.full).metadata();
  assert.equal(metadata.format,"webp");assert.equal(metadata.exif,undefined);assert.equal(image.width,800);
  assert.equal((await sharp(image.thumb).metadata()).width,640);assert.match(image.sha256,/^[a-f0-9]{64}$/);
});
