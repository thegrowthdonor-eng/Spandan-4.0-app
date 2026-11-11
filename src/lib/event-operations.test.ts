import assert from "node:assert/strict";
import test from "node:test";
import { eventMethod, finalValueLabel, finalValueSchema, suggestedOperations, suggestedScoreTemplate } from "./event-operations";

test("saved operation method wins over titles; board sports, stage and votes route separately", () => {
  for (const title of ["Chess Championship", "Carrom Doubles"]) assert.equal(suggestedOperations(title), "fixtures_only");
  for (const title of ["100m Sprint", "Shot Put", "Creative Writing"]) assert.equal(suggestedOperations(title), "results_only");
  for (const title of ["Solo Singing", "Fashion Show", "Group Dance"]) assert.equal(suggestedOperations(title), "programme");
  assert.equal(suggestedOperations("Rangoli"), "voting");
  assert.equal(suggestedOperations("Table Tennis"), "live_matches");
  assert.equal(suggestedScoreTemplate("Lawn Tennis"), "set_based");
  assert.equal(eventMethod({title:"Rangoli",operating_method:"results_only"}), "results_only");
});
test("manual values preserve zero, reject malformed values and stay separate from batch points", () => {
  assert.equal(finalValueSchema.safeParse("12.450").success, true);
  for (const value of ["-1", "12sec", "NaN", "1.1234"]) assert.equal(finalValueSchema.safeParse(value).success, false);
  assert.equal(finalValueLabel("0", "count"), "0 count");
  assert.equal(finalValueLabel("12.450", "seconds"), "12.45 sec");
  assert.equal(finalValueLabel(null, "metres"), "");
});
