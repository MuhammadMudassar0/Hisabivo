import { normalizeEntry, validateEntry, type EntryInput } from "./ledger";

export type WorkspaceRole = "owner" | "accountant" | "staff";
export type WorkspaceKind = "personal" | "business";
export type WorkspaceContext = { id: string; owner_id: string; name: string; kind: WorkspaceKind; role: WorkspaceRole; is_default: boolean };
export type TeamMember = { id: string; workspace_id: string; user_id: string; email: string; role: "accountant" | "staff"; created_at: string };
export type WorkspaceInvite = { id: string; workspace_id: string; email: string; role: "accountant" | "staff"; token: string; expires_at: string; accepted_by: string | null; cancelled_at: string | null; created_at: string; workspace_name?: string };
export type EntryProposal = { id: string; workspace_id: string; owner_id: string; user_id: string; type: "income" | "expense"; amount_paisa: number; category: string; description: string; date: string; payment_method: EntryInput["payment_method"]; notes: string; status: "pending" | "approved" | "rejected"; transaction_id: string | null; decision_notes: string; decided_at: string | null; created_at: string };
export function validateWorkspace(name: string, kind: WorkspaceKind) {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) throw new Error("Enter a workspace name with 1–100 characters.");
  if (!["personal", "business"].includes(kind)) throw new Error("Choose a personal or business workspace.");
}
export function normalizeInviteEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  if (normalized.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new Error("Enter a valid email address.");
  return normalized;
}
export function validateTeamRole(role: string): asserts role is "accountant" | "staff" {
  if (!["accountant", "staff"].includes(role)) throw new Error("Choose accountant or staff access.");
}
export function proposalEntry(input: EntryInput): EntryInput {
  if (input.expense_status && input.expense_status !== "paid" || input.payment_tracking || input.payments?.length) throw new Error("Proposals support received income and fully paid expenses. The owner handles expected bills and installments.");
  const entry = normalizeEntry({ type: input.type, amount_paisa: input.amount_paisa, category: input.category.trim(), description: input.description.trim(), date: input.date, payment_method: input.payment_method, notes: input.notes.trim(), expense_status: "paid", paid_date: input.type === "expense" ? input.date : null });
  validateEntry(entry);
  return entry;
}
export const workspaceCanEdit = (workspace: WorkspaceContext) => workspace.role === "owner";
export const workspaceCanReadLedger = (workspace: WorkspaceContext) => workspace.role === "owner" || workspace.role === "accountant";
