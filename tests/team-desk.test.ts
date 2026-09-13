import test from "node:test";
import assert from "node:assert/strict";

import { deriveTeamDeskState, teamDeskAllowedActions } from "../src/lib/team-desk";

test("Team desk distinguishes setup, unavailable, empty, active, and attention states", () => {
  assert.equal(deriveTeamDeskState({ configured: false, adapterReachable: false, retainedCount: 0, inventoryCount: 0, needsAttention: false }), "SETUP_REQUIRED");
  assert.equal(deriveTeamDeskState({ configured: true, adapterReachable: false, retainedCount: 2, inventoryCount: 0, needsAttention: false }), "ADAPTER_UNAVAILABLE");
  assert.equal(deriveTeamDeskState({ configured: true, adapterReachable: true, retainedCount: 0, inventoryCount: 0, needsAttention: false }), "READY_EMPTY");
  assert.equal(deriveTeamDeskState({ configured: true, adapterReachable: true, retainedCount: 1, inventoryCount: 1, needsAttention: false }), "ACTIVE_ROSTER");
  assert.equal(deriveTeamDeskState({ configured: true, adapterReachable: true, retainedCount: 1, inventoryCount: 1, needsAttention: true }), "NEEDS_ATTENTION");
});

test("Team desk actions preserve role and readiness boundaries", () => {
  assert.deepEqual(teamDeskAllowedActions("VIEWER", "ACTIVE_ROSTER", 1), { add: false, adopt: false, retry: false, chat: false });
  assert.deepEqual(teamDeskAllowedActions("OPERATOR", "ACTIVE_ROSTER", 1), { add: false, adopt: false, retry: false, chat: true });
  assert.deepEqual(teamDeskAllowedActions("OWNER", "SETUP_REQUIRED", 1), { add: false, adopt: false, retry: false, chat: true });
  assert.deepEqual(teamDeskAllowedActions("ADMIN", "ADAPTER_UNAVAILABLE", 1), { add: false, adopt: false, retry: true, chat: true });
});
