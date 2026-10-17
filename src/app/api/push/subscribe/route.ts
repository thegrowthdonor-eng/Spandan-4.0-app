import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { pushSubscribeSchema, pushUnsubscribeSchema } from "@/server/auth/contracts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "Cache-Control": "no-store" };

// Default public VAPID key if not configured in environment
const DEFAULT_VAPID_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ||
  "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBKr3qBUYhHBQFLXY5cev48HY";

export async function GET() {
  return NextResponse.json({ ok: true, publicKey: DEFAULT_VAPID_PUBLIC_KEY }, { headers });
}

export async function POST(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Push notification service is temporarily unavailable." }, { status: 503, headers });
  }

  const payload = await request.json().catch(() => null);
  const parsed = pushSubscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid push subscription payload." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Sign in required to activate push alerts." }, { status: 401, headers });
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  const authUser = (await client.auth.getUser()).data.user;
  if (!authUser) return denied;

  const { data, error } = await client.rpc("upsert_push_subscription", {
    p_endpoint: parsed.data.endpoint,
    p_p256dh: parsed.data.p256dh,
    p_auth: parsed.data.auth,
    p_user_agent: parsed.data.userAgent ?? request.headers.get("user-agent") ?? null,
  });

  if (error) {
    return NextResponse.json({ error: "Could not save push subscription." }, { status: 500, headers });
  }

  return NextResponse.json({ ok: true, data }, { headers });
}

export async function DELETE(request: Request) {
  if (!hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Service unavailable." }, { status: 503, headers });
  }

  const payload = await request.json().catch(() => null);
  const parsed = pushUnsubscribeSchema.safeParse(payload);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid endpoint." }, { status: 400, headers });
  }

  const denied = NextResponse.json({ error: "Sign in required." }, { status: 401, headers });
  const cookieStore = await cookies();
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: { secure: process.env.NODE_ENV === "production", sameSite: "lax", httpOnly: true, path: "/" },
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (entries) => entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    }
  );

  const authUser = (await client.auth.getUser()).data.user;
  if (!authUser) return denied;

  const { error } = await client.rpc("remove_push_subscription", {
    p_endpoint: parsed.data.endpoint,
  });

  if (error) {
    return NextResponse.json({ error: "Failed to remove subscription." }, { status: 500, headers });
  }

  return NextResponse.json({ ok: true }, { headers });
}
