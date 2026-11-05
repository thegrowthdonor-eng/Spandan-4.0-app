import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { parseEnv } from "node:util";

const qaEnvironment = parseEnv(readFileSync(resolve(process.cwd(), ".env.qa.local"), "utf8"));

if (
  qaEnvironment.QA_PROJECT_REF !== "rgcevrvxfunmwephhomy" ||
  qaEnvironment.QA_ALLOW_SEED !== "SPANDAN_VISUAL_QA" ||
  !qaEnvironment.NEXT_PUBLIC_SUPABASE_URL?.includes("rgcevrvxfunmwephhomy")
) {
  throw new Error("Refusing to launch Next: .env.qa.local is not the isolated Spandan Visual QA project.");
}

// Values already in process.env take priority in Next's own loader. Set the
// isolated values here so a developer's production .env.local cannot win.
Object.assign(process.env, qaEnvironment);

const [command, ...args] = process.argv.slice(2);
if (command !== "dev" && command !== "build") {
  throw new Error("Usage: node scripts/run-qa-next.mjs <dev|build> [next arguments]");
}

// Do not use Node's --env-file flag here: Next copies Node exec arguments to
// static workers, where NODE_OPTIONS rejects that flag.
const result = spawnSync(process.execPath, [resolve(process.cwd(), "node_modules/next/dist/bin/next"), command, ...args], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
