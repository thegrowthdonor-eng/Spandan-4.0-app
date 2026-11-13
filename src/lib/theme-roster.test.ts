import { test } from "node:test";
import assert from "node:assert/strict";
import { questionVisible, themeAnswerError, themeRosterError } from "./theme-roster";

const policy = { themeQuestionKey: "theme", characterQuestionKey: "character", sizes: { "Retro — Solo": 1, "Hero & Villain — Duo": 2 } };
test("character appears only after a valid theme; changing theme retains the name", () => {
  const answers = { theme: "", character: "Joker" };
  assert.equal(questionVisible("character", answers, policy), false);
  assert.equal(questionVisible("theme", answers, policy), true);
  for (const theme of Object.keys(policy.sizes)) {
    answers.theme = theme;
    assert.equal(questionVisible("character", answers, policy), true);
    assert.equal(themeAnswerError(answers, policy), null);
    assert.equal(answers.character, "Joker");
  }
  assert.equal(questionVisible("character", {}, undefined), true);
});
test("registration rejects missing, unknown and oversized answers", () => {
  assert.ok(themeAnswerError({}, policy));
  assert.ok(themeAnswerError({ theme: "toString", character: "A" }, policy));
  assert.ok(themeAnswerError({ theme: "Retro — Solo", character: " \t\n" }, policy));
  assert.ok(themeAnswerError({ theme: "Retro — Solo", character: "a".repeat(501) }, policy));
  assert.equal(themeAnswerError({ theme: "Retro — Solo", character: "a".repeat(500) }, policy), null);
});
test("final rosters require exact sizes and matching themes; incomplete duo drafts are allowed", () => {
  const solo = "Retro — Solo", duo = "Hero & Villain — Duo";
  assert.equal(themeRosterError([solo], policy), null);
  assert.equal(themeRosterError([duo, duo], policy), null);
  assert.equal(themeRosterError([duo], policy, false), null);
  for (const themes of [[], [duo], [solo, solo], [solo, duo], [duo, duo, duo], [undefined]]) assert.ok(themeRosterError(themes, policy));
  assert.equal(themeRosterError(["Other"], undefined), null);
});
