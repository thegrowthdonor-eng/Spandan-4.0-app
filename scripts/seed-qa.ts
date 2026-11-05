import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { toPrivateAuthEmail } from "../src/server/auth/identity";
import { failIfError, requireQaEnvironment } from "./qa-guard";
import { QA_EVENT_SLUGS, QA_PASSWORD, QA_ROLE_ACCOUNTS, qaEventDefinition } from "./qa-data";

type Account = { id: string; name: string; batch: string; roll: string; role: string; state: string };

const now = new Date().toISOString();
const qaEditionName = "Spandan 4.0 — Visual QA 2026";

async function resetQaProject(admin: ReturnType<typeof requireQaEnvironment>) {
  // Clear profile-dependent rows first. Auth deletion cascades into profiles, but
  // these author/owner FKs intentionally use RESTRICT in the production schema.
  for (const table of [
    "push_subscriptions", "help_messages", "help_threads", "feedback_responses",
    "poll_votes", "poll_options", "polls", "reminders", "group_memberships",
    "participant_groups", "application_history", "applications", "fixture_history",
    "score_snapshots", "points_ledger", "result_positions", "result_publications",
    "point_rules", "fixtures", "notices", "content_banners", "sponsors",
    "media_items", "stage_reveals", "organiser_profiles", "merchandise_items",
    "staff_assignments", "access_records", "audit_log", "events",
  ]) {
    const { error } = await admin.from(table).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    failIfError(error, `Clear QA ${table}`);
  }
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    failIfError(error, "List QA Auth users");
    const users = data.users;
    for (const user of users) {
      const { error: removeError } = await admin.auth.admin.deleteUser(user.id);
      failIfError(removeError, `Remove QA Auth user ${user.id}`);
    }
    if (users.length === 0) break;
  }
  const { error } = await admin.from("editions").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  failIfError(error, "Remove prior QA editions");
}

async function uploadAsset(admin: ReturnType<typeof requireQaEnvironment>, localPath: string, storagePath: string) {
  const body = await readFile(localPath);
  const { error } = await admin.storage.from("fest-media").upload(storagePath, body, { upsert: true, contentType: "image/webp", cacheControl: "3600" });
  failIfError(error, `Upload ${storagePath}`);
  const { data } = admin.storage.from("fest-media").getPublicUrl(storagePath);
  return data.publicUrl;
}

async function createAccount(
  admin: ReturnType<typeof requireQaEnvironment>,
  editionId: string,
  batches: Map<string, string>,
  input: Omit<Account, "id">,
  number: number,
) {
  const pepper = process.env.AUTH_IDENTITY_PEPPER;
  if (!pepper) throw new Error("AUTH_IDENTITY_PEPPER is required for deterministic QA identities.");
  const batchId = batches.get(input.batch);
  if (!batchId) throw new Error(`Unknown QA batch ${input.batch}`);
  // The sign-in form submits the admission year (for example "2021"), while
  // the database batch label is "MBBS 2021". Auth identity generation must
  // use the exact form value or every seeded account will be impossible to use.
  const authBatch = input.batch.replace(/^MBBS\s+/i, "");
  const authEmail = toPrivateAuthEmail({ batch: authBatch, rollNumber: input.roll }, pepper);
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email: authEmail, password: QA_PASSWORD, email_confirm: true, user_metadata: { qa_only: true },
  });
  failIfError(createError, `Create ${input.name}`);
  const id = created.user?.id;
  if (!id) throw new Error(`Auth did not return an id for ${input.name}`);
  const { error: provisionError } = await admin.rpc("provision_student_profile", {
    p_auth_user_id: id, p_edition_id: editionId, p_batch_id: batchId, p_full_name: input.name,
    p_roll_canonical: input.roll, p_phone_e164: `+919800${String(number).padStart(6, "0")}`,
    p_fest_id: `SPD-QA${String(number).padStart(4, "0")}`, p_auth_email: authEmail,
    p_gender: number % 2 ? "female" : "male",
  });
  failIfError(provisionError, `Provision ${input.name}`);
  return { ...input, id };
}

