import assert from "node:assert/strict";
import test from "node:test";
import {validateMediaManifest,type MediaManifest} from "./media-migration";
test("migration manifests reject foreign sources, traversal and unapproved columns",()=>{
  const manifest:MediaManifest={version:1,projectUrl:"https://qa.supabase.co",targetBase:null,createdAt:"now",items:[{id:"one",sourceUrl:"https://qa.supabase.co/storage/v1/object/public/fest-media/gallery/photo.webp",key:"gallery/photo.webp",references:[{table:"events",id:"00000000-0000-4000-8000-000000000001",column:"poster_url",original:"old"}],state:"pending"}]};
  validateMediaManifest(manifest,manifest.projectUrl);
  assert.throws(()=>validateMediaManifest({...manifest,projectUrl:"https://other.supabase.co"},manifest.projectUrl));
  assert.throws(()=>validateMediaManifest({...manifest,items:[{...manifest.items[0],key:"../secret"}]},manifest.projectUrl));
  assert.throws(()=>validateMediaManifest({...manifest,items:[{...manifest.items[0],references:[{...manifest.items[0].references[0],column:"password"}]}]},manifest.projectUrl));
});
