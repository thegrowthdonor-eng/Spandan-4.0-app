import assert from "node:assert/strict";
import test from "node:test";
import { competitionSettingsSchema,competitionPreset, draftSessions, parseMeasurement, rankedMeasurements } from "./competition";
test("presets suggest operations without changing participant format", () => {
  assert.equal(competitionPreset("Photography").result_mode, "public_vote");
  assert.equal(competitionPreset("Fashion show").result_mode, "faculty_places");
  assert.equal(competitionPreset("Relay").schedule_mode, "heat");
  assert.equal(competitionPreset("Opening", false).result_mode, "none");
  assert.equal(competitionSettingsSchema.safeParse({...competitionPreset("Photography"),result_mode:"time"}).success,false);
  for (const title of ["Football","Cricket","Badminton","Chess","Carrom"]) assert.equal(competitionPreset(title).schedule_mode,"match");
  for (const title of ["Shot put","Discus","Javelin","Long jump"]) assert.equal(competitionPreset(title).result_mode,"distance");
  for (const title of ["Pushups","Skipping"]) assert.equal(competitionPreset(title).result_mode,"count");
  assert.notEqual(competitionPreset("Mehndi").result_mode,"public_vote","Voting must not be imposed on all creative events");
});
test("draft allocation preserves input order and rejects duplicate entrants", () => {
  const entrants = ["a","b","c"].map(key => ({ key, label: key, application_id: key, group_id: null }));
  assert.deepEqual(draftSessions(entrants,2).map(rows => rows.map(r=>r.key)), [["a","b"],["c"]]);
  assert.throws(()=>draftSessions([entrants[0],entrants[0]],2));
});
test("measurements use integer units and tied suggestions never pick an arbitrary winner", () => {
  assert.equal(parseMeasurement("1:02.125","time"),62125);
  assert.equal(parseMeasurement("6.125","distance"),6125);
  assert.throws(()=>parseMeasurement("1:60","time"));
  assert.throws(()=>parseMeasurement("99999999999999999999999:00","time"));
  assert.equal(parseMeasurement(" 12.125 ","time"),12125);
  assert.throws(()=>parseMeasurement("1.2","count"));
  const rows = rankedMeasurements([{status:"valid" as const,attempts:[1000],placing:null},{status:"valid" as const,attempts:[1000],placing:null},{status:"dq" as const,attempts:[500],placing:null}],"time");
  assert.deepEqual(rows.map(r=>r.suggestedPlace),[1,1,null]); assert.equal(rows[0].tied,true);
});
