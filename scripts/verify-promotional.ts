import { createClient } from "@supabase/supabase-js";
import assert from "node:assert/strict";

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  const sb = createClient(url, serviceKey);

  console.log("1. Verifying Database state...");
  const { count: eventsCount } = await sb.from("events").select("*", { count: "exact", head: true });
  assert.equal(eventsCount, 0, "Events count must be 0");

  const { count: seniorsCount } = await sb.from("profiles").select("*", { count: "exact", head: true }).neq("participant_category", "ug");
  assert.equal(seniorsCount, 0, "Senior profiles count must be 0");

  const { count: ugsCount } = await sb.from("profiles").select("*", { count: "exact", head: true }).eq("participant_category", "ug");
  assert.equal(ugsCount, 16, "UG profiles count must be 16");
  console.log("✓ Database cleanup verified (0 events, 0 seniors, 16 UG students)");

  console.log("2. Verifying Merchandise CRUD...");
  const { data: edition } = await sb.from("editions").select("id").neq("status", "archived").limit(1).single();
  assert.ok(edition?.id, "Active edition must exist");

  const { data: adminUser } = await sb.from("profiles").select("id").limit(1).single();
  assert.ok(adminUser?.id, "Admin user must exist");

  // Create
  const testMerch = {
    edition_id: edition.id,
    name: "Verification Festival Tee",
    description: "Automated test item for Spandan 4.0",
    image_url: "https://example.com/tee.webp",
    image_alt: "Test Tee",
    sizes: ["M", "L", "XL"],
    availability_note: "Desk only",
    collection_note: "Ground floor",
    contact_note: "Test contact",
    state: "draft",
    updated_by: adminUser.id,
  };

  const { data: createdMerch, error: cErr } = await sb.from("merchandise_items").insert(testMerch).select().single();
  assert.ifError(cErr);
  assert.ok(createdMerch.id);
  console.log("✓ Merchandise item created:", createdMerch.id);

  // Update
  const { data: updatedMerch, error: uErr } = await sb
    .from("merchandise_items")
    .update({ state: "published", availability_note: "Updated desk note" })
    .eq("id", createdMerch.id)
    .select()
    .single();
  assert.ifError(uErr);
  assert.equal(updatedMerch.state, "published");
  console.log("✓ Merchandise item updated to published");

  // Delete
  const { error: dErr } = await sb.from("merchandise_items").delete().eq("id", createdMerch.id);
  assert.ifError(dErr);
  console.log("✓ Merchandise test item deleted");

  console.log("3. Verifying Sponsors CRUD...");
  const testSponsor = {
    edition_id: edition.id,
    name: "Verification Bank Partner",
    tier: "Title Partner",
    logo_url: "https://example.com/bank.png",
    logo_alt: "Bank Logo",
    description: "Official banking partner",
    website_url: "https://bank.example.com",
    sort_order: 1,
    state: "draft",
    updated_by: adminUser.id,
  };

  const { data: createdSponsor, error: sErr } = await sb.from("sponsors").insert(testSponsor).select().single();
  assert.ifError(sErr);
  assert.ok(createdSponsor.id);
  console.log("✓ Sponsor created:", createdSponsor.id);

  // Update
  const { data: updatedSponsor, error: suErr } = await sb
    .from("sponsors")
    .update({ state: "published", sort_order: 5 })
    .eq("id", createdSponsor.id)
    .select()
    .single();
  assert.ifError(suErr);
  assert.equal(updatedSponsor.state, "published");
  console.log("✓ Sponsor updated to published");

  // Delete
  const { error: sdErr } = await sb.from("sponsors").delete().eq("id", createdSponsor.id);
  assert.ifError(sdErr);
  console.log("✓ Sponsor test item deleted");

  console.log("\nAll automated verification checks passed successfully!");
}

run().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});

