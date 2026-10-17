import assert from "node:assert/strict";
import test from "node:test";
import { groupSponsors, nextSponsorIndex, sponsorAnchor, sponsorTier, sponsorWebsite, type Sponsor } from "./sponsors";

test("tiers use whole words and a single priority for overlapping labels", () => {
  assert.equal(sponsorTier("TITLE partner"), 0);
  assert.equal(sponsorTier("Diamond partner"), 1);
  assert.equal(sponsorTier("Associate / Gold"), 2);
  assert.equal(sponsorTier("Title & Gold"), 0);
  assert.equal(sponsorTier("Golden supporter"), 3);
});

test("many sponsors retain within-tier order without duplicates", () => {
  const sponsors: Sponsor[] = Array.from({ length: 37 }, (_, i) => ({
    id: String(i), name: `Partner ${i}`, tier: ["Supporter", "Gold", "Title", "Diamond"][i % 4],
    logo_url: "https://example.com/logo.png", logo_alt: "Logo", description: null, website_url: null,
  }));
  const groups = groupSponsors(sponsors);
  assert.deepEqual(groups.map((g) => sponsorTier(g.items[0].tier)), [0, 1, 2, 3]);
  assert.equal(new Set(groups.flatMap((g) => g.items.map((s) => s.id))).size, 37);
  for (const group of groups) {
    assert.deepEqual(group.items, sponsors.filter((s) => sponsorTier(s.tier) === sponsorTier(group.items[0].tier)));
  }
  assert.deepEqual(groupSponsors([]), []);
});

test("promotional links reject executable, relative and credential-bearing URLs", () => {
  for (const url of [null, "", "javascript:alert(1)", "data:text/html,test", "/local", "http://example.com", "https://user:pass@example.com"]) {
    assert.equal(sponsorWebsite(url), null);
  }
  assert.equal(sponsorWebsite("https://example.com/partner"), "https://example.com/partner");
  assert.equal(sponsorAnchor("abc-123"), "sponsor-abc-123");
});

test("visit cursor wraps safely and handles missing or corrupt storage", () => {
  assert.equal(nextSponsorIndex(0, 0), 0);
  assert.equal(nextSponsorIndex(0, 4), 0);
  assert.equal(nextSponsorIndex(4, 5), 3);
  assert.equal(nextSponsorIndex(NaN, 10), 4);
  assert.equal(nextSponsorIndex(-1, 10), 4);
  assert.equal(nextSponsorIndex(100, 10), 4);
});
