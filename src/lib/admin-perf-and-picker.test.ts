import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import ts from "typescript";
import { filterPickableEvents, pickableCategories, type PickableEvent } from "./admin-event-picker";
import { adminEventsFromSummary, competitionEventsFromSummary, type ManagementSummary } from "./management";

function loadTsModule(relativePath: string, modules: Record<string, unknown>) {
  const source = readFileSync(new URL(relativePath, import.meta.url), "utf8");
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  const exports: Record<string, unknown> = {};
  const moduleObj = { exports };
  new Script(code).runInNewContext({
    exports,
    module: moduleObj,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency ${name} in ${relativePath}`);
      return modules[name];
    },
    process,
    console,
    Buffer,
    URL,
    Response,
    Request,
    Promise,
  });
  return moduleObj.exports as Record<string, unknown>;
}

const sampleSummary: ManagementSummary = {
  isAdmin: true,
  canVerify: true,
  canCreate: true,
  canNotice: true,
  canGallery: true,
  canLive: true,
  canHelp: true,
  roles: ["main_admin"],
  events: [
    { id: "ev-1", title: "Cricket Cup", category: "sport", format: "sport", state: "published", operating_method: "live_matches", registration_enabled: true },
  ],
  editableEvents: [
    { id: "ev-1", title: "Cricket Cup", category: "sport", format: "sport", state: "published", operating_method: "live_matches", registration_enabled: true },
    { id: "ev-2", title: "Opening Ceremony", category: "cultural", format: "group", state: "published", operating_method: "programme", registration_enabled: false },
  ],
  pendingVerification: 2,
};

test("management summary helpers derive competition and admin events without extra RPCs", () => {
  assert.deepEqual(competitionEventsFromSummary(sampleSummary).map((e) => e.id), ["ev-1", "ev-2"]);
  assert.deepEqual(adminEventsFromSummary(sampleSummary).map((e) => e.id), ["ev-1", "ev-2"]);
});

test("AdminLayout uses management summary first and calls getUser only when summary fails", async () => {
  const jsxRuntime = { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
  let getUserCalls = 0;
  let summaryResult: ManagementSummary | null = sampleSummary;
  let signedIn = false;
  const redirectError = (url: string) => {
    const err = new Error(`REDIRECT:${url}`);
    throw err;
  };
  const mod = loadTsModule("../app/admin/layout.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { redirect: redirectError },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
    "@/server/supabase/server": {
      createRequestClient: async () => ({
        auth: { getUser: async () => { getUserCalls++; return { data: { user: signedIn ? { id: "u-1" } : null } }; } },
      }),
    },
    "@/server/management": { getManagementSummary: async () => summaryResult },
    "@/lib/management": { canEnterManagement: () => true },
    "@/components/admin/workspace-shell": { WorkspaceShell: () => null },
    "./portal.css": {},
  });
  const AdminLayout = mod.default as (props: { children: unknown }) => Promise<unknown>;

  await AdminLayout({ children: null });
  assert.equal(getUserCalls, 0);

  summaryResult = null;
  signedIn = false;
  await assert.rejects(() => AdminLayout({ children: null }), /REDIRECT:\/account\?next=\/admin/);
  assert.equal(getUserCalls, 1);

  signedIn = true;
  const unavailable = await AdminLayout({ children: null }) as { props: { className?: string } };
  assert.equal(getUserCalls, 2);
  assert.equal(unavailable.props.className, "portal-unavailable");
});

test("AdminControlPage reuses management summary without getUser, is_main_admin, or list_all_events_for_admin", async () => {
  const jsxRuntime = { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
  const rpcCalls: string[] = [];
  let getUserCalls = 0;
  const mod = loadTsModule("../app/admin/control/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
    "@/server/supabase/server": {
      createRequestClient: async () => ({
        auth: { getUser: async () => { getUserCalls++; return { data: { user: { id: "u-1" } } }; } },
        rpc: async (fn: string) => { rpcCalls.push(fn); return { data: [], error: null }; },
      }),
    },
    "@/server/management": { getManagementSummary: async () => sampleSummary },
    "@/lib/management": { adminEventsFromSummary },
    "./committee-control": { CommitteeControl: () => null },
    "./senior-invites": { SeniorInvites: () => null },
    "./festival-settings": { FestivalSettings: () => null },
    "@/lib/event-categories": { countRolePeople: () => 0 },
    "../admin.css": {},
  });
  const AdminControlPage = mod.default as () => Promise<unknown>;
  await AdminControlPage();

  assert.equal(getUserCalls, 0);
  assert.deepEqual(rpcCalls.sort(), ["list_admin_editions", "list_committee_candidates", "list_committee_members"]);
});

test("FixturesPage reuses management summary, parallelises competition_workspace, and renders full AdminEventPicker", async () => {
  const jsxRuntime = { jsx: (type: unknown, props: unknown) => ({ type, props }), jsxs: (type: unknown, props: unknown) => ({ type, props }) };
  const rpcCalls: string[] = [];
  let getUserCalls = 0;
  let workspaceStartedBeforeFixturesResolved = false;
  let releaseFixtures!: () => void;
  const fixturesGate = new Promise<void>((resolve) => { releaseFixtures = resolve; });
  let pickerProps: Record<string, unknown> | null = null;

  const mod = loadTsModule("../app/admin/fixtures/page.tsx", {
    "react/jsx-runtime": jsxRuntime,
    "next/link": () => null,
    "next/navigation": { redirect: (url: string) => { throw new Error(`REDIRECT:${url}`); } },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
    "@/server/supabase/server": {
      createRequestClient: async () => ({
        auth: { getUser: async () => { getUserCalls++; return { data: { user: { id: "u-1" } } }; } },
        rpc: async (fn: string) => {
          rpcCalls.push(fn);
          if (fn === "competition_workspace") {
            workspaceStartedBeforeFixturesResolved = true;
            releaseFixtures();
          }
          return { data: fn === "competition_workspace" ? { event: sampleSummary.events[0], staff: true, settings: null, candidates: [], sessions: [], entries: [], rounds: [], placements: [] } : [], error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { venue: "Main Ground", starts_at: null, ends_at: null, score_template: "generic", operating_method: "live_matches" }, error: null }),
            }),
          }),
        }),
      }),
    },
    "@/server/management": { getManagementSummary: async () => sampleSummary },
    "@/lib/management": { competitionEventsFromSummary },
    "@/server/competition/fixtures": {
      loadEventFixtures: async () => {
        await fixturesGate;
        return { fixtures: [], error: false };
      },
    },
    "./fixtures-client": { FixturesClient: () => null },
    "@/components/admin/event-picker": {
      AdminEventPicker: (props: Record<string, unknown>) => { pickerProps = props; return null; },
    },
    "@/components/admin/competition-workspace": { CompetitionWorkspacePanel: () => null },
    "./fixtures.css": {},
  });

  function findElement(node: unknown, target: unknown): Record<string, unknown> | null {
    if (!node || typeof node !== "object") return null;
    const el = node as { type?: unknown; props?: Record<string, unknown> };
    if (el.type === target) return el.props ?? {};
    const children = el.props?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        const hit = findElement(child, target);
        if (hit) return hit;
      }
    } else if (children) {
      return findElement(children, target);
    }
    return null;
  }

  const FixturesPage = mod.default as (args: { searchParams: Promise<{ event?: string }> }) => Promise<unknown>;
  const tree = await FixturesPage({ searchParams: Promise.resolve({}) });

  assert.equal(getUserCalls, 0);
  assert.equal(workspaceStartedBeforeFixturesResolved, true);
  assert.equal(rpcCalls.includes("is_main_admin"), false);
  assert.equal(rpcCalls.includes("list_competition_events"), false);
  const pickerArgs = findElement(tree, mod ? (tree as { props?: { children?: unknown[] } }).props?.children?.find((c) => (c as { props?: { basePath?: string } })?.props?.basePath === "/admin/fixtures")?.valueOf() && undefined : undefined);
  void pickerArgs;
  const serialized = JSON.stringify(tree);
  assert.match(serialized, /"basePath":"\/admin\/fixtures"/);
  assert.doesNotMatch(serialized, /"compact":true/);
  void pickerProps;
});

test("POST /api/admin/committee skips getUser, relies on RPC auth, and returns changed assignment", async () => {
  let getUserCalls = 0;
  let rpcError: { code: string; message: string } | null = null;
  const createdRow = {
    id: "11111111-1111-4111-8111-111111111111",
    profile_id: "22222222-2222-4222-8222-222222222222",
    role: "treasurer",
    event_id: null,
    event_category: null,
    granted_at: "2026-11-12T10:00:00Z",
  };
  const mod = loadTsModule("../app/api/admin/committee/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) },
    "@supabase/ssr": {
      createServerClient: () => ({
        auth: { getUser: async () => { getUserCalls++; return { data: { user: null } }; } },
        rpc: async (fn: string) => {
          if (rpcError) return { data: null, error: rpcError };
          if (fn === "assign_committee_role") return { data: createdRow, error: null };
          return { data: null, error: null };
        },
      }),
    },
    "@/server/auth/contracts": {
      committeeRoleSchema: { safeParse: (v: unknown) => ({ success: true, data: v }) },
    },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
  });
  const POST = mod.POST as (req: Request) => Promise<Response>;

  const assignRes = await POST(new Request("https://spandan.test/api/admin/committee", {
    method: "POST",
    headers: { origin: "https://spandan.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "assign", profileId: createdRow.profile_id, role: "treasurer", eventId: null, eventCategory: null }),
  }));
  assert.equal(getUserCalls, 0);
  assert.equal(assignRes.status, 200);
  const assignJson = await assignRes.json() as { ok: boolean; assignment: typeof createdRow };
  assert.equal(assignJson.ok, true);
  assert.deepEqual(assignJson.assignment, createdRow);

  const revokeRes = await POST(new Request("https://spandan.test/api/admin/committee", {
    method: "POST",
    headers: { origin: "https://spandan.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke", assignmentId: createdRow.id }),
  }));
  assert.equal(revokeRes.status, 200);
  assert.deepEqual(await revokeRes.json(), { ok: true, revokedAssignmentId: createdRow.id });

  rpcError = { code: "42501", message: "Not authorised" };
  const deniedRes = await POST(new Request("https://spandan.test/api/admin/committee", {
    method: "POST",
    headers: { origin: "https://spandan.test", "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke", assignmentId: createdRow.id }),
  }));
  assert.equal(deniedRes.status, 403);
  assert.equal(getUserCalls, 0);
});

test("POST /api/admin/fixtures returns canonical updated fixtures on create, reschedule, reminders, and delete", async () => {
  const eventId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const fixtureId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const canonicalFixtures = [
    { fixture_id: fixtureId, stage: "Final", participant_a_label: "Batch 2023", participant_b_label: "Batch 2024", venue: "Ground", reporting_at: null, starts_at: "2026-12-02T10:00:00Z", state: "scheduled", schedule_version: 1, score_version: 1, score_status: null, score_payload: null, actual_started_at: null },
  ];
  const mod = loadTsModule("../app/api/admin/fixtures/route.ts", {
    "next/server": { NextResponse: { json: Response.json } },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) },
    "@supabase/ssr": {
      createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: "admin-1" } } }) },
        rpc: async (fn: string) => {
          if (fn === "create_fixture" || fn === "reschedule_fixture") return { data: { id: fixtureId, event_id: eventId }, error: null };
          if (fn === "generate_fixture_reminders") return { data: 12, error: null };
          if (fn === "delete_fixture") return { data: true, error: null };
          return { data: true, error: null };
        },
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { event_id: eventId }, error: null }),
            }),
          }),
        }),
      }),
    },
    "@/server/competition/scores": { validateScore: () => undefined },
    "@/server/competition/fixture-request": {
      parseFixturePayload: (body: unknown) => ({ success: true, command: body }),
    },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
    "@/server/competition/fixtures": {
      loadEventFixtures: async (_client: unknown, targetEventId: string) => {
        assert.equal(targetEventId, eventId);
        return { fixtures: canonicalFixtures, error: false };
      },
    },
    "@/server/supabase/admin": {
      createAdminClient: () => ({
        from: () => ({
          select: () => ({
            eq: () => ({
              single: async () => ({ data: { id: fixtureId, event_id: eventId, stage: "Final", participant_a_label: "A", participant_b_label: "B", state: "published", starts_at: null, registration_enabled: true }, error: null }),
            }),
          }),
        }),
      }),
    },
  });
  const POST = mod.POST as (req: Request) => Promise<Response>;

  for (const payload of [
    { action: "create", eventId, stage: "Final", participantALabel: "A", participantBLabel: "B", venue: "Ground", reportingAt: null, startsAt: "2026-12-02T10:00:00Z" },
    { action: "reschedule", fixtureId, reportingAt: null, startsAt: "2026-12-02T11:00:00Z", venue: "Court", reason: "Weather" },
    { action: "reminders", fixtureId, body: "Report early" },
    { action: "delete", fixtureId },
  ]) {
    const res = await POST(new Request("https://spandan.test/api/admin/fixtures", {
      method: "POST",
      headers: { origin: "https://spandan.test", "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }));
    assert.equal(res.status, 200);
    const json = await res.json() as { ok: boolean; fixtures?: typeof canonicalFixtures };
    assert.equal(json.ok, true);
    assert.deepEqual(json.fixtures, canonicalFixtures);
  }
});

test("client panels avoid blocking router.refresh() on fixture and competition workspace saves", () => {
  const fixturesClient = readFileSync(new URL("../app/admin/fixtures/fixtures-client.tsx", import.meta.url), "utf8");
  const workspacePanel = readFileSync(new URL("../components/admin/competition-workspace.tsx", import.meta.url), "utf8");
  const committeeControl = readFileSync(new URL("../app/admin/control/committee-control.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(fixturesClient, /router\.refresh\(/);
  assert.match(fixturesClient, /setMatchList\(result\.fixtures\)/);
  assert.doesNotMatch(workspacePanel, /router\.refresh\(/);
  assert.match(workspacePanel, /setWorkspace\(fresh\.workspace\)/);
  assert.match(committeeControl, /startTransition\(\(\) => \{ router\.refresh\(\); \}\)/);
  assert.match(committeeControl, /setMemberList/);
});

test("event picker search filters by title, format, status, category and supports no-result + selected retention", () => {
  const events: PickableEvent[] = [
    { id: "1", title: "Cricket Premier", category: "sport", format: "sport", state: "open" },
    { id: "2", title: "Classical Solo", category: "cultural", format: "solo", state: "published" },
    { id: "3", title: "Canvas Sketch", category: "creative", format: "pair", state: "ongoing" },
  ];
  assert.deepEqual(pickableCategories(events), ["sport", "cultural", "creative"]);
  assert.deepEqual(filterPickableEvents(events, "cricket", "all").map((e) => e.id), ["1"]);
  assert.deepEqual(filterPickableEvents(events, "pair", "all").map((e) => e.id), ["3"]);
  assert.deepEqual(filterPickableEvents(events, "published", "all").map((e) => e.id), ["2"]);
  assert.deepEqual(filterPickableEvents(events, "Arts", "all").map((e) => e.id), ["3"]);
  assert.deepEqual(filterPickableEvents(events, "", "cultural").map((e) => e.id), ["2"]);
  assert.deepEqual(filterPickableEvents(events, "nonexistent", "all"), []);

  const pickerSource = readFileSync(new URL("../components/admin/event-picker.tsx", import.meta.url), "utf8");
  assert.match(pickerSource, /No matching events/);
  assert.match(pickerSource, /· current event/);
  assert.match(pickerSource, /\?event=\$\{encodeURIComponent\(event\.target\.value\)\}/);
});

