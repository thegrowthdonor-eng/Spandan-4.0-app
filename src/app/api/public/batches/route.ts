import { NextResponse } from "next/server";
import { hasSupabaseConfiguration } from "@/server/env";
import { coalesceCached, PUBLIC_CACHE_TAGS } from "@/server/public-cache";
import { createAdminClient } from "@/server/supabase/admin";
import { ugBatches } from "@/lib/participants";

export const dynamic = "force-dynamic";

const batchHeaders = { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" };

async function loadPublicBatches() {
  const admin = createAdminClient();
  const { data: editions, error: editionError } = await admin.from("editions").select("id").neq("status", "archived");
  if (editionError) throw new Error(editionError.message);
  if (!editions?.length) return [];
  const { data: batches, error: batchError } = await admin
    .from("batches")
    .select("id,label,course_label")
    .eq("eligible", true)
    .in("edition_id", editions.map((edition) => edition.id))
    .order("label");
  if (batchError || !batches) throw new Error(batchError?.message ?? "Batches unavailable");
  return ugBatches.flatMap((option) =>
    batches.filter((batch) => batch.label === option.value).map((batch) => ({ id: batch.id, label: option.label })),
  );
}

export async function GET() {
  if (!hasSupabaseConfiguration()) return NextResponse.json({ batches: [] }, { headers: batchHeaders });
  try {
    const batches = await coalesceCached("public-batches-list", [PUBLIC_CACHE_TAGS.batches], 300, loadPublicBatches);
    return NextResponse.json({ batches }, { headers: batchHeaders });
  } catch {
    return NextResponse.json({ batches: [] }, { headers: { "Cache-Control": "no-store" } });
  }
}
