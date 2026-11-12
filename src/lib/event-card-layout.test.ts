import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css=readFileSync(new URL("../app/events/events.css",import.meta.url),"utf8");
const card=readFileSync(new URL("../app/events/event-catalogue.tsx",import.meta.url),"utf8");
const rule=(selector:string)=>{
  const start=css.indexOf(`${selector} {`);
  assert.ok(start>=0,`Missing ${selector}`);
  return css.slice(start,css.indexOf("}",start)+1);
};
test("catalogue posters retain natural ratios and never zoom-crop on hover",()=>{
  assert.doesNotMatch(rule(".event-card-poster-thumb"),/(?:height|max-height|aspect-ratio)\s*:/);
  assert.match(rule(".event-card-poster-thumb img"),/height:\s*auto/);
  assert.match(rule(".event-card-poster-thumb img"),/object-fit:\s*contain/);
  assert.doesNotMatch(css,/\.event-card:hover\s+\.event-card-poster-thumb img/);
  assert.match(card,/failedPosterUrl !== event.poster_url/);
  assert.match(card,/onError=\{\(\) => setFailedPosterUrl/);
});
test("mobile cards wrap safely and summaries are only two visible lines",()=>{
  assert.match(rule(".event-summary-text"),/-webkit-line-clamp:\s*2/);
  assert.match(rule(".event-summary-text"),/overflow:\s*hidden/);
  assert.match(rule(".event-card-title"),/overflow-wrap:\s*anywhere/);
  assert.match(rule(".event-grid"),/minmax\(min\(100%, 320px\), 1fr\)/);
  assert.match(rule(".event-grid"),/align-items:\s*start/);
  assert.match(card,/View event/);
  assert.match(card,/loading="lazy" decoding="async"/);
  assert.match(card,/\(e.summary \|\| ""\).toLowerCase\(\).includes\(q\)/);
});
