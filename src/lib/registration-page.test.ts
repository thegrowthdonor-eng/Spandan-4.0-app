import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { Script } from "node:vm";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventParticipantsDialog } from "../app/events/event-participants-dialog";
import * as jsxRuntime from "react/jsx-runtime";
import ts from "typescript";
import * as status from "./registration-status";
import * as theme from "./theme-roster";
import * as operations from "./event-operations";
import * as categories from "./event-categories";

const Dock = () => null;
const Component = () => null;
const Participants = () => null;
const source = readFileSync(new URL("../app/events/[slug]/page.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;

type RosterRow = { event_id: string; review_state: string; selection_state: string; student_id: string; student: { full_name: string; participant_category: string; batches: { label: string }; roll_canonical: string } };

async function renderEvent(format: string, options: { gender?: string | null; failed?: boolean; state?: string; opens?: string; verified?: boolean; managesEvent?: boolean; roster?: RosterRow[]; rosterFailed?: boolean } = {}) {
  const event = { id: "event", edition_id: "edition", slug: "football", title: "Football", category: "sport", format, registration_enabled: true, state: options.state ?? "open", operating_method: "live_matches", summary: "Football", rules_markdown: "Play fairly", venue: "Ground", starts_at: null, ends_at: null, reporting_at: null, application_opens_at: options.opens ?? "2000-01-01T00:00:00Z", application_closes_at: "2099-01-01T00:00:00Z", application_questions: [], eligibility: { division: "boys" }, group_min_size: 2, group_max_size: 15 };
  function query(data: unknown, error: unknown = null) {
    const result = { data, error };
    const chain = { select: () => chain, eq: () => chain, neq: () => chain, maybeSingle: async () => result, then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve) };
    return chain;
  }
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: "verified-ug" } }, error: null }) },
    rpc: async (name: string, args: { p_event_id: string }) => {
      assert.equal(name, "can_manage_event");
      assert.equal(args.p_event_id, event.id);
      return { data: options.managesEvent === true };
    },
    from: (table: string) => query(table === "profiles" ? { gender: options.gender === undefined ? "male" : options.gender, participant_category: "ug" } : table === "access_records" ? { state: "active", verified_at: options.verified === false ? null : "2000-01-01" } : null, options.failed && table === "profiles" ? { message: "upstream failure" } : null),
  };
  const admin = { from: (table: string) => {
    if (table === "staff_assignments") {
      const staff = { select: () => staff, eq: () => staff, is: async () => ({ data: [] }) };
      return staff;
    }
    assert.equal(table, "applications");
    let rows = options.roster ?? [];
    let limit = 1000;
    const roster = {
      select: (columns: string) => {
        assert.equal(columns, "student_id,selection_state,student:profiles!applications_student_id_fkey(full_name,participant_category,batches(label))");
        return roster;
      },
      eq: (key: keyof RosterRow, value: string) => { rows = rows.filter(row => row[key] === value); return roster; },
      gt: (key: "student_id", value: string) => { assert.equal(key, "student_id"); rows = rows.filter(row => row.student_id > value); return roster; },
      order: (key: string) => { assert.equal(key, "student_id"); rows = [...rows].sort((a, b) => a.student_id.localeCompare(b.student_id)); return roster; },
      limit: (value: number) => { limit = value; return roster; },
      then: (resolve: (v: unknown) => unknown) => Promise.resolve({ data: options.rosterFailed ? null : rows.slice(0, limit), error: options.rosterFailed ? { message: "Failed" } : null }).then(resolve),
    };
    return roster;
  } };
  const dependencies: Record<string, unknown> = {
    "react/jsx-runtime": jsxRuntime,
    "next/headers": { cookies: async () => ({ getAll: () => [{ name: "sb-test-auth-token" }] }) },
    "next/navigation": { notFound: () => { throw Error("Missing event"); } },
    "next/link": { default: Component },
    "@/server/env": { hasPublicSupabaseConfiguration: () => true, hasSupabaseConfiguration: () => Boolean(options.roster || options.rosterFailed) },
    "@/server/public-cache": { coalesceCached: (...args: unknown[]) => (args.at(-1) as () => unknown)(), PUBLIC_CACHE_TAGS: {} },
    "@/server/supabase/admin": { createAdminClient: () => admin },
    "@/server/supabase/public": { createPublicClient: () => ({ from: (table: string) => query(table === "events" ? event : null) }) },
    "@/server/supabase/server": { createRequestClient: async () => client },
    "@/server/supabase/programme-fetch": { programmeCacheTag: "test" },
    "../apply-button": { ApplyButton: Component },
    "../event-registration-dock": { EventRegistrationDock: Dock },
    "../event-participants-dialog": { EventParticipantsDialog: Participants },
    "@/components/spandan-branding": { FestTopNav: Component },
    "../events.css": {},
    "@/lib/event-categories": categories, "@/lib/event-operations": operations,
    "@/lib/theme-roster": theme, "@/lib/registration-status": status,
  };
  const moduleObject = { exports: {} as { default: (props: unknown) => Promise<React.ReactElement> } };
  new Script(code).runInNewContext({ module: moduleObject, exports: moduleObject.exports, require: (name: string) => {
    assert.ok(name in dependencies, `Unexpected dependency ${name}`); return dependencies[name];
  }, Date, Intl });
  return moduleObject.exports.default({ params: Promise.resolve({ slug: "football" }) });
}

