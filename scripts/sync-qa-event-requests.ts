import { randomUUID } from "node:crypto";
import { failIfError, requireQaEnvironment } from "./qa-guard";

type EventRow = { id: string; slug: string; category: string; eligibility: { division?: string } | null };
type ProfileRow = { id: string; full_name: string; gender: string | null };

async function main() {
  const admin = requireQaEnvironment();
  const [eventsResult, profilesResult, accessResult, staffResult, applicationsResult] = await Promise.all([
    admin.from("events").select("id,slug,category,eligibility").order("slug"),
    admin.from("profiles").select("id,full_name,gender"),
    admin.from("access_records").select("profile_id,state").eq("state", "active"),
    admin.from("staff_assignments").select("profile_id,role,event_category,revoked_at"),
    admin.from("applications").select("event_id,student_id,review_state"),
  ]);
  for (const [label, result] of Object.entries({ eventsResult, profilesResult, accessResult, staffResult, applicationsResult })) {
    failIfError(result.error, `Read QA ${label}`);
  }

  const events = (eventsResult.data ?? []) as EventRow[];
  if (!events.length) throw new Error("No QA events found. Run qa:seed first.");

  const profiles = (profilesResult.data ?? []) as ProfileRow[];
  const profileByName = new Map(profiles.map((profile) => [profile.full_name, profile]));
  const sportsHead = profileByName.get("Kabir QA Sports Head");
  const cultureHead = profileByName.get("Meera QA Culture Head");
  if (!sportsHead || !cultureHead) throw new Error("QA Sports/Culture Head accounts are missing. Run qa:seed first.");

  const activeIds = new Set((accessResult.data ?? []).map((row: { profile_id: string }) => row.profile_id));
  const staffIds = new Set((staffResult.data ?? []).map((row: { profile_id: string }) => row.profile_id));
  const activeEventHeadKeys = new Set(
    (staffResult.data ?? [])
      .filter((row: { role: string; event_category: string | null; revoked_at: string | null }) => row.role === "event_head" && row.event_category && !row.revoked_at)
      .map((row: { profile_id: string; event_category: string }) => `${row.profile_id}:${row.event_category}`),
  );
  const missingHeadAssignments = [...new Set(events.map((event) => event.category))].flatMap((category) => {
    const head = category === "sport" ? sportsHead : cultureHead;
    return activeEventHeadKeys.has(`${head.id}:${category}`)
      ? []
      : [{ profile_id: head.id, role: "event_head", event_category: category, granted_by: head.id }];
  });
  if (missingHeadAssignments.length) {
    const { error } = await admin.from("staff_assignments").insert(missingHeadAssignments);
    failIfError(error, "Assign QA event heads by category");
  }

  const participantPool = profiles.filter((profile) => activeIds.has(profile.id) && !staffIds.has(profile.id));
  const existingApplications = applicationsResult.data ?? [];
  const rowsToInsert: Array<{
    event_id: string;
    student_id: string;
    idempotency_key: string;
    review_state: "submitted";
    selection_state: "unselected";
    answers: { qa_note: string };
  }> = [];

  for (const [eventIndex, event] of events.entries()) {
    const eventApplications = existingApplications.filter((application: { event_id: string }) => application.event_id === event.id);
    const pendingCount = eventApplications.filter((application: { review_state: string }) => application.review_state === "submitted").length;
    const needed = Math.max(0, 5 - pendingCount);
    if (!needed) continue;

    const existingStudentIds = new Set(eventApplications.map((application: { student_id: string }) => application.student_id));
    const division = event.eligibility?.division?.toLowerCase();
    const requiredGender = division === "boys" ? "male" : division === "girls" ? "female" : null;
    const eligible = participantPool.filter((profile) => !existingStudentIds.has(profile.id) && (!requiredGender || profile.gender === requiredGender));
    const rotation = eventIndex % Math.max(eligible.length, 1);
    const selected = eligible.slice(rotation).concat(eligible.slice(0, rotation)).slice(0, needed);
    if (selected.length !== needed) throw new Error(`Not enough eligible QA profiles for ${event.slug}: need ${needed}, found ${selected.length}.`);

    rowsToInsert.push(...selected.map((profile) => ({
      event_id: event.id,
      student_id: profile.id,
      idempotency_key: randomUUID(),
      review_state: "submitted" as const,
      selection_state: "unselected" as const,
      answers: { qa_note: "Pending fictional QA request for organiser review" },
    })));
  }

  if (rowsToInsert.length) {
    const { data: inserted, error: insertError } = await admin.from("applications").insert(rowsToInsert).select("id");
    failIfError(insertError, "Insert pending QA event requests");
    const { error: historyError } = await admin.from("application_history").insert((inserted ?? []).map((application: { id: string }) => ({
      application_id: application.id,
      to_review_state: "submitted",
      to_selection_state: "unselected",
      reason: "Fictional QA request created for organiser workflow testing",
    })));
    failIfError(historyError, "Create pending QA request history");
  }

  const { data: finalRows, error: finalError } = await admin.from("applications").select("event_id,review_state").eq("review_state", "submitted");
  failIfError(finalError, "Verify pending QA event requests");
  const incomplete = events.filter((event) => (finalRows ?? []).filter((row: { event_id: string }) => row.event_id === event.id).length < 5);
  if (incomplete.length) throw new Error(`Pending request verification failed for: ${incomplete.map((event) => event.slug).join(", ")}`);

  console.log(`QA request sync complete: ${rowsToInsert.length} added; all ${events.length} events have at least 5 pending requests; ${missingHeadAssignments.length} scoped coordinator assignments added.`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
