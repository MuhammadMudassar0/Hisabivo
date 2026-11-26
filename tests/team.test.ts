import test from "node:test";
import assert from "node:assert/strict";
import { normalizeInviteEmail, proposalEntry, validateTeamRole, validateWorkspace, workspaceCanEdit, workspaceCanReadLedger, type WorkspaceContext } from "../lib/team";
const workspace: WorkspaceContext = { id: "ws", owner_id: "owner", name: "Studio", kind: "business", role: "owner", is_default: false };
test("workspace roles distinguish owner writes, accountant reads and staff proposals", () => {
  assert.equal(workspaceCanEdit(workspace), true);
  assert.equal(workspaceCanReadLedger({ ...workspace, role: "accountant" }), true);
  assert.equal(workspaceCanEdit({ ...workspace, role: "accountant" }), false);
  assert.equal(workspaceCanReadLedger({ ...workspace, role: "staff" }), false);
});
test("workspace and invite inputs reject invalid access or identities", () => {
  validateWorkspace("Personal", "personal"); validateTeamRole("staff");
  assert.equal(normalizeInviteEmail(" Person@Example.COM "), "person@example.com");
  assert.throws(() => normalizeInviteEmail("not an email")); assert.throws(() => validateTeamRole("owner"));
  assert.throws(() => validateWorkspace(" ", "business"));
});
test("staff proposals support only received income and fully paid expense entries", () => {
  const input = { type: "expense" as const, amount_paisa: 12345, category: " Fuel ", description: " Petrol ", date: "2026-11-25", payment_method: "Cash" as const, notes: "" };
  const e = proposalEntry(input); assert.equal(e.category, "Fuel"); assert.equal(e.paid_date, input.date);
  assert.throws(() => proposalEntry({ ...input, expense_status: "expected" }));
  assert.throws(() => proposalEntry({ ...input, payment_tracking: true }));
  assert.throws(() => proposalEntry({ ...input, amount_paisa: 0 }));
  assert.equal(proposalEntry({ ...input, type: "income" }).paid_date, null);
});
