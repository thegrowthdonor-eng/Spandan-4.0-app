import { createServerClient } from "@supabase/ssr";
import { revalidatePath, revalidateTag } from "next/cache";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicNoticeSchema } from "@/server/auth/contracts";
import { hasPublicSupabaseConfiguration, hasSupabaseConfiguration } from "@/server/env";
import { listAdminNotices } from "@/server/notices";
import { broadcastNoticePush } from "@/server/push";
import { createAdminClient } from "@/server/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const headers = { "Cache-Control": "no-store" };
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isCrossOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin !== new URL(request.url).origin);
}

async function createNoticeClient(denied: NextResponse) {
  const store = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        httpOnly: true,
        path: "/",
      },
      cookies: {
        getAll: () => store.getAll(),
        setAll: (entries) =>
          entries.forEach(({ name, value, options }) => denied.cookies.set(name, value, options)),
      },
    },
  );
}

function revalidateNoticeRoutes() {
  revalidatePath("/notices");
  revalidatePath("/feed");
  revalidatePath("/home");
  revalidatePath("/admin/notices");
  revalidateTag("public-feed", { expire: 0 });
  revalidateTag("public-notifications", { expire: 0 });
  revalidateTag("public-home", { expire: 0 });
}

export async function POST(request: Request) {
  if (isCrossOrigin(request)) {
    return NextResponse.json({ error: "Invalid notice request." }, { status: 403, headers });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Check the notice and try again." }, { status: 400, headers });
  }
  const parsed = publicNoticeSchema.safeParse(body);
  if (!parsed.success || !hasPublicSupabaseConfiguration()) {
    return NextResponse.json({ error: "Notice publishing is currently unavailable." }, { status: 503, headers });
  }

  const denied = NextResponse.json(
    { error: "Only a current Main Admin or Notice Publisher can publish notices." },
    { status: 403, headers },
  );
  const client = await createNoticeClient(denied);
  if (!(await client.auth.getUser()).data.user) return denied;

  const { error } = await client.rpc("publish_public_notice", {
    p_edition_id: parsed.data.editionId,
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_urgency: parsed.data.urgency,
    p_expires_at: parsed.data.expiresAt,
  });
  if (error) {
    if (error.code === "42501") return denied;
    if (error.code === "22023") {
      return NextResponse.json(
        { error: "Please provide valid notice details and a future expiry time." },
        { status: 400, headers },
      );
    }
    return NextResponse.json({ error: "Unable to publish the notice. Please try again." }, { status: 503, headers });
  }

  revalidateNoticeRoutes();
  const [push, notices] = await Promise.all([
    broadcastNoticePush({ title: parsed.data.title, body: parsed.data.body, urgency: parsed.data.urgency }).catch(
      () => null,
    ),
    listAdminNotices(hasSupabaseConfiguration() ? createAdminClient() : client).catch(() => null),
  ]);
  return NextResponse.json({ ok: true, push, ...(notices ? { notices } : {}) }, { headers });
}

export async function DELETE(request: Request) {
  if (isCrossOrigin(request)) {
    return NextResponse.json({ error: "Invalid notice request." }, { status: 403, headers });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid delete request." }, { status: 400, headers });
  }

  const noticeId =
    body && typeof body === "object" && "noticeId" in body && typeof body.noticeId === "string"
      ? body.noticeId.trim()
      : "";
  if (!uuidPattern.test(noticeId)) {
    return NextResponse.json({ error: "Valid notice ID is required." }, { status: 400, headers });
  }

  if (!hasSupabaseConfiguration()) {
    return NextResponse.json({ error: "Notice management is currently unavailable." }, { status: 503, headers });
  }

  const denied = NextResponse.json(
    { error: "Only a current Main Admin or Notice Publisher can delete notices." },
    { status: 403, headers },
  );
  const client = await createNoticeClient(denied);
  const { data: authData } = await client.auth.getUser();
  if (!authData.user) return denied;

  const { data: allowed, error: permissionError } = await client.rpc("can_publish_notices");
  if (permissionError) {
    return NextResponse.json({ error: "Unable to verify notice permission." }, { status: 503, headers });
  }
  if (allowed !== true) return denied;

  const admin = createAdminClient();
  const { data: existing, error: fetchError } = await admin
    .from("notices")
    .select("id, edition_id, event_id, title, audience, urgency, publish_at")
    .eq("id", noticeId)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: "Unable to load the notice." }, { status: 503, headers });
  }
  if (!existing) {
    return NextResponse.json({ error: "Notice not found." }, { status: 404, headers });
  }

  const { error: deleteError } = await admin.from("notices").delete().eq("id", noticeId);
  if (deleteError) {
    return NextResponse.json({ error: "Unable to delete the notice. Please try again." }, { status: 500, headers });
  }

  await admin.from("audit_log").insert({
    actor_id: authData.user.id,
    action: "notice.deleted",
    object_type: "notice",
    object_id: noticeId,
    change_summary: {
      edition_id: existing.edition_id,
      event_id: existing.event_id,
      title: existing.title,
      audience: existing.audience,
      urgency: existing.urgency,
      publish_at: existing.publish_at,
    },
  });

  revalidateNoticeRoutes();
  const notices = await listAdminNotices(admin).catch(() => null);
  return NextResponse.json({ ok: true, deletedId: noticeId, ...(notices ? { notices } : {}) }, { headers });
}
