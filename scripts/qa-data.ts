export const QA_PASSWORD = "SpandanQA!2026";

export const QA_EVENT_SLUGS = [
  "100m-sprint-boys", "100m-sprint-girls", "badminton-doubles-boys", "badminton-doubles-girls",
  "badminton-mixed-doubles", "badminton-singles-boys", "badminton-singles-girls", "box-cricket-boys",
  "box-cricket-girls", "carrom-doubles-open", "chess-championship-open", "creative-writing", "debate",
  "face-painting", "fashion-show", "football-boys-7v7", "group-dance", "nukkad-natak", "photography-walk",
  "poetry-slam", "poster-making", "quiz-bowl", "rangoli", "relay-4x100m-boys", "relay-4x100m-girls",
  "shot-put-boys", "shot-put-girls", "solo-singing", "table-tennis-singles-boys", "table-tennis-singles-girls",
  "throwball-girls", "tug-of-war-boys", "tug-of-war-girls", "volleyball-boys",
] as const;

const TITLES: Record<(typeof QA_EVENT_SLUGS)[number], string> = {
  "100m-sprint-boys": "100m Sprint — Boys", "100m-sprint-girls": "100m Sprint — Girls", "badminton-doubles-boys": "Badminton Doubles — Boys", "badminton-doubles-girls": "Badminton Doubles — Girls",
  "badminton-mixed-doubles": "Badminton Mixed Doubles", "badminton-singles-boys": "Badminton Singles — Boys", "badminton-singles-girls": "Badminton Singles — Girls", "box-cricket-boys": "Box Cricket — Boys",
  "box-cricket-girls": "Box Cricket — Girls", "carrom-doubles-open": "Carrom Doubles — Open", "chess-championship-open": "Chess Championship — Open", "creative-writing": "Creative Writing",
  debate: "Debate", "face-painting": "Face Painting", "fashion-show": "Fashion Show", "football-boys-7v7": "Football 7v7 — Boys", "group-dance": "Group Dance", "nukkad-natak": "Nukkad Natak",
  "photography-walk": "Photography Walk", "poetry-slam": "Poetry Slam", "poster-making": "Poster Making", "quiz-bowl": "Quiz Bowl", rangoli: "Rangoli",
  "relay-4x100m-boys": "4×100m Relay — Boys", "relay-4x100m-girls": "4×100m Relay — Girls", "shot-put-boys": "Shot Put — Boys", "shot-put-girls": "Shot Put — Girls",
  "solo-singing": "Solo Singing", "table-tennis-singles-boys": "Table Tennis Singles — Boys", "table-tennis-singles-girls": "Table Tennis Singles — Girls", "throwball-girls": "Throwball — Girls",
  "tug-of-war-boys": "Tug of War — Boys", "tug-of-war-girls": "Tug of War — Girls", "volleyball-boys": "Volleyball — Boys",
};

const SPORTS = new Set<string>(QA_EVENT_SLUGS.filter((slug) => /sprint|badminton|cricket|carrom|chess|football|relay|shot-put|table-tennis|throwball|tug-of-war|volleyball/.test(slug)));
const GROUPS = new Set(["group-dance", "nukkad-natak", "fashion-show"]);
const COMPLETED = new Set([
  "100m-sprint-boys", "100m-sprint-girls", "badminton-singles-boys", "badminton-singles-girls",
  "carrom-doubles-open", "chess-championship-open", "creative-writing", "poetry-slam",
  "poster-making", "solo-singing",
]);
const CLOSED = new Set(["group-dance", "fashion-show", "quiz-bowl", "rangoli"]);

function qaSportSubCategory(slug: string) {
  if (/100m-sprint|relay|shot-put/.test(slug)) return "athletics";
  if (/badminton|table-tennis/.test(slug)) return "racket";
  if (/carrom|chess/.test(slug)) return "indoor";
  if (/tug-of-war/.test(slug)) return "strength";
  return "field";
}

export function qaEventDefinition(slug: (typeof QA_EVENT_SLUGS)[number], index: number) {
  const day = String(1 + (index % 8)).padStart(2, "0");
  const hour = 9 + ((index % 4) * 2);
  const sport = SPORTS.has(slug);
  const state = slug === "photography-walk"
    ? "cancelled"
    : ["box-cricket-boys", "football-boys-7v7"].includes(slug)
      ? "ongoing"
      : COMPLETED.has(slug)
        ? "completed"
        : CLOSED.has(slug)
          ? "closed"
          : "open";
  return {
    title: TITLES[slug], slug, category: sport ? "sport" : ["creative-writing", "debate", "poetry-slam", "quiz-bowl"].includes(slug) ? "literary" : "cultural",
    format: sport ? "sport" : GROUPS.has(slug) ? "group" : "solo", score_template: slug.includes("cricket") ? "cricket" : slug.includes("football") ? "football" : slug.includes("badminton") ? "badminton" : "generic",
    state, venue: sport ? "Sports Ground" : "Main Auditorium", starts_at: `2026-12-${day}T${String(hour).padStart(2, "0")}:00:00+05:30`, ends_at: `2026-12-${day}T${String(hour + 1).padStart(2, "0")}:30:00+05:30`, reporting_at: `2026-12-${day}T${String(hour - 1).padStart(2, "0")}:30:00+05:30`,
    summary: `Fictional visual-QA entry for ${TITLES[slug]}.`, rules_markdown: "QA-only rules: arrive on time, follow the organiser briefing, and use this entry only for interface review.", application_capacity: sport ? 24 : 60, waitlist_enabled: true, eligibility: { division: slug.includes("girls") ? "girls" : slug.includes("boys") ? "boys" : "open", ...(sport ? { sub_category: qaSportSubCategory(slug) } : {}) }, application_questions: [{ key: "qa_note", label: "QA preference", required: false }], group_min_size: sport || GROUPS.has(slug) ? 2 : null, group_max_size: sport || GROUPS.has(slug) ? 15 : null, batch_restricted: false,
  };
}

export const QA_ROLE_ACCOUNTS = [
  { name: "Aarav QA Admin", roll: "91", role: "main_admin", state: "active" }, { name: "Diya QA Treasurer", roll: "92", role: "treasurer", state: "active" },
  { name: "Kabir QA Sports Head", roll: "93", role: "event_head", state: "active" }, { name: "Meera QA Culture Head", roll: "94", role: "event_head", state: "active" },
  { name: "Ishaan QA Coordinator", roll: "95", role: "event_coordinator", state: "active" }, { name: "Sara QA Notice Publisher", roll: "96", role: "notice_publisher", state: "active" }, { name: "Naina QA Event Editor", roll: "100", role: "event_editor", state: "active" },
  { name: "Pending QA Participant", roll: "97", role: "participant", state: "pending" }, { name: "Rejected QA Participant", roll: "98", role: "participant", state: "rejected" }, { name: "Suspended QA Participant", roll: "99", role: "participant", state: "suspended" },
] as const;
