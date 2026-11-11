import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { requireQaEnvironment, failIfError } from "./qa-guard";

async function main() {
  const admin = requireQaEnvironment();
  const base = process.env.QA_APP_URL ?? "http://localhost:3002";
  if (!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base)) throw new Error("Use the isolated local QA application.");
  const edition = (await admin.from("editions").select("id").single()).data!;
  const actor = (await admin.from("staff_assignments").select("profile_id").eq("role", "main_admin").is("revoked_at", null).limit(1).single()).data!.profile_id;
  const marker = `QA Schedule ${randomUUID()}`;
  const rows = ["sport", "opening", "cultural", "evening"].map((category, index) => ({ id: randomUUID(), edition_id: edition.id, source_key: `${marker}-${index}`, day: "2026-12-03", title: `${marker} ${index}`, category, published: true, venue: index === 3 ? null : "QA Test Venue", starts_at: index === 3 ? null : `2026-12-03T${index === 1 ? "08" : index === 0 ? "09" : "10"}:30:00+05:30`, sort_order: index }));
  const require = createRequire(import.meta.url);
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright");
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_EXECUTABLE } : {}) });
  try {
    failIfError((await admin.from("schedule_entries").insert(rows)).error, "Create scoped QA programme");
    failIfError((await admin.from("programme_live_states").insert(rows.map((row, index) => ({ schedule_entry_id: row.id, status: ["scheduled", "live", "completed", "cancelled"][index], updated_by: actor })))).error, "Create scoped QA statuses");
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const errors: string[] = []; page.on("pageerror", (error: Error) => errors.push(error.message));
    await page.goto(`${base}/schedule?day=2026-12-03&q=${encodeURIComponent(marker)}`);
    const cards = page.locator("ol li");
    await cards.first().waitFor();
    assert.equal(await cards.count(), 4);
    assert.equal(await cards.nth(0).locator("h3").innerText(), rows[1].title, "Agenda ignored chronological order");
    assert.equal(await cards.nth(1).locator("h3").innerText(), rows[0].title);
    assert.equal(await page.getByRole("region", { name: "Time to be announced", exact: true }).locator("li").count(), 1);
    await page.getByText(/Venue to be announced/).waitFor();
    for (const status of ["Scheduled", "Live", "Finished", "Cancelled"]) assert.ok(await cards.getByText(status, { exact: true }).count() > 0, `Missing ${status} status`);
    const requests: string[] = []; page.on("request", (request: { url(): string }) => { const url=new URL(request.url());if (url.pathname==="/schedule"&&url.searchParams.has("_rsc")) requests.push(request.url()); });
    for (const category of ["Ceremony", "Sports", "Arts & culture", "Evening"]) {
      await page.getByRole("button", { name: category, exact: true }).click();
      assert.equal(await cards.count(), 1, `Category ${category} omitted its event`);
    }
    await page.getByRole("button", { name: "All events", exact: true }).click();
    await page.getByLabel("Search events, teams or venues").fill(marker + " nothing-matches");
    await page.getByRole("heading", { name: "No matching events", exact: true }).waitFor();
    assert.deepEqual(requests, [], "Schedule controls fetched the server on each filter/search");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.setViewportSize({ width: 1440, height: 1000 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.deepEqual(errors, []);
    console.log("Schedule QA passed: chronology, unknown timings, venue fallback, all categories/statuses, empty search, mobile/desktop and zero filter RSC requests.");
  } finally {
    await browser.close();
    failIfError((await admin.from("schedule_entries").delete().in("id", rows.map(row => row.id))).error, "Remove only tracked QA programme rows");
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
