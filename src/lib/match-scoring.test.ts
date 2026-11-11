import assert from "node:assert/strict";
import test from "node:test";
import {matchScoringAction,type ScoringMatch} from "./match-scoring";

test("scoring shortcuts require explicit start and respect the IST date",()=>{
  const match:ScoringMatch={id:"a",event_id:"e",event_title:"Football",event_state:"ongoing",stage:"Final",participant_a_label:"A",participant_b_label:"B",venue:"Ground",starts_at:"2026-12-01T12:00:00Z",state:"scheduled",actual_started_at:null};
  assert.equal(matchScoringAction(match,Date.parse("2026-11-30T18:29:59Z")),"locked");
  assert.equal(matchScoringAction(match,Date.parse("2026-11-30T18:30:00Z")),"start");
  assert.equal(matchScoringAction({...match,state:"ongoing",actual_started_at:match.starts_at},Date.parse(match.starts_at!)),"continue");
  assert.equal(matchScoringAction({...match,event_state:"cancelled"},Date.parse(match.starts_at!)),"unavailable");
});
