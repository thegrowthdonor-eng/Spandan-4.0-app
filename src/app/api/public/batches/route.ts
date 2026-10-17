import { NextResponse } from "next/server";
import { hasSupabaseConfiguration } from "@/server/env";
import { createAdminClient } from "@/server/supabase/admin";
import { ugBatches } from "@/lib/participants";

export const dynamic = "force-dynamic";

export async function GET() {
  if (!hasSupabaseConfiguration()) return NextResponse.json({ batches: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  const admin = createAdminClient();
  const { data: editions, error: editionError } = await admin.from("editions").select("id").neq("status", "archived");
  if (editionError || !editions?.length) return NextResponse.json({ batches: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  const { data: batches, error: batchError } = await admin.from("batches").select("id,label,course_label").eq("eligible", true).in("edition_id", editions.map((edition) => edition.id)).order("label");
  if (batchError) return NextResponse.json({ batches: [] }, { headers: { "Cache-Control": "public, max-age=60" } });
  return NextResponse.json({ batches: ugBatches.flatMap((option) => batches.filter((batch) => batch.label === option.value).map((batch) => ({ id: batch.id, label: option.label }))) }, { headers: { "Cache-Control": "public, max-age=60" } });
}
