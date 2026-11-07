import { NextResponse } from "next/server";
import { createRequestClient } from "@/server/supabase/server";
import { createAdminClient } from "@/server/supabase/admin";
import { merchandiseItemSchema } from "@/server/promotional-contracts";
import { hasPublicSupabaseConfiguration } from "@/server/env";

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
    .from("merchandise_items")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: `Failed to fetch merchandise: ${error.message}` }, { status: 500, headers });
  }

  return NextResponse.json({ items: data ?? [] }, { headers });
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

  const payload = body as { action?: string; id?: string; item?: unknown };
  const admin = createAdminClient();

  if (payload.action === "delete") {
    if (!payload.id || typeof payload.id !== "string") {
      return NextResponse.json({ error: "Item ID is required for deletion." }, { status: 400, headers });
    }

    const { error: delError } = await admin.from("merchandise_items").delete().eq("id", payload.id);
    if (delError) {
      return NextResponse.json({ error: `Deletion failed: ${delError.message}` }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "merchandise.deleted",
      object_type: "merchandise_item",
      object_id: payload.id,
    });

    return NextResponse.json({ ok: true }, { headers });
  }

  // Otherwise, action is save (create or update)
  const parsed = merchandiseItemSchema.safeParse(payload.item || body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400, headers });
  }

  const itemData = parsed.data;

  // Resolve edition_id if not provided
  let targetEditionId = itemData.edition_id;
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

  if (itemData.id) {
    // Update
    const { data, error } = await admin
      .from("merchandise_items")
      .update({
        name: itemData.name,
        description: itemData.description,
        image_url: itemData.image_url,
        image_alt: itemData.image_alt,
        sizes: itemData.sizes,
        availability_note: itemData.availability_note,
        collection_note: itemData.collection_note,
        contact_note: itemData.contact_note,
        state: itemData.state,
        publish_at: itemData.publish_at || null,
        updated_by: actorId,
      })
      .eq("id", itemData.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "merchandise.updated",
      object_type: "merchandise_item",
      object_id: itemData.id,
      change_summary: { name: itemData.name, state: itemData.state },
    });

    return NextResponse.json({ ok: true, item: data }, { headers });
  } else {
    // Insert
    const { data, error } = await admin
      .from("merchandise_items")
      .insert({
        edition_id: targetEditionId,
        name: itemData.name,
        description: itemData.description,
        image_url: itemData.image_url,
        image_alt: itemData.image_alt,
        sizes: itemData.sizes,
        availability_note: itemData.availability_note,
        collection_note: itemData.collection_note,
        contact_note: itemData.contact_note,
        state: itemData.state,
        publish_at: itemData.publish_at || null,
        updated_by: actorId,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500, headers });
    }

    await admin.from("audit_log").insert({
      actor_id: actorId,
      action: "merchandise.created",
      object_type: "merchandise_item",
      object_id: data.id,
      change_summary: { name: itemData.name, state: itemData.state },
    });

    return NextResponse.json({ ok: true, item: data }, { headers });
  }
}

