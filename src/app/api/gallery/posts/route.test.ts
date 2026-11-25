import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import { NextResponse } from "next/server";
import ts from "typescript";
import * as gallery from "../../../../lib/gallery";

function route({ authenticated = true, allowed = true, saveFailed = false, savedId = null as string | null } = {}) {
  const calls: string[] = [];
  const deps: Record<string, unknown> = {
    "next/cache": { revalidatePath: () => calls.push("revalidate") },
    "next/server": { NextResponse },
    "@/lib/gallery": gallery,
    "@/server/env": { hasSupabaseConfiguration: () => true },
    "@/server/media/storage": {
      storePublicMedia: async ({ eventId }: { eventId: unknown }) => {
        assert.equal(eventId, null);
        calls.push("store");
      },
      archiveMedia: async () => calls.push("archive"),
    },
    "@/server/public-cache": { invalidatePublicTags: () => calls.push("invalidate"), PUBLIC_CACHE_TAGS: { gallery: "gallery" } },
    "@/server/supabase/admin": {
      createAdminClient: () => ({
        rpc: async (_name: string, input: { p_caption: string }) => {
          assert.equal(input.p_caption, "Campus");
          calls.push("publish");
          return saveFailed ? { error: { code: "42501" } } : { data: "post-id" };
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: savedId ? { id: savedId } : null }) }) }) }),
      }),
    },
    "@/server/supabase/server": {
      createRequestClient: async () => ({
        auth: { getUser: async () => ({ data: { user: authenticated ? { id: "user-id" } : null } }) },
        rpc: async () => ({ data: allowed }),
      }),
    },
  };
  const source = readFileSync(new URL("./route.ts", import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } });
  const exports = {} as { POST: (request: Request) => Promise<Response> };
  new Script(outputText).runInNewContext({ exports, require: (key: string) => deps[key], URL, File, crypto });
  return { post: exports.POST, calls };
}

function upload(photo = "RIFF0000WEBP", origin = "https://fest.test") {
  const form = new FormData();
  form.set("caption", " Campus ");
  form.set("file", new File([photo], "photo.webp", { type: "image/webp" }));
  return new Request("https://fest.test/api/gallery/posts", { method: "POST", headers: { origin }, body: form });
}

test("gallery rejects guests, other batches, cross-origin and invalid images before storage", async () => {
  const guest = route({ authenticated: false });
  const other = route({ allowed: false });
  const eligible = route();
  assert.equal((await guest.post(upload())).status, 401);
  assert.equal((await other.post(upload())).status, 403);
  assert.equal((await eligible.post(upload(undefined, "https://elsewhere.test"))).status, 403);
  assert.equal((await eligible.post(upload("invalid"))).status, 400);
  assert.deepEqual([...guest.calls, ...other.calls, ...eligible.calls], []);
});

test("student photos publish without an event and failed writes archive only unlinked media", async () => {
  const eligible = route();
  assert.equal((await eligible.post(upload())).status, 201);
  assert.deepEqual(eligible.calls, ["store", "publish", "invalidate", "revalidate"]);
  const denied = route({ saveFailed: true });
  assert.equal((await denied.post(upload())).status, 403);
  assert.deepEqual(denied.calls, ["store", "publish", "archive"]);
  const committed = route({ saveFailed: true, savedId: "committed-id" });
  assert.deepEqual(await (await committed.post(upload())).json(), { id: "committed-id" });
  assert.deepEqual(committed.calls, ["store", "publish", "invalidate", "revalidate"]);
});