function find(node: React.ReactNode, component: () => null): Record<string, unknown> | null {
  if (!React.isValidElement<{ children?: React.ReactNode }>(node)) return null;
  if (node.type === component) return node.props;
  for (const child of React.Children.toArray(node.props.children)) {
    const found = find(child, component);
    if (found) return found;
  }
  return null;
}

async function renderDock(...args: Parameters<typeof renderEvent>) {
  const dock = find(await renderEvent(...args), Dock);
  assert.ok(dock);
  return dock;
}

test("the public roster only links to approved registrations for an organiser who manages the event", async () => {
  const organiser = find(await renderEvent("sport", { managesEvent: true }), Participants);
  assert.equal(organiser?.approvedRegistrationsHref, "/admin/review?event=event&status=approved");
  const student = find(await renderEvent("sport"), Participants);
  assert.ok(student);
  assert.equal(student.approvedRegistrationsHref, undefined);
});

test("public event participants include approved applicants once and separate confirmed roster status", async () => {
  const applicant: RosterRow = {
    event_id: "event", student_id: "100", review_state: "approved", selection_state: "unselected",
    student: { full_name: "Approved Player", participant_category: "ug", batches: { label: "2025" }, roll_canonical: "private-roll" },
  };
  const roster = [applicant, ...["submitted", "rejected", "withdrawn", "waitlisted"].map(review_state => ({ ...applicant, review_state })), { ...applicant, event_id: "other" }];
  async function renderDialog(options: Parameters<typeof renderEvent>[1]) {
    const props = find(await renderEvent("sport", options), Participants);
    assert.ok(props);
    return renderToStaticMarkup(React.createElement(EventParticipantsDialog, props as React.ComponentProps<typeof EventParticipantsDialog>));
  }
  const approved = await renderDialog({ roster });
  assert.match(approved, /Participants<\/span><strong>1<\/strong>/);
  assert.match(approved, /Approved Player.*>Approved<\/span>/);
  assert.doesNotMatch(approved, /private-roll|2025|Confirmed on roster/);

  const confirmed = await renderDialog({ roster: [{ ...applicant, selection_state: "selected" }] });
  assert.match(confirmed, /Participants<\/span><strong>1<\/strong>/);
  assert.match(confirmed, /Approved Player.*2025.*Confirmed on roster/);
  assert.match(await renderDialog({ roster: [] }), /No approved participants yet/);
  const unavailable = await renderDialog({ rosterFailed: true });
  assert.match(unavailable, /Unable to load participants/);
  assert.doesNotMatch(unavailable, /Participants<\/span><strong>0/);

  const paginated = await renderDialog({ roster: Array.from({ length: 201 }, (_, index) => ({ ...applicant, student_id: String(100 + index) })) });
  assert.match(paginated, /Participants<\/span><strong>201<\/strong>/);
});

test("verified matching-gender UG can register without a captain, partner or team in every format", async () => {
  for (const format of ["solo", "pair", "group", "sport"]) {
    const dock = await renderDock(format);
    assert.equal(dock.href, "#event-registration", format);
    assert.ok(dock.children, "Registration form missing");
  }
});
test("scheduled dates, gender and verification retain distinct registration states", async () => {
  const scheduled = await renderDock("sport", { opens: "2098-01-01T00:00:00Z" });
  assert.equal(scheduled.href, null);
  assert.equal(scheduled.status, "Scheduled");
  assert.equal((await renderDock("sport", { gender: "female" })).status, "Outside your division");
  const missing = await renderDock("sport", {gender:null});
  assert.equal(missing.status, "Gender details incomplete");
  assert.equal(missing.href, "/my-fest?tab=support");
  assert.equal((await renderDock("sport", { verified: false })).status, "Account verification pending");
  const failed = await renderDock("sport", { failed: true });
  assert.equal(failed.status, "Unable to load registration access");
  assert.notEqual(failed.href, "#event-registration");
});
