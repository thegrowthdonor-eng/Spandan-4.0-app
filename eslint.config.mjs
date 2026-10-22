import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypescript,
  // Audit evidence and one-off content tooling are not shipped application code.
  globalIgnores([".next/**", "node_modules/**", "audit-artifacts/**", "scratch/**"]),
]);
