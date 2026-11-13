import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { sponsorItemSchema } from "@/server/promotional-contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";
import { invalidatePublicTags, PUBLIC_CACHE_TAGS } from "@/server/public-cache";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };

async function verifyAdmin() {
  if (!hasPublicSupabaseConfiguration()) return null;
  const client = await createRequestClient();
  const { data: userRes } = await client.auth.getUser();
  if (!userRes.user) return null;
  const { data: isAdmin } = await client.rpc("is_main_admin");
  if (isAdmin !== true) return null;
  return userRes.user.id;
}

export async function GET() {
  const actorId = await verifyAdmin();
  if (!actorId) return NextResponse.json({ error: "Main Admin authorization required." }, { status: 403, headers });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from("sponsors")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (error) {
    return NextResponse.json({ error: `Failed to fetch sponsors: ${error.message}` }, { status: 500, headers });
  }

  return NextResponse.json({ sponsors: data ?? [] }, { headers });
}

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Invalid request origin." }, { status: 403, headers });
  }

  const actorId = await verifyAdmin();
  if (!actorId) return NextResponse.json({ error: "Main Admin authorization required." }, { status: 403, headers });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request payload." }, { status: 400, headers });
  }

  const payload = body as { action?: string; id?: string; sponsor?: unknown };
  const admin = createAdminClient();

  if (payload.action === "delete") {
    if (!payload.id || typeof payload.id !== "string") {
      return NextResponse.json({ error: "Sponsor ID is required for deletion." }, { status: 400, headers });
    }

    const { error: delError } = await admin.from("sponsors").delete().eq("id", payload.id);
    if (delError) {
      return NextResponse.json({ error: `Deletion failed: ${delError.message}` }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "sponsor.deleted",
      object_type: "sponsor",
      object_id: payload.id,
    });

    invalidatePublicTags(PUBLIC_CACHE_TAGS.sponsors);
    revalidatePath("/sponsors");
    return NextResponse.json({ ok: true }, { headers });
  }

  // Otherwise, action is save (create or update)
  const parsed = sponsorItemSchema.safeParse(payload.sponsor || body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers });
  }

  const sponsorData = parsed.data;

  // Resolve edition_id if not provided
  let targetEditionId = sponsorData.edition_id;
  if (!targetEditionId) {
    const { data: edition } = await admin
      .from("editions")
      .select("id")
      .neq("status", "archived")
      .order("created_at", { ascending: false })
      .limit(1)
      .single();
    if (!edition) {
      return NextResponse.json({ error: "No active festival edition found." }, { status: 400, headers });
    }
    targetEditionId = edition.id;
  }

  if (sponsorData.id) {
    // Update
    const { data, error } = await admin
      .from("sponsors")
      .update({
        name: sponsorData.name,
        tier: sponsorData.tier,
        logo_url: sponsorData.logo_url,
        logo_alt: sponsorData.logo_alt,
        description: sponsorData.description || null,
        website_url: sponsorData.website_url || null,
        sort_order: sponsorData.sort_order,
        state: sponsorData.state,
        publish_at: sponsorData.publish_at || null,
        event_id: sponsorData.event_id || null,
        updated_by: actorId,
      })
      .eq("id", sponsorData.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "sponsor.updated",
      object_type: "sponsor",
      object_id: sponsorData.id,
      change_summary: { name: sponsorData.name, tier: sponsorData.tier, state: sponsorData.state },
    });

    invalidatePublicTags(PUBLIC_CACHE_TAGS.sponsors);
    revalidatePath("/sponsors");
    return NextResponse.json({ ok: true, sponsor: data }, { headers });
  } else {
    // Insert
    const { data, error } = await admin
      .from("sponsors")
      .insert({
        edition_id: targetEditionId,
        event_id: sponsorData.event_id || null,
        name: sponsorData.name,
        tier: sponsorData.tier,
        logo_url: sponsorData.logo_url,
        logo_alt: sponsorData.logo_alt,
        description: sponsorData.description || null,
        website_url: sponsorData.website_url || null,
        sort_order: sponsorData.sort_order,
        state: sponsorData.state,
        publish_at: sponsorData.publish_at || null,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "sponsor.created",
      object_type: "sponsor",
      object_id: data.id,
      change_summary: { name: sponsorData.name, tier: sponsorData.tier, state: sponsorData.state },
    });

    invalidatePublicTags(PUBLIC_CACHE_TAGS.sponsors);
    revalidatePath("/sponsors");
    return NextResponse.json({ ok: true, sponsor: data }, { headers });
  }
}

