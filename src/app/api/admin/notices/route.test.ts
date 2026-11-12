import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";
import { publicNoticeSchema } from "@/server/auth/contracts";
import { listAdminNotices } from "@/server/notices";

const VALID_NOTICE_ID = "11111111-1111-4111-8111-111111111111";
const VALID_EDITION_ID = "22222222-2222-4222-8222-222222222222";

function loadNoticeRoute({
  signedIn = true,
  permitted = true,
  existing = {
    id: VALID_NOTICE_ID,
    edition_id: VALID_EDITION_ID,
    event_id: null,
    title: "Venue changed",
    audience: "public",
    urgency: "important",
    publish_at: "2026-10-18T10:00:00Z",
  } as Record<string, unknown> | null,
  remainingNotices = [
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Opening bell",
      body: "Report at 9 AM.",
      urgency: "normal",
      audience: "public",
      publishAt: "2026-10-18T08:00:00Z",
      expiresAt: null,
      eventTitle: null,
    },
  ],
} = {}) {
  const deletedIds: string[] = [];
  const auditEntries: Array<Record<string, unknown>> = [];
  const revalidated: string[] = [];

  const adminClient = {
    from(table: string) {
      if (table === "notices") {
        return {
          select() {
            return {
              eq(_col: string, id: string) {
                return {
                  async maybeSingle() {
                    return { data: existing && existing.id === id ? existing : null, error: null };
                  },
                };
              },
            };
          },
          delete() {
            return {
              async eq(_col: string, id: string) {
                deletedIds.push(id);
                return { error: null };
              },
            };
          },
        };
      }
      if (table === "audit_log") {
        return {
          async insert(entry: Record<string, unknown>) {
            auditEntries.push(entry);
            return { error: null };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  };

  const modules: Record<string, unknown> = {
    "next/server": {
      NextResponse: {
        json: (body: unknown, init?: ResponseInit) =>
          Object.assign(Response.json(body, init), { cookies: { set: () => {} } }),
      },
    },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) },
    "next/cache": { revalidatePath: (path: string) => revalidated.push(path) },
    "@supabase/ssr": {
      createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: signedIn ? { id: "admin-1" } : null } }) },
        rpc: async (name: string) => {
          if (name === "can_publish_notices") return { data: permitted, error: null };
          if (name === "publish_public_notice") return { data: { id: VALID_NOTICE_ID }, error: null };
          throw new Error(`Unexpected RPC ${name}`);
        },
      }),
    },
    "@/server/auth/contracts": { publicNoticeSchema },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true, hasSupabaseConfiguration: () => true },
    "@/server/notices": { listAdminNotices: async () => remainingNotices },
    "@/server/push": { broadcastNoticePush: async () => ({ sent: 1 }) },
    "@/server/supabase/admin": { createAdminClient: () => adminClient },
  };

  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL("./route.ts", import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;

  new Script(code).runInNewContext({
    exports,
    require: (name: string) => {
      assert.ok(name in modules, `Unexpected dependency ${name}`);
      return modules[name];
    },
    process,
    console,
    URL,
  });

  return {
    post: exports.POST as (request: Request) => Promise<Response>,
    del: exports.DELETE as (request: Request) => Promise<Response>,
    deletedIds,
    auditEntries,
    revalidated,
  };
}

function makeDeleteRequest(body: unknown, origin = "https://spandan.test") {
  return new Request("https://spandan.test/api/admin/notices", {
    method: "DELETE",
    headers: { "Content-Type": "application/json", origin },
    body: JSON.stringify(body),
  });
}

test("DELETE rejects cross-origin, malformed UUID, unauthenticated, and unauthorized callers", async () => {
  const foreign = await loadNoticeRoute().del(makeDeleteRequest({ noticeId: VALID_NOTICE_ID }, "https://evil.test"));
  assert.equal(foreign.status, 403);

  const badId = await loadNoticeRoute().del(makeDeleteRequest({ noticeId: "not-a-uuid" }));
  assert.equal(badId.status, 400);

  const anonRoute = loadNoticeRoute({ signedIn: false });
  assert.equal((await anonRoute.del(makeDeleteRequest({ noticeId: VALID_NOTICE_ID }))).status, 403);
  assert.deepEqual(anonRoute.deletedIds, []);

  const forbiddenRoute = loadNoticeRoute({ permitted: false });
  assert.equal((await forbiddenRoute.del(makeDeleteRequest({ noticeId: VALID_NOTICE_ID }))).status, 403);
  assert.deepEqual(forbiddenRoute.deletedIds, []);
  assert.deepEqual(forbiddenRoute.auditEntries, []);
});

test("DELETE returns 404 when the notice no longer exists", async () => {
  const route = loadNoticeRoute({ existing: null });
  const response = await route.del(makeDeleteRequest({ noticeId: VALID_NOTICE_ID }));
  assert.equal(response.status, 404);
  assert.deepEqual(route.deletedIds, []);
  assert.deepEqual(route.revalidated, []);
});

test("DELETE removes the notice, records audit log, revalidates routes, and returns updated notices", async () => {
  const route = loadNoticeRoute();
  const response = await route.del(makeDeleteRequest({ noticeId: VALID_NOTICE_ID }));
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; deletedId: string; notices: Array<{ id: string }> };
  assert.equal(payload.ok, true);
  assert.equal(payload.deletedId, VALID_NOTICE_ID);
  assert.equal(payload.notices.length, 1);
  assert.deepEqual(route.deletedIds, [VALID_NOTICE_ID]);
  assert.equal(route.auditEntries.length, 1);
  assert.equal(route.auditEntries[0]?.action, "notice.deleted");
  assert.equal(route.auditEntries[0]?.object_id, VALID_NOTICE_ID);
  assert.deepEqual(route.revalidated, ["/notices", "/feed", "/home", "/admin/notices"]);
});

test("POST revalidates notice routes and returns canonical updated notices", async () => {
  const route = loadNoticeRoute();
  const response = await route.post(
    new Request("https://spandan.test/api/admin/notices", {
      method: "POST",
      headers: { "Content-Type": "application/json", origin: "https://spandan.test" },
      body: JSON.stringify({
        editionId: VALID_EDITION_ID,
        title: "Opening bell",
        body: "Report at 9 AM.",
        urgency: "normal",
        expiresAt: null,
      }),
    }),
  );
  assert.equal(response.status, 200);
  const payload = (await response.json()) as { ok: boolean; notices: Array<{ id: string }> };
  assert.equal(payload.ok, true);
  assert.equal(payload.notices.length, 1);
  assert.deepEqual(route.revalidated, ["/notices", "/feed", "/home", "/admin/notices"]);
});

test("listAdminNotices maps both array and object event relations safely", async () => {
  const fakeClient = {
    from() {
      return {
        select() {
          return {
            order() {
              return {
                async limit() {
                  return {
                    data: [
                      {
                        id: "1",
                        title: "Notice A",
                        body: "Body A",
                        urgency: "urgent",
                        audience: "public",
                        publish_at: "2026-10-18T10:00:00Z",
                        expires_at: null,
                        events: { title: "Cricket" },
                      },
                      {
                        id: "2",
                        title: "Notice B",
                        body: "Body B",
                        urgency: "normal",
                        audience: "public",
                        publish_at: "2026-10-18T09:00:00Z",
                        expires_at: null,
                        events: [{ title: "Quiz" }],
                      },
                    ],
                    error: null,
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const list = await listAdminNotices(fakeClient as never);
  assert.deepEqual(
    list.map((item) => [item.id, item.eventTitle]),
    [
      ["1", "Cricket"],
      ["2", "Quiz"],
    ],
  );
});

