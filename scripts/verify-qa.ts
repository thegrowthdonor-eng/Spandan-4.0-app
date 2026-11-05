import { QA_EVENT_SLUGS } from "./qa-data";
import { failIfError, requireQaEnvironment, requireQaPublicEnvironment } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";
import { toPrivateAuthEmail } from "../src/server/auth/identity";

async function count(admin: ReturnType<typeof requireQaEnvironment>, table: string) {
  const { count: total, error } = await admin.from(table).select("*", { count: "exact", head: true });
  failIfError(error, `Count ${table}`);
  return total ?? 0;
}

function assertEqual(actual: number, expected: number, label: string) {
  if (actual !== expected) throw new Error(`${label}: expected ${expected}, got ${actual}`);
}

async function main() {
  const admin = requireQaEnvironment();
  const publicClient = requireQaPublicEnvironment();
  const expected = new Map([
    ["editions", 1], ["batches", 6], ["events", QA_EVENT_SLUGS.length], ["applications", QA_EVENT_SLUGS.length * 10],
    ["application_history", 408], ["participant_groups", 6], ["group_memberships", 18],
    ["fixtures", 12], ["fixture_history", 12], ["score_snapshots", 12],
    ["result_publications", 10], ["result_positions", 30], ["point_rules", 30], ["points_ledger", 30],
    ["notices", 6], ["polls", 3], ["poll_options", 10], ["poll_votes", 15], ["reminders", 6],
    ["feedback_responses", 8], ["help_threads", 4], ["help_messages", 12],
    ["content_banners", 4], ["sponsors", 4], ["media_items", 9], ["stage_reveals", 2],
    ["organiser_profiles", 6], ["merchandise_items", 5], ["push_subscriptions", 1],
  ]);
  for (const [table, expectedCount] of expected) assertEqual(await count(admin, table), expectedCount, `QA ${table}`);

  const [profiles, accessRecords, staffAssignments, eventRows, applicationRows, fixtureRows, publicationRows, publicEvents, publicMerchandise, publicCommittee, publicBanners, publicMedia, publicStandings, publicResults] = await Promise.all([
    admin.from("profiles").select("id,batch_id"), admin.from("access_records").select("profile_id,state"), admin.from("staff_assignments").select("profile_id,role,event_id"),
    admin.from("events").select("id,slug"),
    admin.from("applications").select("id,event_id,student_id,review_state"), admin.from("fixtures").select("id,event_id"), admin.from("result_publications").select("id,event_id"),
    publicClient.from("events").select("id", { count: "exact", head: true }), publicClient.from("merchandise_items").select("id", { count: "exact", head: true }),
    publicClient.from("organiser_profiles").select("id", { count: "exact", head: true }), publicClient.from("content_banners").select("id", { count: "exact", head: true }),
    publicClient.from("media_items").select("id,asset_url", { count: "exact" }),
    publicClient.from("published_batch_standing_board").select("batch_id,label,points"),
    publicClient.rpc("get_published_event_results"),
  ]);
  for (const [name, result] of Object.entries({ profiles, accessRecords, staffAssignments, eventRows, applicationRows, fixtureRows, publicationRows, publicEvents, publicMerchandise, publicCommittee, publicBanners, publicMedia, publicStandings, publicResults })) failIfError(result.error, `Read ${name}`);

  assertEqual(profiles.data?.length ?? 0, 57, "Fictional UG account count");
  assertEqual(accessRecords.data?.filter((row: { state: string }) => row.state === "active").length ?? 0, 54, "Active account count");
  assertEqual(accessRecords.data?.filter((row: { state: string }) => ["pending", "rejected", "suspended"].includes(row.state)).length ?? 0, 3, "State-example account count");
  const roles = new Set((staffAssignments.data ?? []).map((row: { role: string }) => row.role));
  for (const role of ["main_admin", "treasurer", "event_head", "event_coordinator", "notice_publisher"]) if (!roles.has(role)) throw new Error(`Missing required QA role: ${role}`);

  const profileIds = new Set((profiles.data ?? []).map((row: { id: string }) => row.id));
  const eventIds = new Set((eventRows.data ?? []).map((row: { id: string }) => row.id));
  if ((applicationRows.data ?? []).some((row: { student_id: string }) => !profileIds.has(row.student_id))) throw new Error("Application FK integrity failed: missing profile");
  if ([...(applicationRows.data ?? []), ...(fixtureRows.data ?? []), ...(publicationRows.data ?? [])].some((row: { event_id: string }) => !eventIds.has(row.event_id))) throw new Error("Event FK integrity failed");
  if (eventIds.size !== QA_EVENT_SLUGS.length) throw new Error("QA catalogue contains duplicate or missing event ids");
  for (const eventId of eventIds) {
    const pending = (applicationRows.data ?? []).filter((row: { event_id: string; review_state: string }) => row.event_id === eventId && row.review_state === "submitted").length;
    if (pending < 5) throw new Error(`QA event ${eventId} has ${pending} pending requests; expected at least 5`);
  }

  assertEqual(publicEvents.count ?? 0, QA_EVENT_SLUGS.length, "Published public events");
  assertEqual(publicMerchandise.count ?? 0, 5, "Published public merchandise");
  assertEqual(publicCommittee.count ?? 0, 6, "Published public committee rows");
  assertEqual(publicBanners.count ?? 0, 4, "Published public banner rows");
  assertEqual(publicMedia.count ?? 0, 9, "Published public gallery rows");
  assertEqual(publicStandings.data?.length ?? 0, 6, "Published six-batch standings");
  assertEqual(publicResults.data?.length ?? 0, 10, "Published public result cards");
  if ((publicMedia.data ?? []).some((item: { asset_url: string }) => !item.asset_url.includes("/fest-media/qa/"))) throw new Error("Gallery media is not backed by QA storage assets");

  const { data: qaBatches, error: batchError } = await admin.from("batches").select("label,course_label");
  failIfError(batchError, "Read QA batches");
  const nonUgBatches = (qaBatches ?? []).filter((batch: { label: string; course_label: string | null }) => !/^MBBS 20(21|22|23|24|25|26)$/.test(batch.label) || batch.course_label !== "MBBS");
  assertEqual(nonUgBatches.length, 0, "PG/JR/Faculty batch profiles");

  const { data: users, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  failIfError(usersError, "List QA Auth users");
  const invitedCount = users.users.filter((user) => Boolean(user.invited_at)).length;
  assertEqual(invitedCount, 0, "Auth invite count");
  const pepper = process.env.AUTH_IDENTITY_PEPPER;
  if (!pepper) throw new Error("AUTH_IDENTITY_PEPPER is required for QA login verification");
  for (const rollNumber of ["1", "91"]) {
    const { error: loginError } = await publicClient.auth.signInWithPassword({
      email: toPrivateAuthEmail({ batch: "2021", rollNumber }, pepper),
      password: QA_PASSWORD,
    });
    failIfError(loginError, `Sign in QA account MBBS 2021 / ${rollNumber}`);
    await publicClient.auth.signOut({ scope: "local" });
  }
  console.log("QA verification passed: expected counts, role coverage, public content, FK presence, and zero PG/JR/Faculty profiles or invites.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
