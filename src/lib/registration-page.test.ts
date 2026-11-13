import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import React from "react";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as status from "./registration-status";
import * as theme from "./theme-roster";
import * as operations from "./event-operations";
import * as categories from "./event-categories";

const Dock = () => null;
const Component = () => null;
const source = readFileSync(new URL("../app/events/[slug]/page.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

async function renderDock(format: string, options: { gender?: string; failed?: boolean; state?: string; opens?: string; verified?: boolean } = {}) {
  const event = { id: "event", edition_id: "edition", slug: "football", title: "Football", category: "sport", format, registration_enabled: true, state: options.state ?? "open", operating_method: "live_matches", summary: "Football", rules_markdown: "Play fairly", venue: "Ground", starts_at: null, ends_at: null, reporting_at: null, application_opens_at: options.opens ?? "2000-01-01T00:00:00Z", application_closes_at: "2099-01-01T00:00:00Z", application_questions: [], eligibility: { division: "boys" }, group_min_size: 2, group_max_size: 15 };
  function query(data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = { select: () => chain, eq: () => chain, neq: () => chain, maybeSingle: async () => result, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return chain;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "verified-ug" } }, error: null }) },
    from: (table: string) => query(table === "profiles" ? { gender: options.gender ?? "male", participant_category: "ug" } : table === "access_records" ? { state: "active", verified_at: options.verified === false ? null : "2000-01-01" } : null, options.failed && table === "profiles" ? { message: "upstream failure" } : null),
  };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/headers": { cookies: async () => ({ getAll: () => [{ name: "sb-test-auth-token" }] }) },
    "next/navigation": { notFound: () => { throw Error("Missing event"); } },
    "next/link": { default: Component },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true, hasSupabaseConfiguration: () => false },
    "@/server/public-cache": { coalesceCached: (...args: unknown[]) => (args.at(-1) as () => unknown)(), PUBLIC_CACHE_TAGS: {} },
    "@/server/supabase/admin": { createAdminClient: () => { throw Error("Unexpected admin access"); } },
    "@/server/supabase/public": { createPublicClient: () => ({ from: (table: string) => query(table === "events" ? event : null) }) },
    "@/server/supabase/server": { createRequestClient: async () => client },
    "@/server/supabase/programme-fetch": { programmeCacheTag: "test" },
    "../apply-button": { ApplyButton: Component },
    "../event-registration-dock": { EventRegistrationDock: Dock },
    "../event-participants-dialog": { EventParticipantsDialog: Component },
    "@/components/spandan-branding": { FestTopNav: Component },
    "../events.css": {},
    "@/lib/event-categories": categories, "@/lib/event-operations": operations,
    "@/lib/theme-roster": theme, "@/lib/registration-status": status,
  };
  const moduleObject = { exports: {} as { default: (props: unknown) => Promise<React.ReactElement> } };
  new Script(code).runInNewContext({ module: moduleObject, exports: moduleObject.exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, Date, Intl });
  const page = await moduleObject.exports.default({ params: Promise.resolve({ slug: "football" }) });
  function find(node: React.ReactNode): Record<string, unknown> | null {
    if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null;
    if (node.type === Dock) return node.props;
    for (const child of React.Children.toArray(node.props.children)) { const found = find(child); if (found) return found; }
    return null;
  }
  const dock = find(page);
  assert.ok(dock);
  return dock;
}

test("verified matching-gender UG can register without a captain, partner or team in every format", async () => {
  for (const format of ["solo", "pair", "group", "sport"]) {
    const dock = await renderDock(format);
    assert.equal(dock.href, "#event-registration", format);
    assert.ok(dock.children, "Registration form missing");
  }
});
test("scheduled dates, gender and verification retain distinct registration states", async () => {
  const scheduled = await renderDock("sport", { opens: "2098-01-01T00:00:00Z" });
  assert.equal(scheduled.href, null);
  assert.equal(scheduled.status, "Scheduled");
  assert.equal((await renderDock("sport", { gender: "female" })).status, "Outside your division");
  assert.equal((await renderDock("sport", { verified: false })).status, "Account verification pending");
  const failed = await renderDock("sport", { failed: true });
  assert.equal(failed.status, "Unable to load registration access");
  assert.notEqual(failed.href, "#event-registration");
});