async function main() {
  const admin = requireQaEnvironment();
  await resetQaProject(admin);

  const { data: edition, error: editionError } = await admin.from("editions").insert({
    name: qaEditionName, timezone: "Asia/Kolkata", starts_on: "2026-12-01", ends_on: "2026-12-08", status: "published",
    registration_opens_at: "2026-10-01T00:00:00+05:30", registration_closes_at: "2026-11-30T23:59:00+05:30",
  }).select("id").single();
  failIfError(editionError, "Create QA edition");
  const editionId = edition.id as string;

  const batchLabels = ["MBBS 2021", "MBBS 2022", "MBBS 2023", "MBBS 2024", "MBBS 2025", "MBBS 2026"];
  const { data: batchRows, error: batchError } = await admin.from("batches").insert(batchLabels.map((label) => ({ edition_id: editionId, label, course_label: "MBBS", eligible: true }))).select("id,label");
  failIfError(batchError, "Create QA batches");
  const batches = new Map((batchRows ?? []).map((row: { id: string; label: string }) => [row.label, row.id]));

  const posterUrls = new Map<string, string>();
  for (const slug of QA_EVENT_SLUGS) {
    posterUrls.set(slug, await uploadAsset(admin, join(process.cwd(), "public", "event-posters", `${slug}.webp`), `qa/event-posters/${slug}.webp`));
  }
  const visuals = {
    flatlay: await uploadAsset(admin, join(process.cwd(), "public", "visuals", "festival-flatlay.webp"), "qa/festival-flatlay.webp"),
    moments: await uploadAsset(admin, join(process.cwd(), "public", "visuals", "campus-moments.webp"), "qa/campus-moments.webp"),
    stage: await uploadAsset(admin, join(process.cwd(), "public", "visuals", "stage-atmosphere.webp"), "qa/stage-atmosphere.webp"),
    cricket: await uploadAsset(admin, join(process.cwd(), "public", "qa-visuals", "cricket-victory.webp"), "qa/generated/cricket-victory.webp"),
    dance: await uploadAsset(admin, join(process.cwd(), "public", "qa-visuals", "cultural-dance.webp"), "qa/generated/cultural-dance.webp"),
    art: await uploadAsset(admin, join(process.cwd(), "public", "qa-visuals", "fine-arts-workshop.webp"), "qa/generated/fine-arts-workshop.webp"),
    tee: await uploadAsset(admin, join(process.cwd(), "public", "qa-visuals", "fest-tee.webp"), "qa/generated/fest-tee.webp"),
    hoodie: await uploadAsset(admin, join(process.cwd(), "public", "qa-visuals", "fest-hoodie.webp"), "qa/generated/fest-hoodie.webp"),
  };

  const eventInputs = QA_EVENT_SLUGS.map((slug, index) => ({
    edition_id: editionId, ...qaEventDefinition(slug, index), poster_url: posterUrls.get(slug),
    application_opens_at: "2026-10-01T00:00:00+05:30", application_closes_at: "2026-11-30T23:59:00+05:30",
  }));
  const { data: eventRows, error: eventError } = await admin.from("events").insert(eventInputs).select("id,slug,state,format,category");
  failIfError(eventError, "Create QA event catalogue");
  const events = new Map((eventRows ?? []).map((row: { id: string; slug: string; state: string; format: string; category: string }) => [row.slug, row]));

  const accounts: Omit<Account, "id">[] = [];
  batchLabels.forEach((batch, batchIndex) => {
    for (let roll = 1; roll <= 8; roll += 1) accounts.push({ name: `QA ${batch.replace("MBBS ", "")} Participant ${String(roll).padStart(2, "0")}`, batch, roll: String(roll), role: "participant", state: "active" });
    if (batchIndex === 0) accounts.push(...QA_ROLE_ACCOUNTS.map((account) => ({ name: account.name, batch, roll: account.roll, role: account.role, state: account.state })));
  });
  const createdAccounts: Account[] = [];
  for (const [index, account] of accounts.entries()) createdAccounts.push(await createAccount(admin, editionId, batches, account, index + 1));
  const mainAdmin = createdAccounts.find((account) => account.role === "main_admin");
  if (!mainAdmin) throw new Error("QA main admin was not created");

  for (const account of createdAccounts) {
    const update = account.state === "active"
      ? { state: "active", verified_by: mainAdmin.id, verified_at: now, ledger_reference: "QA-VISUAL-ONLY", reason: "Fictional QA account" }
      : { state: account.state, reason: `Fictional QA ${account.state} state` };
    const { error } = await admin.from("access_records").update(update).eq("edition_id", editionId).eq("profile_id", account.id);
    failIfError(error, `Set ${account.name} access state`);
  }

  const roleIds = new Map(createdAccounts.map((account) => [account.role, account.id]));
  const globalAssignments = ["main_admin", "treasurer", "event_coordinator", "notice_publisher"].map((role) => ({ profile_id: roleIds.get(role), role, granted_by: mainAdmin.id }));
  const sportsHead = createdAccounts.find((account) => account.name === "Kabir QA Sports Head")?.id;
  const cultureHead = createdAccounts.find((account) => account.name === "Meera QA Culture Head")?.id;
  const assignments = [
    ...globalAssignments,
    ...[...events.values()].map((event) => ({
      profile_id: event.category === "sport" ? sportsHead : cultureHead,
      role: "event_head",
      event_id: event.id,
      granted_by: mainAdmin.id,
    })),
  ];
  const { error: staffError } = await admin.from("staff_assignments").insert(assignments);
  failIfError(staffError, "Assign QA staff roles");

  const activeParticipants = createdAccounts.filter((account) => account.role === "participant" && account.state === "active");
  const applicationRows: { id: string; event_id: string; student_id: string; review_state: string; selection_state: string }[] = [];
  for (const [eventIndex, event] of [...events.values()].entries()) {
    const offset = (eventIndex * 3) % (activeParticipants.length - 10);
    let eventParticipants = activeParticipants.slice(offset, offset + 10);
    // The primary manual-QA account deliberately receives every major My Fest
    // review/selection state across the first five events.
    if (eventIndex < 5) {
      eventParticipants = eventParticipants.filter((participant) => participant.id !== activeParticipants[0].id).slice(0, 9);
      eventParticipants.splice(Math.min(eventIndex, 4), 0, activeParticipants[0]);
    }
    const rows = eventParticipants.map((participant, participantIndex) => ({
      event_id: event.id, student_id: participant.id, idempotency_key: randomUUID(), answers: { qa_note: "Fictional visual-QA registration" },
      review_state: participantIndex >= 5 ? "submitted" : participantIndex === 4 ? "rejected" : participantIndex === 3 ? "waitlisted" : "approved",
      selection_state: participantIndex >= 5 ? "unselected" : participantIndex === 0 ? "selected" : participantIndex === 1 ? "reserve" : "unselected",
      reviewed_by: participantIndex >= 5 ? null : mainAdmin.id,
      reviewed_at: participantIndex >= 5 ? null : now,
      review_reason: participantIndex === 4 ? "Fictional QA rejection example" : null,
    }));
    const { data, error } = await admin.from("applications").insert(rows).select("id,event_id,student_id,review_state,selection_state");
    failIfError(error, `Create applications for ${event.slug}`);
    applicationRows.push(...((data ?? []) as typeof applicationRows));
  }

  const applicationHistoryRows = applicationRows.flatMap((application) => {
    const rows = [{
      application_id: application.id, actor_id: mainAdmin.id,
      from_review_state: "submitted", to_review_state: application.review_state,
      reason: `Fictional QA ${application.review_state} review`,
    }];
    if (application.selection_state !== "unselected") rows.push({
      application_id: application.id, actor_id: mainAdmin.id,
      from_review_state: application.review_state, to_review_state: application.review_state,
      from_selection_state: "unselected", to_selection_state: application.selection_state,
      reason: `Fictional QA ${application.selection_state} selection`,
    } as typeof rows[number]);
    return rows;
  });
  const { error: applicationHistoryError } = await admin.from("application_history").insert(applicationHistoryRows);
  failIfError(applicationHistoryError, "Create QA application history");

  const groupSpecs = [
    ["box-cricket-boys", "QA Crimson XI", "MBBS 2021"],
    ["box-cricket-girls", "QA Sapphire Strikers", "MBBS 2022"],
    ["volleyball-boys", "QA Voltage Squad", "MBBS 2026"],
    ["group-dance", "QA Rhythm Collective", "MBBS 2024"],
    ["nukkad-natak", "QA Street Stage", "MBBS 2023"],
    ["tug-of-war-girls", "QA Iron Pulse", "MBBS 2025"],
  ] as const;
  for (const [slug, groupName, batchLabel] of groupSpecs) {
    const groupEvent = events.get(slug);
    if (!groupEvent) continue;
    const groupApps = applicationRows.filter((application) => application.event_id === groupEvent.id).slice(0, 3);
    const captain = groupApps[0];
    if (!captain) continue;
    const { data: group, error } = await admin.from("participant_groups").insert({ event_id: groupEvent.id, batch_id: batches.get(batchLabel), name: groupName, captain_id: captain.student_id, state: "published", published_at: now, created_by: mainAdmin.id }).select("id").single();
    failIfError(error, `Create QA participant group for ${slug}`);
    const { error: membershipError } = await admin.from("group_memberships").insert(groupApps.map((application) => ({ group_id: group.id, application_id: application.id, added_by: mainAdmin.id })));
    failIfError(membershipError, `Create QA group memberships for ${slug}`);
  }

  const fixtureSpecs = [
    ["box-cricket-boys", "League match", "MBBS 2021", "MBBS 2023", "ongoing", "live", "2026-12-08T10:00:00+05:30", { teamA_runs: 86, teamA_wickets: 4, teamB_runs: 52, teamB_wickets: 2, summary: "8 overs" }],
    ["football-boys-7v7", "Semi-final", "MBBS 2022", "MBBS 2024", "ongoing", "paused", "2026-12-08T15:00:00+05:30", { teamA_goals: 1, teamB_goals: 1, summary: "Weather pause" }],
    ["badminton-singles-boys", "Final", "MBBS 2025", "MBBS 2021", "completed", "final", "2026-12-06T11:00:00+05:30", { set1: "21–16", set2: "18–21", set3: "21–19", summary: "Final score" }],
    ["badminton-singles-girls", "Final", "MBBS 2022", "MBBS 2026", "completed", "final", "2026-12-07T11:00:00+05:30", { set1: "21-14", set2: "21-18", summary: "Straight-games final" }],
    ["100m-sprint-boys", "Final heat", "MBBS 2021", "MBBS 2024", "completed", "final", "2026-12-01T09:00:00+05:30", { summary: "Winner: 11.42 s" }],
    ["100m-sprint-girls", "Final heat", "MBBS 2023", "MBBS 2025", "completed", "final", "2026-12-02T11:00:00+05:30", { summary: "Winner: 13.08 s" }],
    ["carrom-doubles-open", "Championship board", "MBBS 2024", "MBBS 2026", "completed", "final", "2026-12-02T13:00:00+05:30", { summary: "2-1 boards" }],
    ["chess-championship-open", "Final table", "MBBS 2025", "MBBS 2022", "completed", "final", "2026-12-03T15:00:00+05:30", { summary: "1-0 after 42 moves" }],
    ["volleyball-boys", "Pool A", "MBBS 2026", "MBBS 2022", "scheduled", "scheduled", "2026-12-02T13:00:00+05:30", { summary: "Teams reporting" }],
    ["box-cricket-girls", "League match", "MBBS 2023", "MBBS 2025", "scheduled", "scheduled", "2026-12-04T09:00:00+05:30", { summary: "Toss pending" }],
    ["throwball-girls", "Pool B", "MBBS 2021", "MBBS 2026", "scheduled", "scheduled", "2026-12-06T13:00:00+05:30", { summary: "Teams reporting" }],
    ["tug-of-war-boys", "Quarter-final", "MBBS 2022", "MBBS 2024", "scheduled", "scheduled", "2026-12-08T09:00:00+05:30", { summary: "Arena call pending" }],
  ] as const;
  for (const [slug, stage, a, b, state, status, startsAt, payload] of fixtureSpecs) {
    const event = events.get(slug);
    if (!event) continue;
    const start = new Date(startsAt);
    const reportingAt = new Date(start.getTime() - 30 * 60 * 1000).toISOString();
    const { data: fixture, error } = await admin.from("fixtures").insert({ event_id: event.id, stage, participant_a_label: a, participant_b_label: b, venue: "Sports Ground", reporting_at: reportingAt, starts_at: startsAt, state, created_by: mainAdmin.id }).select("id").single();
    failIfError(error, `Create fixture for ${slug}`);
    const { error: snapshotError } = await admin.from("score_snapshots").insert({ fixture_id: fixture.id, version: 1, status, score_payload: payload, updated_by: mainAdmin.id, updated_at: now });
    failIfError(snapshotError, `Create score snapshot for ${slug}`);
    const { error: fixtureHistoryError } = await admin.from("fixture_history").insert({
      fixture_id: fixture.id, actor_id: mainAdmin.id,
      previous_schedule: { reporting_at: reportingAt, starts_at: startsAt, state: "draft" },
      reason: "Fictional QA schedule publication history",
    });
    failIfError(fixtureHistoryError, `Create fixture history for ${slug}`);
  }

  const resultEvents = [...events.values()].filter((event) => event.state === "completed");
  for (const [resultIndex, event] of resultEvents.entries()) {
    const resultImage = event.category === "sport"
      ? visuals.cricket
      : event.slug === "poster-making" || event.slug === "creative-writing"
        ? visuals.art
        : visuals.dance;
    const { data: publication, error } = await admin.from("result_publications").insert({
      event_id: event.id, version: 1, state: "published", reason: "Fictional QA result publication",
      published_by: mainAdmin.id, published_at: now, podium_photo_url: resultImage,
      podium_caption: `Fictional winners' moment for ${event.slug.replaceAll("-", " ")}.`,
    }).select("id").single();
    failIfError(error, `Publish QA result for ${event.slug}`);
    const winners = [0, 1, 2].map((offset) => batchLabels[(resultIndex * 2 + offset) % batchLabels.length]);
    const positionPoints = [10, 6, 3];
    const positions = winners.map((label, index) => ({
      publication_id: publication.id, placing: index + 1, batch_id: batches.get(label),
      winner_name: `${label} QA ${index === 0 ? "Champions" : index === 1 ? "Runners-up" : "Bronze Team"}`,
      participant_category: "ug", awarded_points: positionPoints[index], note: "Fictional QA podium",
    }));
    const { error: positionError } = await admin.from("result_positions").insert(positions);
    failIfError(positionError, `Create QA positions for ${event.slug}`);
    const { error: rulesError } = await admin.from("point_rules").insert(positionPoints.map((points, index) => ({ event_id: event.id, placing: index + 1, points, configured_by: mainAdmin.id })));
    failIfError(rulesError, `Create QA point rules for ${event.slug}`);
    const { error: ledgerError } = await admin.from("points_ledger").insert(positions.map((position, index) => ({ publication_id: publication.id, batch_id: position.batch_id, points: positionPoints[index] })));
    failIfError(ledgerError, `Create QA points ledger for ${event.slug}`);
  }

  const noticePublisher = roleIds.get("notice_publisher") ?? mainAdmin.id;
  const firstEvent = events.get("solo-singing");
  const { error: noticesError } = await admin.from("notices").insert([
    { edition_id: editionId, title: "QA opening bulletin", body: "Fictional visual-QA notice for layout review. No real festival instruction.", audience: "public", urgency: "important", publish_at: now, published_by: noticePublisher },
    { edition_id: editionId, event_id: firstEvent?.id, title: "QA reporting reminder", body: "Fictional event-participant notice used to inspect targeting states.", audience: "event_participants", urgency: "normal", publish_at: now, published_by: noticePublisher },
    { edition_id: editionId, title: "QA venue update", body: "The fictional literary events desk has moved to the seminar hall for responsive-content testing.", audience: "public", urgency: "normal", publish_at: now, published_by: noticePublisher },
    { edition_id: editionId, title: "QA weather advisory", body: "Outdoor fixtures may pause briefly; live score cards demonstrate the paused state.", audience: "public", urgency: "urgent", publish_at: now, published_by: noticePublisher },
    { edition_id: editionId, event_id: events.get("group-dance")?.id, title: "QA rehearsal call", body: "Fictional rehearsal call for selected group-dance participants.", audience: "event_participants", urgency: "important", publish_at: now, published_by: noticePublisher },
    { edition_id: editionId, title: "QA closing-night guide", body: "Fictional gates, stage and collection-desk guidance for visual testing only.", audience: "public", urgency: "normal", publish_at: now, published_by: noticePublisher },
  ]);
  failIfError(noticesError, "Create QA notices");
  const pollSpecs = [
    { question: "Which fictional QA area should get a UI spotlight?", options: ["Programme", "Live scores", "Gallery"], eventId: null },
    { question: "Which closing-night segment are you most excited to inspect?", options: ["Group dance", "Solo singing", "Fashion show", "Prize ceremony"], eventId: events.get("group-dance")?.id ?? null },
    { question: "Pick the next fictional merchandise colourway.", options: ["Forest green", "Rust orange", "Midnight blue"], eventId: null },
  ];
  for (const [pollIndex, spec] of pollSpecs.entries()) {
    const { data: poll, error: pollError } = await admin.from("polls").insert({
      edition_id: editionId, event_id: spec.eventId, question: spec.question,
      opens_at: "2026-10-01T00:00:00+05:30", closes_at: "2027-01-01T00:00:00+05:30",
      show_totals_before_close: pollIndex !== 1, published_at: now, created_by: mainAdmin.id,
    }).select("id").single();
    failIfError(pollError, `Create QA poll ${pollIndex + 1}`);
    const { data: options, error: optionError } = await admin.from("poll_options").insert(spec.options.map((label, sort_order) => ({ poll_id: poll.id, label, sort_order }))).select("id");
    failIfError(optionError, `Create QA poll ${pollIndex + 1} options`);
    const { error: voteError } = await admin.from("poll_votes").insert(activeParticipants.slice(pollIndex * 5, (pollIndex * 5) + 5).map((participant, index) => ({ poll_id: poll.id, option_id: options?.[index % spec.options.length]?.id, profile_id: participant.id })));
    failIfError(voteError, `Create QA poll ${pollIndex + 1} votes`);
  }
  const reminderEvents = ["solo-singing", "group-dance", "box-cricket-boys", "quiz-bowl", "poster-making", "volleyball-boys"];
  const { error: engagementError } = await admin.from("reminders").insert(reminderEvents.map((slug, index) => ({
    profile_id: activeParticipants[index].id, event_id: events.get(slug)?.id, source_version: `qa-reminder-v${index + 1}`,
    title: `${slug.replaceAll("-", " ")} QA reminder`, body: "Fictional reminder for My Fest visual review.",
    due_at: `2026-12-0${(index % 6) + 1}T09:00:00+05:30`, dismissed_at: index === 5 ? now : null,
  })));
  failIfError(engagementError, "Create QA reminder");
  const { error: pushError } = await admin.from("push_subscriptions").insert({ profile_id: activeParticipants[0].id, endpoint: "https://example.test/qa-push-subscription", p256dh: "qa-public-key-placeholder", auth: "qa-auth-placeholder", user_agent: "Spandan QA visual-data seed" });
  failIfError(pushError, "Create QA push subscription");
  const { error: feedbackError } = await admin.from("feedback_responses").insert(activeParticipants.slice(0, 8).map((participant, index) => ({
    edition_id: editionId, event_id: index % 2 ? firstEvent?.id : null, form_key: index % 2 ? "qa-event-feedback" : "festival-pulse",
    profile_id: participant.id, answers: { rating: 3 + (index % 3), comment: `Fictional visual QA response ${index + 1}` },
  })));
  failIfError(feedbackError, "Create QA feedback");
  const helpStates = ["open", "in_progress", "resolved", "closed"] as const;
  for (const [index, state] of helpStates.entries()) {
    const owner = activeParticipants[index];
    const { data: thread, error: threadError } = await admin.from("help_threads").insert({
      edition_id: editionId, owner_id: owner.id, event_id: index < 3 ? firstEvent?.id : null,
      subject: `QA help thread — ${state.replaceAll("_", " ")}`, state,
      assigned_to: state === "open" ? null : mainAdmin.id,
    }).select("id").single();
    failIfError(threadError, `Create QA help thread ${index + 1}`);
    const { error: messageError } = await admin.from("help_messages").insert([
      { thread_id: thread.id, author_id: owner.id, body: `Fictional participant question showing the ${state} state.` },
      { thread_id: thread.id, author_id: mainAdmin.id, body: "Fictional organiser response with enough copy to test wrapping and spacing." },
      { thread_id: thread.id, author_id: owner.id, body: "Thanks — this final fictional reply tests a longer conversation thread." },
    ]);
    failIfError(messageError, `Create QA help messages ${index + 1}`);
  }

  const publish = { edition_id: editionId, state: "published", publish_at: now, updated_by: mainAdmin.id };
  const { error: promotionError } = await admin.from("content_banners").insert([
    { ...publish, title: "QA Opening Day", subtitle: "Fictional banner — Programme and fixtures are ready for inspection.", image_url: visuals.flatlay, image_alt: "Fictional QA festival flatlay", link_url: "/schedule", sort_order: 1, visible: true },
    { ...publish, title: "QA Live Sports Desk", subtitle: "Cricket, football and court fixtures with live, paused and final score states.", image_url: visuals.cricket, image_alt: "Fictional student cricket team celebrating", link_url: "/live", sort_order: 2, visible: true },
    { ...publish, title: "QA Cultural Night", subtitle: "A full-width cultural programme visual for responsive banner testing.", image_url: visuals.dance, image_alt: "Fictional student dance performance", link_url: "/gallery", sort_order: 3, visible: true },
    { ...publish, title: "QA Creative Arena", subtitle: "Fine arts, writing and design highlights across the festival week.", image_url: visuals.art, image_alt: "Fictional student fine-arts workshop", link_url: "/events", sort_order: 4, visible: true },
  ]);
  failIfError(promotionError, "Create QA banners");
  const { error: sponsorError } = await admin.from("sponsors").insert([
    { ...publish, name: "Fictional QA Studio", tier: "Title", logo_url: visuals.flatlay, logo_alt: "Fictional QA Studio logo placeholder", description: "Fictional sponsor for UI QA only.", website_url: "https://example.com/qa-studio", sort_order: 1 },
    { ...publish, name: "Demo Campus Collective", tier: "Partner", logo_url: visuals.moments, logo_alt: "Demo Campus Collective logo placeholder", description: "Fictional sponsor for UI QA only.", website_url: "https://example.com/demo-collective", sort_order: 2 },
    { ...publish, name: "Sample Sports Lab", tier: "Sports Partner", logo_url: visuals.cricket, logo_alt: "Fictional sports partner visual", description: "Fictional sports partner used to test a longer sponsor description and logo crop.", website_url: "https://example.com/sample-sports", sort_order: 3 },
    { ...publish, name: "Canvas QA Works", tier: "Creative Partner", logo_url: visuals.art, logo_alt: "Fictional creative partner visual", description: "Fictional creative partner for gallery and arts UI review.", website_url: "https://example.com/canvas-qa", sort_order: 4 },
  ]);
  failIfError(sponsorError, "Create QA sponsors");
  const { error: mediaError } = await admin.from("media_items").insert([
    { ...publish, kind: "image", title: "Victory at the QA Cricket Ground", asset_url: visuals.cricket, thumbnail_url: visuals.cricket, alt_text: "Fictional student cricket team celebrating with a trophy", caption: "A fictional post-match celebration for the sports gallery.", rights_note: "AI-generated QA-only asset." },
    { ...publish, kind: "image", title: "Cultural Night in Motion", asset_url: visuals.dance, thumbnail_url: visuals.dance, alt_text: "Fictional student group dance on a colourful stage", caption: "A fictional group-dance highlight under the closing-night lights.", rights_note: "AI-generated QA-only asset." },
    { ...publish, kind: "image", title: "Colours of the Creative Arena", asset_url: visuals.art, thumbnail_url: visuals.art, alt_text: "Fictional students painting together in a campus courtyard", caption: "Fictional artists preparing entries for the fine-arts showcase.", rights_note: "AI-generated QA-only asset." },
    { ...publish, kind: "image", title: "Track, Court and Stage", asset_url: visuals.moments, thumbnail_url: visuals.moments, alt_text: "Fictional collage of athletics badminton and stage activity", caption: "A visual recap spanning sports and cultural events.", rights_note: "QA-only local asset." },
    { ...publish, kind: "teaser", title: "Main Stage Soundcheck", asset_url: visuals.stage, thumbnail_url: visuals.stage, alt_text: "Empty fictional festival stage under warm spotlights", caption: "The fictional main stage before the first performance.", rights_note: "QA-only local asset." },
    { ...publish, kind: "image", title: "Festival Essentials Flatlay", asset_url: visuals.flatlay, thumbnail_url: visuals.flatlay, alt_text: "Festival flatlay with medical sports arts and music objects", caption: "A still-life combining the festival's fictional programme tracks.", rights_note: "QA-only local asset." },
    { ...publish, kind: "image", title: "Sports Champions Portrait", asset_url: visuals.cricket, thumbnail_url: visuals.cricket, alt_text: "Fictional sports champions on the campus ground", caption: "A second crop target for masonry and repeated-card testing.", rights_note: "AI-generated QA-only asset." },
    { ...publish, kind: "image", title: "Dance Finale Wide Shot", asset_url: visuals.dance, thumbnail_url: visuals.dance, alt_text: "Wide fictional dance finale on stage", caption: "A wide stage image used to inspect responsive gallery cropping.", rights_note: "AI-generated QA-only asset." },
    { ...publish, kind: "image", title: "Poster Studio Detail", asset_url: visuals.art, thumbnail_url: visuals.art, alt_text: "Fictional fine-arts studio detail", caption: "Brushes, colour and collaborative work from the fictional poster studio.", rights_note: "AI-generated QA-only asset." },
  ]);
  failIfError(mediaError, "Create QA media");
  const { error: revealError } = await admin.from("stage_reveals").insert([
    { edition_id: editionId, artist_name: "Fictional QA Showcase", description: "A fictional headline stage reveal used only to test content states.", image_url: visuals.stage, image_alt: "Fictional QA stage reveal", stage_at: "2026-12-08T18:00:00+05:30", reveal_at: now, state: "published", updated_by: mainAdmin.id },
    { edition_id: editionId, artist_name: "Demo Fusion Collective", description: "A fictional student fusion showcase with a longer programme description.", image_url: visuals.dance, image_alt: "Fictional fusion dance showcase", stage_at: "2026-12-07T19:30:00+05:30", reveal_at: now, state: "published", updated_by: mainAdmin.id },
  ]);
  failIfError(revealError, "Create QA stage reveal");
  const { error: organiserError } = await admin.from("organiser_profiles").insert([
    { ...publish, profile_id: mainAdmin.id, display_name: "Aarav QA Admin", title: "Fictional QA Festival Lead", photo_url: visuals.flatlay, photo_alt: "Fictional QA lead", public_contact: "qa-lead@example.test", contact_approved: true, sort_order: 1 },
    { ...publish, profile_id: roleIds.get("event_coordinator"), display_name: "Ishaan QA Coordinator", title: "Fictional QA Programme Coordinator", photo_url: visuals.moments, photo_alt: "Fictional QA coordinator", public_contact: null, contact_approved: false, sort_order: 2 },
    { ...publish, profile_id: roleIds.get("treasurer"), display_name: "Diya QA Treasurer", title: "Fictional QA Finance & Collection Desk", photo_url: visuals.tee, photo_alt: "Fictional QA treasurer card visual", public_contact: "qa-treasury@example.test", contact_approved: true, sort_order: 3 },
    { ...publish, profile_id: sportsHead, display_name: "Kabir QA Sports Head", title: "Fictional QA Sports Operations", photo_url: visuals.cricket, photo_alt: "Fictional QA sports head card visual", public_contact: null, contact_approved: false, sort_order: 4 },
    { ...publish, profile_id: cultureHead, display_name: "Meera QA Culture Head", title: "Fictional QA Cultural Operations", photo_url: visuals.dance, photo_alt: "Fictional QA culture head card visual", public_contact: null, contact_approved: false, sort_order: 5 },
    { ...publish, profile_id: roleIds.get("notice_publisher"), display_name: "Sara QA Notice Publisher", title: "Fictional QA Communications Desk", photo_url: visuals.art, photo_alt: "Fictional QA communications card visual", public_contact: "qa-notices@example.test", contact_approved: true, sort_order: 6 },
  ]);
  failIfError(organiserError, "Create QA committee directory");
  const { error: merchError } = await admin.from("merchandise_items").insert([
    { ...publish, name: "Fictional QA Forest Fest Tee", description: "Heavyweight forest-green cotton tee with a small original pulse-and-spark emblem.", image_url: visuals.tee, image_alt: "Forest-green fictional festival T-shirt product photo", sizes: ["XS", "S", "M", "L", "XL", "XXL"], availability_note: "QA sample stock — all size chips visible", collection_note: "Fictional desk: Academic Block, 10 AM–5 PM.", contact_note: "QA contact only: qa-merch@example.test" },
    { ...publish, name: "Fictional QA Rust Hoodie", description: "Warm rust-orange brushed-cotton hoodie prepared for image crop, long-copy and size-list review.", image_url: visuals.hoodie, image_alt: "Rust-orange fictional festival hoodie product photo", sizes: ["S", "M", "L", "XL", "XXL"], availability_note: "Limited QA sample", collection_note: "Fictional pickup after size trial at the fest desk.", contact_note: "QA contact only: qa-merch@example.test" },
    { ...publish, name: "Fictional QA Volunteer Tee", description: "A second tee listing used to test repeated imagery, compact copy and sold-out messaging.", image_url: visuals.tee, image_alt: "Fictional volunteer T-shirt product photo", sizes: ["S", "M", "L", "XL"], availability_note: "QA display — selected sizes unavailable", collection_note: "Fictional volunteer counter collection only.", contact_note: "QA contact only: qa-merch@example.test" },
    { ...publish, name: "Fictional QA Night Hoodie", description: "A premium hoodie variant used to fill a second merchandise row on desktop layouts.", image_url: visuals.hoodie, image_alt: "Fictional night hoodie product photo", sizes: ["M", "L", "XL"], availability_note: "QA pre-booking closed", collection_note: "Fictional closing-night pickup window: 6–8 PM.", contact_note: "QA contact only: qa-merch@example.test" },
    { ...publish, name: "Fictional QA Festival Keepsake Pack", description: "A non-commerce mock listing for badge, wristband and programme-card presentation.", image_url: visuals.flatlay, image_alt: "Fictional festival keepsake flatlay", sizes: [], availability_note: "QA desk sample", collection_note: "Fictional information desk collection while supplies last.", contact_note: "QA contact only: qa-merch@example.test" },
  ]);
  failIfError(merchError, "Create QA merchandise");

  console.table(createdAccounts.filter((account) => account.role !== "participant" || account.state !== "active").map((account) => ({ identity: `${account.batch} / ${account.roll}`, role: account.role, state: account.state, password: QA_PASSWORD })));
  console.log(`QA seed complete: ${eventRows?.length ?? 0} events, ${createdAccounts.length} fictional UG accounts, project ${process.env.QA_PROJECT_REF}.`);
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
