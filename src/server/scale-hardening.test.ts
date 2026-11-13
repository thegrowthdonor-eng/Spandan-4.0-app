import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { Script } from "node:vm";
import ts from "typescript";

function transpileAndRun(relativePath: string, modules: Record<string, unknown>) {
  const exports: Record<string, unknown> = {};
  const code = ts.transpileModule(readFileSync(new URL(relativePath, import.meta.url), "utf8"), {
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
    Date,
    Promise,
    Map,
    Set,
  });
  return exports;
}

test("coalesceCached collapses 1,000 concurrent callers into a single upstream call and recovers after errors", async () => {
  let loaderCalls = 0;
  let shouldFail = true;

  const { coalesceCached } = transpileAndRun("./public-cache.ts", {
    "server-only": {},
    "next/cache": {
      revalidateTag: () => {},
      unstable_cache: (fn: () => Promise<unknown>) => () => fn(),
    },
  }) as {
    coalesceCached: <T>(key: string, tags: string[], revalidate: number, loader: () => Promise<T>) => Promise<T>;
  };

  await assert.rejects(
    () =>
      coalesceCached("fail-once", ["tag"], 30, async () => {
        loaderCalls += 1;
        if (shouldFail) throw new Error("transient failure");
        return "ok";
      }),
    /transient failure/,
  );

  shouldFail = false;
  const results = await Promise.all(
    Array.from({ length: 1000 }, () =>
      coalesceCached("burst-key", ["tag"], 30, async () => {
        loaderCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { count: 42 };
      }),
    ),
  );

  assert.equal(loaderCalls, 2);
  assert.equal(results.length, 1000);
  assert.ok(results.every((item) => item.count === 42));
});

test("proxy skips Supabase client creation and getClaims when no sb- auth cookie exists", async () => {
  let supabaseCalls = 0;
  const deletedCookies: string[] = [];

  function makeNextResponse() {
    return {
      cookies: {
        set: () => {},
        delete: (name: string) => deletedCookies.push(name),
      },
      headers: new Map<string, string>(),
    };
  }

  const { proxy } = transpileAndRun("../proxy.ts", {
    "@supabase/ssr": {
      createServerClient: () => {
        supabaseCalls += 1;
        return { auth: { getClaims: async () => ({ data: { claims: null } }) } };
      },
    },
    "next/server": {
      NextResponse: {
        next: () => makeNextResponse(),
        redirect: () => makeNextResponse(),
        json: Response.json,
      },
    },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
  }) as {
    proxy: (request: {
      url: string;
      nextUrl: URL;
      cookies: {
        getAll: () => Array<{ name: string; value: string }>;
        get: (name: string) => { value: string } | undefined;
        set: () => void;
      };
    }) => Promise<unknown>;
  };

  const guestUrl = new URL("https://spandan.test/events");
  await proxy({
    url: guestUrl.toString(),
    nextUrl: guestUrl,
    cookies: { getAll: () => [], get: () => undefined, set: () => {} },
  });
  assert.equal(supabaseCalls, 0);

  await proxy({
    url: guestUrl.toString(),
    nextUrl: guestUrl,
    cookies: {
      getAll: () => [{ name: "spandan_ui_nav", value: "member" }],
      get: (name: string) => (name === "spandan_ui_nav" ? { value: "member" } : undefined),
      set: () => {},
    },
  });
  assert.equal(supabaseCalls, 0);
  assert.deepEqual(deletedCookies, ["spandan_ui_nav"]);
});

test("getActiveSession short-circuits guests without creating a Supabase client", async () => {
  let clientCreated = 0;
  const { getActiveSession } = transpileAndRun("./auth/access.ts", {
    "server-only": {},
    react: { cache: <T>(fn: T) => fn },
    "next/headers": { cookies: async () => ({ getAll: () => [] }) },
    "@/server/supabase/server": {
      createRequestClient: async () => {
        clientCreated += 1;
        return {};
      },
    },
  }) as { getActiveSession: () => Promise<unknown> };

  assert.equal(await getActiveSession(), null);
  assert.equal(clientCreated, 0);
});

test("existing staff sessions recover their management nav hint without rechecking every request", async () => {
  const written: string[] = [];
  let roleChecks = 0;
  const { proxy } = transpileAndRun("../proxy.ts", {
    "@supabase/ssr": { createServerClient: () => ({
      auth: { getClaims: async () => ({ data: { claims: { sub: "staff-user" } } }) },
      rpc: async () => { roleChecks += 1; return { data: true, error: null }; },
    }) },
    "next/server": { NextResponse: { next: () => ({ cookies: {
      set: (_name: string, value: string) => written.push(value), delete: () => {},
    } }) } },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true },
  }) as { proxy: (request: unknown) => Promise<unknown> };
  const url = new URL("https://spandan.test/events");
  for (const hint of [undefined, "staff"]) {
    await proxy({ url: url.toString(), nextUrl: url, cookies: {
      getAll: () => [{ name: "sb-test-auth-token", value: "session" }],
      get: () => hint ? { value: hint } : undefined,
      set: () => {},
    } });
  }
  assert.deepEqual(written, ["staff"]);
  assert.equal(roleChecks, 1);
});
