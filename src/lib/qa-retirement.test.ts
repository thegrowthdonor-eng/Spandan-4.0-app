import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { requireQaEnvironment, requireQaPublicEnvironment } from "../../scripts/qa-guard";

test("retired QA scripts cannot create public or privileged database clients", () => {
  assert.throws(requireQaEnvironment, /retired/);
  assert.throws(requireQaPublicEnvironment, /retired/);
  const runner = spawnSync(process.execPath, ["scripts/run-qa-next.mjs", "build"], { encoding: "utf8" });
  assert.equal(runner.status, 1);
  assert.match(runner.stderr, /retired/);
});

test("Next refuses the retired QA database even without a QA flag", () => {
  const result = spawnSync(process.execPath, ["--import", "tsx", "-e", "require('./next.config.ts')"], {
    encoding: "utf8",
    env: { ...process.env, QA_PROJECT_REF: "", NEXT_PUBLIC_SUPABASE_URL: "https://rgcevrvxfunmwephhomy.supabase.co" },
  });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /retired QA database/);
});
