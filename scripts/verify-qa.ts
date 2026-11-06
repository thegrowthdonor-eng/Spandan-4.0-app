import { QA_EVENT_SLUGS } from "./qa-data";
import { failIfError, requireQaEnvironment, requireQaPublicEnvironment } from "./qa-guard";
import { QA_PASSWORD } from "./qa-data";
import { toPrivateAuthEmail } from "../src/server/auth/identity";
import { buildFestivalFeed } from "../src/lib/feed";
import { getPublishedResults } from "../src/lib/published-results";

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
    ["application_history", 409], ["participant_groups", 6], ["group_memberships", 18],
    ["fixtures", 12], ["fixture_history", 12], ["score_snapshots", 12],
    ["result_publications", 10], ["result_positions", 30], ["point_rules", 30], ["points_ledger", 30],
    ["notices", 6], ["polls", 3], ["poll_options", 10], ["poll_votes", 15], ["reminders", 6],
    ["feedback_responses", 8], ["help_threads", 4], ["help_messages", 12],
    ["content_banners", 4], ["sponsors", 4], ["media_items", 9], ["gallery_moments", 3], ["stage_reveals", 2],
    ["organiser_profiles", 6], ["merchandise_items", 5], ["push_subscriptions", 1],
  ]);
  for (const [table, expectedCount] of expected) assertEqual(await count(admin, table), expectedCount, `QA ${table}`);

  const [profiles, accessRecords, staffAssignments, eventRows, applicationRows, fixtureRows, publicationRows, publicEvents, publicMerchandise, publicCommittee, publicBanners, publicMedia, publicGallery, publicStandings, publicResults, unifiedResults] = await Promise.all([
    admin.from("profiles").select("id,batch_id"), admin.from("access_records").select("profile_id,state"), admin.from("staff_assignments").select("profile_id,role,event_id,event_category"),
    admin.from("events").select("id,slug,category,created_by"),
    admin.from("applications").select("id,event_id,student_id,review_state"), admin.from("fixtures").select("id,event_id"), admin.from("result_publications").select("id,event_id"),
    publicClient.from("events").select("id", { count: "exact", head: true }), publicClient.from("merchandise_items").select("id", { count: "exact", head: true }),
    publicClient.from("organiser_profiles").select("id", { count: "exact", head: true }), publicClient.from("content_banners").select("id", { count: "exact", head: true }),
    publicClient.from("media_items").select("id,asset_url", { count: "exact" }),
    publicClient.rpc("get_published_gallery_moments"),
    publicClient.from("published_batch_standing_board").select("batch_id,label,points"),
    publicClient.rpc("get_published_event_results"),
    publicClient.rpc("unified_event_results"),
  ]);
  for (const [name, result] of Object.entries({ profiles, accessRecords, staffAssignments, eventRows, applicationRows, fixtureRows, publicationRows, publicEvents, publicMerchandise, publicCommittee, publicBanners, publicMedia, publicGallery, publicStandings, publicResults, unifiedResults })) failIfError(result.error, `Read ${name}`);

  assertEqual(profiles.data?.length ?? 0, 58, "Fictional UG account count");
  assertEqual(accessRecords.data?.filter((row: { state: string }) => row.state === "active").length ?? 0, 55, "Active account count");
  assertEqual(accessRecords.data?.filter((row: { state: string }) => ["pending", "rejected", "suspended"].includes(row.state)).length ?? 0, 3, "State-example account count");
  const roles = new Set((staffAssignments.data ?? []).map((row: { role: string }) => row.role));
  for (const role of ["main_admin", "treasurer", "event_editor", "event_head", "event_coordinator", "notice_publisher"]) if (!roles.has(role)) throw new Error(`Missing required QA role: ${role}`);

  const profileIds = new Set((profiles.data ?? []).map((row: { id: string }) => row.id));
  const eventIds = new Set((eventRows.data ?? []).map((row: { id: string }) => row.id));
  if ((applicationRows.data ?? []).some((row: { student_id: string }) => !profileIds.has(row.student_id))) throw new Error("Application FK integrity failed: missing profile");
  if ([...(applicationRows.data ?? []), ...(fixtureRows.data ?? []), ...(publicationRows.data ?? [])].some((row: { event_id: string }) => !eventIds.has(row.event_id))) throw new Error("Event FK integrity failed");
  if (eventIds.size !== QA_EVENT_SLUGS.length) throw new Error("QA catalogue contains duplicate or missing event ids");
  const eventBySlug = new Map((eventRows.data ?? []).map((row: { id: string; slug: string; category: string; created_by: string | null }) => [row.slug, row]));
  const quiz = eventBySlug.get("quiz-bowl");
  const cricket = eventBySlug.get("box-cricket-boys");
  const soloResultEvent = eventBySlug.get("100m-sprint-boys");
  const teamResultEvent = eventBySlug.get("carrom-doubles-open");
  const editablePointEvent = eventBySlug.get("debate");
  const culture = [...eventBySlug.values()].find((event) => event.category === "cultural");
  if (!quiz || !cricket || !soloResultEvent || !teamResultEvent || !editablePointEvent || !culture) throw new Error("QA role-scope events are missing");
  for (const eventId of eventIds) {
    const pending = (applicationRows.data ?? []).filter((row: { event_id: string; review_state: string }) => row.event_id === eventId && row.review_state === "submitted").length;
    if (pending < 5) throw new Error(`QA event ${eventId} has ${pending} pending requests; expected at least 5`);
  }

  assertEqual(publicEvents.count ?? 0, QA_EVENT_SLUGS.length, "Published public events");
  assertEqual(publicMerchandise.count ?? 0, 5, "Published public merchandise");
  assertEqual(publicCommittee.count ?? 0, 6, "Published public committee rows");
  assertEqual(publicBanners.count ?? 0, 4, "Published public banner rows");
  assertEqual(publicMedia.count ?? 0, 9, "Published promotional media rows");
  assertEqual(publicGallery.data?.length ?? 0, 3, "Published public gallery moments");
  for (const moment of publicGallery.data ?? []) {
    const keys = Object.keys(moment as Record<string, unknown>).sort();
    if (keys.join(",") !== "caption,event_id,event_slug,event_title,id,occurred_at,storage_path") throw new Error(`Gallery public contract exposes unexpected fields: ${keys.join(",")}`);
    if (!(moment as { storage_path: string }).storage_path.startsWith("gallery/")) throw new Error("Gallery moment is not backed by the gallery storage prefix");
  }
  assertEqual(publicStandings.data?.length ?? 0, 6, "Published six-batch standings");
  assertEqual(publicResults.data?.length ?? 0, 10, "Published public result cards");
  assertEqual(Array.isArray(unifiedResults.data) ? unifiedResults.data.length : 0, 10, "Published unified result cards");
  for (const [label, rows] of [["legacy", publicResults.data], ["unified", unifiedResults.data]] as const) {
    const positions = (Array.isArray(rows) ? rows : []).flatMap((row: { positions?: unknown }) => Array.isArray(row.positions) ? row.positions : []);
    const solo = positions.find((position: { application_id?: string | null }) => position.application_id);
    const team = positions.find((position: { group_id?: string | null }) => position.group_id);
    if (!solo?.winner_name || !solo.winner_roll || !solo.batch_label) throw new Error(`${label} public results omit solo winner name, roll, or batch`);
    if (!team?.winner_name || !team.batch_label || team.winner_roll != null) throw new Error(`${label} public results do not preserve team name and batch without a roll`);
  }
  const [feedResults, feedNotices] = await Promise.all([
    getPublishedResults(publicClient),
    publicClient.from("notices").select("id,title,body,urgency,publish_at,events(title)").order("publish_at", { ascending: false }),
  ]);
  failIfError(feedNotices.error, "Read public feed notices");
  const feed = buildFestivalFeed({
    results: feedResults,
    standings: (publicStandings.data ?? []).map((standing: { batch_id: string; label: string; points: number }) => ({ ...standing, course_label: "MBBS" })),
    moments: (publicGallery.data ?? []).map((moment: { id: string; event_title: string; event_slug: string; storage_path: string; caption: string; occurred_at: string }) => ({ ...moment, imageUrl: "https://qa.example/gallery.webp" })),
    notices: (feedNotices.data ?? []).map((notice: { id: string; title: string; body: string; urgency: "normal" | "important" | "urgent"; publish_at: string; events: { title: string }[] | null }) => ({ ...notice, event_title: notice.events?.[0]?.title ?? null })),
  });
  if (feed.some((post) => !["result", "standings", "moment", "notice"].includes(post.kind))) throw new Error("Feed includes a non-festival post type");
  if (new Set(feed.map((post) => post.id)).size !== feed.length) throw new Error("Feed contains repeated source posts");
  if (feed.filter((post) => post.kind === "standings").length !== 1) throw new Error("Feed does not contain one current standings post");
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
  const { error: resultAdminLoginError } = await publicClient.auth.signInWithPassword({
    email: toPrivateAuthEmail({ batch: "2023", rollNumber: "91" }, pepper),
    password: QA_PASSWORD,
  });
  failIfError(resultAdminLoginError, "Sign in Main Admin for results contract verification");
  const [soloCandidates, teamCandidates] = await Promise.all([
    publicClient.rpc("list_result_participants", { p_event_id: soloResultEvent.id }),
    publicClient.rpc("list_result_participants", { p_event_id: teamResultEvent.id }),
  ]);
  failIfError(soloCandidates.error, "List selected solo result participants");
  failIfError(teamCandidates.error, "List published result teams");
  assertEqual(soloCandidates.data?.length ?? 0, 3, "Selected solo result participants");
  const soloCandidate = soloCandidates.data?.[0] as { target_kind?: string; label?: string; roll_canonical?: string | null; batch_label?: string | null } | undefined;
  const teamCandidate = teamCandidates.data?.[0] as { target_kind?: string; label?: string; roll_canonical?: string | null; batch_label?: string | null } | undefined;
  if (soloCandidate?.target_kind !== "application" || !soloCandidate.label || !soloCandidate.roll_canonical || !soloCandidate.batch_label) throw new Error("Solo results roster omits winner name, roll, or batch");
  if (teamCandidate?.target_kind !== "group" || !teamCandidate.label || !teamCandidate.batch_label || teamCandidate.roll_canonical != null) throw new Error("Team results roster does not expose team name and batch only");
  const { error: editableRulesError } = await publicClient.rpc("set_event_point_rules", {
    p_event_id: editablePointEvent.id,
    p_rules: [{ placing: 1, points: 12 }, { placing: 2, points: 8 }, { placing: 3, points: 4 }],
  });
  failIfError(editableRulesError, "Set points before first official result");
  const { error: lockedRulesError } = await publicClient.rpc("set_event_point_rules", {
    p_event_id: soloResultEvent.id,
    p_rules: [{ placing: 1, points: 99 }],
  });
  if (!lockedRulesError || lockedRulesError.code !== "55000") throw new Error("Published event point rules are not locked");
  await publicClient.auth.signOut({ scope: "local" });
  const { error: pointCleanupError } = await admin.from("point_rules").delete().eq("event_id", editablePointEvent.id);
  failIfError(pointCleanupError, "Clean up editable point-rule probe");
  for (const account of [{ batch: "2021", rollNumber: "1" }, { batch: "2023", rollNumber: "91" }]) {
    const { error: loginError } = await publicClient.auth.signInWithPassword({
      email: toPrivateAuthEmail(account, pepper),
      password: QA_PASSWORD,
    });
    failIfError(loginError, `Sign in QA account MBBS ${account.batch} / ${account.rollNumber}`);
    await publicClient.auth.signOut({ scope: "local" });
  }
  const galleryAccessCases = [
    { batch: "2021", rollNumber: "1", expected: false, manageable: 0 },
    { batch: "2023", rollNumber: "91", expected: true, manageable: 3 },
    { batch: "2023", rollNumber: "95", expected: true, manageable: 1 },
    { batch: "2023", rollNumber: "93", expected: false, manageable: 0 },
    { batch: "2023", rollNumber: "100", expected: false, manageable: 0 },
  ];
  for (const account of galleryAccessCases) {
    const { error: loginError } = await publicClient.auth.signInWithPassword({ email: toPrivateAuthEmail(account, pepper), password: QA_PASSWORD });
    failIfError(loginError, `Sign in gallery permission account ${account.batch} / ${account.rollNumber}`);
    const [permission, manageable] = await Promise.all([publicClient.rpc("can_manage_gallery_moments"), publicClient.rpc("list_manageable_gallery_moments")]);
    failIfError(permission.error, "Check gallery permission");
    if (permission.data !== account.expected) throw new Error(`Unexpected gallery permission for ${account.batch} / ${account.rollNumber}`);
    if (account.expected) {
      failIfError(manageable.error, "List manageable gallery moments");
      assertEqual(manageable.data?.length ?? 0, account.manageable, `Manageable gallery moments for ${account.rollNumber}`);
    } else if (!manageable.error && (manageable.data?.length ?? 0) !== 0) throw new Error("Ordinary student can manage gallery moments");
    await publicClient.auth.signOut({ scope: "local" });
  }
  const roleChecks = [
    { rollNumber: "100", canCreate: true, editable: [quiz.id], managed: [] as string[], denied: cricket.id, publishTarget: quiz.id },
    { rollNumber: "95", canCreate: false, editable: [] as string[], managed: [cricket.id], denied: quiz.id, publishTarget: cricket.id },
    { rollNumber: "93", canCreate: false, editable: [] as string[], managed: [cricket.id], denied: culture.id, publishTarget: cricket.id },
    { rollNumber: "94", canCreate: false, editable: [] as string[], managed: [culture.id], denied: cricket.id, publishTarget: culture.id },
  ];
  for (const account of roleChecks) {
    const { error: loginError } = await publicClient.auth.signInWithPassword({ email: toPrivateAuthEmail({ batch: "2023", rollNumber: account.rollNumber }, pepper), password: QA_PASSWORD });
    failIfError(loginError, `Sign in role scope account ${account.rollNumber}`);
    const { data: canCreate, error: createError } = await publicClient.rpc("can_create_events");
    failIfError(createError, `Check create-event permission for ${account.rollNumber}`);
    if (canCreate !== account.canCreate) throw new Error(`Unexpected create-event permission for ${account.rollNumber}`);
    for (const eventId of account.editable) {
      const { data, error } = await publicClient.rpc("can_edit_event_definition", { p_event_id: eventId });
      failIfError(error, `Check editable event permission for ${account.rollNumber}`);
      if (data !== true) throw new Error(`Expected event-definition access for ${account.rollNumber}`);
    }
    for (const eventId of account.managed) {
      const { data, error } = await publicClient.rpc("can_manage_event", { p_event_id: eventId });
      failIfError(error, `Check managed event permission for ${account.rollNumber}`);
      if (data !== true) throw new Error(`Expected event access for ${account.rollNumber}`);
    }
    const { data: deniedAccess, error: deniedError } = await publicClient.rpc("can_manage_event", { p_event_id: account.denied });
    failIfError(deniedError, `Check denied event permission for ${account.rollNumber}`);
    if (deniedAccess !== false) throw new Error(`Unexpected event access for ${account.rollNumber}`);
    const { error: publishError } = await publicClient.rpc("set_admin_event_state", { p_event_id: account.publishTarget, p_state: "draft" });
    if (!publishError || publishError.code !== "42501") throw new Error(`Non-admin ${account.rollNumber} can publish or change event state`);
    if (account.rollNumber === "95") {
      const { error: pointsError } = await publicClient.rpc("set_event_point_rules", {
        p_event_id: cricket.id,
        p_rules: [{ placing: 1, points: 10 }],
      });
      if (!pointsError || pointsError.code !== "42501") throw new Error("Event Coordinator can modify point rules");
    }
    await publicClient.auth.signOut({ scope: "local" });
  }
  const { error: editorLoginError } = await publicClient.auth.signInWithPassword({ email: toPrivateAuthEmail({ batch: "2023", rollNumber: "100" }, pepper), password: QA_PASSWORD });
  failIfError(editorLoginError, "Sign in Event Editor for ownership probe");
  const { data: edition, error: editionError } = await admin.from("editions").select("id").limit(1).single();
  failIfError(editionError, "Read QA edition for ownership probe");
  const probeTitle = `QA Editor Deletion Probe ${Date.now()}`;
  const { data: createdProbe, error: createProbeError } = await publicClient.rpc("create_admin_event", {
    p_edition_id: edition.id, p_title: probeTitle, p_category: "other", p_format: "solo", p_score_template: "generic",
    p_summary: "", p_venue: null, p_application_capacity: null, p_application_opens_at: null, p_application_closes_at: null,
    p_reporting_at: null, p_starts_at: null, p_ends_at: null, p_division: "open",
  });
  failIfError(createProbeError, "Create Event Editor ownership probe");
  const { error: updateProbeError } = await publicClient.rpc("update_admin_event_full", {
    p_event_id: createdProbe.id, p_title: `${probeTitle} Updated`, p_summary: "QA ownership edit", p_rules_markdown: "",
    p_venue: "", p_application_capacity: null, p_waitlist_enabled: false, p_application_opens_at: null,
    p_application_closes_at: null, p_roster_lock_at: null, p_reporting_at: null, p_starts_at: null, p_ends_at: null,
    p_eligibility: { division: "open" }, p_application_questions: [], p_group_min_size: null, p_group_max_size: null,
    p_batch_restricted: false, p_poster_url: null,
  });
  failIfError(updateProbeError, "Edit Event Editor ownership probe");
  const { error: deleteProbeError } = await publicClient.rpc("delete_owned_event", { p_event_id: createdProbe.id });
  failIfError(deleteProbeError, "Delete Event Editor ownership probe");
  const { count: probeCount, error: probeCountError } = await admin.from("events").select("*", { count: "exact", head: true }).eq("id", createdProbe.id);
  failIfError(probeCountError, "Verify Event Editor ownership deletion");
  assertEqual(probeCount ?? 0, 0, "Deleted Event Editor ownership probe");
  await publicClient.auth.signOut({ scope: "local" });
  console.log("QA verification passed: expected counts, role coverage, public content, FK presence, and zero PG/JR/Faculty profiles or invites.");
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
