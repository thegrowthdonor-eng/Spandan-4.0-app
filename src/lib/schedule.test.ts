import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { festivalDays, scheduleDay, sortSchedule, type ScheduleEntry } from "./schedule";

test("festival days cover December 3–8 and timestamps group by Indian local date", () => {
  assert.deepEqual(festivalDays, ["2026-12-03", "2026-12-04", "2026-12-05", "2026-12-06", "2026-12-07", "2026-12-08"]);
  assert.equal(scheduleDay("2026-12-02T20:00:00Z"), "2026-12-03");
  assert.equal(scheduleDay(null), "unscheduled");
  assert.equal(scheduleDay("invalid"), "unscheduled");
});
test("timed sessions sort chronologically, untimed sessions preserve brochure order", () => {
  const item = (id: string, sort_order: number, starts_at: string | null): ScheduleEntry => ({ id, sort_order, starts_at, day:"2026-12-03", title:id, category:"sport", venue:null, notes:"" });
  const entries = [item("later",0,"2026-12-03T14:00:00+05:30"),item("unknown2",2,null),item("morning",8,"2026-12-03T09:00:00+05:30"),item("unknown1",1,null)];
  assert.deepEqual(entries.sort(sortSchedule).map(e=>e.id),["morning","later","unknown1","unknown2"]);
});

test("production brochure import has stable, unique source keys", () => {
  const sql = readFileSync(new URL("../../scripts/production-schedule.sql", import.meta.url), "utf8");
  const payload = sql.match(/\$brochure\$(\[[\s\S]*?\])\$brochure\$/)?.[1];
  assert.ok(payload, "production schedule JSON is missing");
  const rows = JSON.parse(payload) as Array<{ source_key?: string }>;
  const keys = rows.map((row) => row.source_key);
  assert.ok(keys.every((key) => /^brochure-2026-[3-8]-\d+-\d+$/.test(key ?? "")));
  assert.equal(new Set(keys).size, keys.length);
});
