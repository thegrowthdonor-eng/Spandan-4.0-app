import { createClient } from "@supabase/supabase-js";
import * as fs from "node:fs";
import * as path from "node:path";

const PROD_PROJECT_REF = "uytvtmkapusjjqhjyopd";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }

  if (!url.includes(PROD_PROJECT_REF)) {
    throw new Error(`Refusing execution: URL does not contain expected production ref ${PROD_PROJECT_REF}`);
  }

  console.log(`[Production Cleanup] Connecting to production database: ${url}`);
  const sb = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. Pre-flight Backup
  console.log("[Production Cleanup] Gathering backup data...");
  const { data: events, error: evErr } = await sb.from("events").select("*");
  if (evErr) throw new Error(`Failed to fetch events: ${evErr.message}`);

  const { data: applications, error: appErr } = await sb.from("applications").select("*");
  if (appErr) throw new Error(`Failed to fetch applications: ${appErr.message}`);

  const { data: pointRules, error: prErr } = await sb.from("point_rules").select("*");
  if (prErr) throw new Error(`Failed to fetch point rules: ${prErr.message}`);

  const { data: seniors, error: snrErr } = await sb
    .from("profiles")
    .select("*")
    .neq("participant_category", "ug");
  if (snrErr) throw new Error(`Failed to fetch senior profiles: ${snrErr.message}`);

  const { data: allProfiles, error: profErr } = await sb.from("profiles").select("id, full_name, roll_canonical, fest_id, participant_category");
  if (profErr) throw new Error(`Failed to fetch profiles: ${profErr.message}`);

  const backupDir = path.resolve(process.cwd(), "audit-artifacts");
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

  const backupFilePath = path.join(backupDir, `production-cleanup-backup-${Date.now()}.json`);
  const backupData = {
    timestamp: new Date().toISOString(),
    databaseUrl: url,
    eventsCount: events.length,
    events,
    applicationsCount: applications.length,
    applications,
    pointRulesCount: pointRules.length,
    pointRules,
    seniorsCount: seniors.length,
    seniors,
    totalProfilesBefore: allProfiles.length,
    allProfiles,
  };

  fs.writeFileSync(backupFilePath, JSON.stringify(backupData, null, 2), "utf8");
  console.log(`[Production Cleanup] Pre-flight backup saved to ${backupFilePath}`);

  // 2. Delete dependent records of events: applications & point rules
  if (applications.length > 0) {
    console.log(`[Production Cleanup] Deleting ${applications.length} applications...`);
    const appIds = applications.map((a) => a.id);
    const { error: delAppErr } = await sb.from("applications").delete().in("id", appIds);
    if (delAppErr) throw new Error(`Failed to delete applications: ${delAppErr.message}`);
  }

  if (pointRules.length > 0) {
    console.log(`[Production Cleanup] Deleting ${pointRules.length} point rules...`);
    const ruleIds = pointRules.map((r) => r.id);
    const { error: delPrErr } = await sb.from("point_rules").delete().in("id", ruleIds);
    if (delPrErr) throw new Error(`Failed to delete point rules: ${delPrErr.message}`);
  }

  // 3. Clear event_id from staff_assignments & sponsors if any
  const { error: staffErr } = await sb.from("staff_assignments").delete().not("event_id", "is", null);
  if (staffErr) console.warn("Staff assignments cleanup note:", staffErr.message);

  const { error: sponErr } = await sb.from("sponsors").update({ event_id: null }).not("event_id", "is", null);
  if (sponErr) console.warn("Sponsors event_id clear note:", sponErr.message);

  // 4. Delete all events
  if (events.length > 0) {
    console.log(`[Production Cleanup] Deleting ${events.length} events...`);
    const eventIds = events.map((e) => e.id);
    const { error: delEventsErr } = await sb.from("events").delete().in("id", eventIds);
    if (delEventsErr) throw new Error(`Failed to delete events: ${delEventsErr.message}`);
  }
  console.log("[Production Cleanup] Events successfully deleted.");

  // 5. Delete all PG & Faculty profiles
  console.log(`[Production Cleanup] Deleting ${seniors.length} PG/Faculty profiles...`);
  for (const senior of seniors) {
    console.log(`  Deleting senior profile: ${senior.full_name} (${senior.participant_category}) [${senior.id}]`);
    const { data: delResult, error: delErr } = await sb.rpc("delete_student_profile", {
      p_profile_id: senior.id,
    });
    if (delErr) {
      console.error(`  Warning deleting profile ${senior.id} via RPC:`, delErr.message);
      // Fallback: direct delete from profiles
      const { error: directErr } = await sb.from("profiles").delete().eq("id", senior.id);
      if (directErr) console.error(`  Direct profile delete failed for ${senior.id}:`, directErr.message);
    }
    // Delete corresponding auth user
    const { error: authErr } = await sb.auth.admin.deleteUser(senior.id);
    if (authErr) {
      console.warn(`  Auth user delete note for ${senior.id}:`, authErr.message);
    }
  }

  // 6. Post-cleanup Verification
  console.log("\n[Production Cleanup] Running post-cleanup verification...");
  const { count: remainingEvents } = await sb.from("events").select("*", { count: "exact", head: true });
  const { count: remainingApps } = await sb.from("applications").select("*", { count: "exact", head: true });
  const { count: remainingPoints } = await sb.from("point_rules").select("*", { count: "exact", head: true });
  const { data: remainingProfiles } = await sb.from("profiles").select("id, full_name, participant_category, batch_id");

  const remainingSeniors = (remainingProfiles || []).filter((p) => p.participant_category !== "ug");
  const remainingUgs = (remainingProfiles || []).filter((p) => p.participant_category === "ug");

  console.log("-----------------------------------------");
  console.log(`Events Remaining:        ${remainingEvents} (expected: 0)`);
  console.log(`Applications Remaining:  ${remainingApps} (expected: 0)`);
  console.log(`Point Rules Remaining:   ${remainingPoints} (expected: 0)`);
  console.log(`Senior Profiles:         ${remainingSeniors.length} (expected: 0)`);
  console.log(`UG Student Profiles:     ${remainingUgs.length} (expected: 16)`);
  console.log("-----------------------------------------");

  if (remainingEvents !== 0) throw new Error(`Verification failed: ${remainingEvents} events remain`);
  if (remainingSeniors.length !== 0) throw new Error(`Verification failed: ${remainingSeniors.length} seniors remain`);
  if (remainingUgs.length !== 16) throw new Error(`Verification failed: UG profiles count is ${remainingUgs.length}, expected 16`);

  console.log("Cleanup completely verified and successful!");
}

main().catch((err) => {
  console.error("[Production Cleanup Failed]:", err);
  process.exit(1);
});

