import assert from "node:assert/strict";
import { test } from "node:test";
import { participationTools } from "./event-participation";

test("participation tools never offer captains for solo or pair events", () => {
  assert.deepEqual(participationTools("solo"), { href: "/admin/selection", label: "Roster", noun: "participants", leader: null });
  assert.equal(participationTools("pair")?.label, "Pairs");
  assert.equal(participationTools("pair")?.leader, null);
  assert.equal(participationTools("group")?.leader, "Group Leader");
  assert.equal(participationTools("sport")?.leader, "Captain");
  assert.equal(participationTools(undefined), null);
});
