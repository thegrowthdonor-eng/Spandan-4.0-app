import assert from "node:assert/strict";
import test from "node:test";
import { groupStandings, resultIdentity, type PublishedEventResult, type ResultPosition } from "./results";

const solo: ResultPosition = {
  placing: 1,
  batch_id: "batch-2024",
  batch_label: "2024",
  winner_name: "Aarohi Sharma",
  winner_roll: "17",
  participant_category: "ug",
  application_id: "application-1",
  group_id: null,
  points: 10,
  note: null,
};

test("resultIdentity orders solo name, roll, and batch while keeping teams batch-only", () => {
  assert.deepEqual(resultIdentity(solo), {
    primary: "Aarohi Sharma",
    secondary: "Roll No. 17 · Batch 2024",
  });
  assert.deepEqual(resultIdentity({ ...solo, winner_name: "Falcons", winner_roll: null, application_id: null, group_id: "group-1" }), {
    primary: "Falcons",
    secondary: "Batch 2024",
  });
});

test("groupStandings attaches only the published finishes belonging to each batch", () => {
  const results: PublishedEventResult[] = [{
    event_id: "event-1",
    event_title: "100m Sprint",
    event_slug: "100m-sprint",
    category: "sport",
    published_at: "2026-12-03T09:00:00Z",
    podium_photo_url: null,
    podium_caption: null,
    positions: [solo, { ...solo, placing: 2, batch_id: "batch-2023", batch_label: "2023" }],
  }];
  const grouped = groupStandings([
    { batch_id: "batch-2024", label: "2024", course_label: "MBBS", points: 10 },
    { batch_id: "batch-2023", label: "2023", course_label: "MBBS", points: 6 },
  ], results);

  assert.deepEqual(grouped.map((standing) => standing.finishes.map((finish) => [finish.event_title, finish.placing])), [
    [["100m Sprint", 1]],
    [["100m Sprint", 2]],
  ]);
});
