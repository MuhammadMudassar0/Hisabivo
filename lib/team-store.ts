import { supabase } from "./supabase";
import { normalizeInviteEmail, proposalEntry, validateTeamRole, validateWorkspace, type EntryProposal, type TeamMember, type WorkspaceContext, type WorkspaceInvite, type WorkspaceKind } from "./team";
import type { EntryInput } from "./ledger";

export const workspaceSetupMessage = "Run setup-workspaces.sql in your Supabase SQL Editor to enable separate workspaces and team access.";
function check(error: { code?: string; message: string } | null) {
  if (error) throw new Error(["PGRST202", "PGRST205", "42P01", "42703"].includes(error.code || "") ? workspaceSetupMessage : error.message);
}
export async function fetchTeamWorkspaces(): Promise<WorkspaceContext[]> {
  const { data, error } = await supabase().rpc("ledger_list_workspaces"); check(error); return (data || []) as WorkspaceContext[];
}
export async function createTeamWorkspace(name: string, kind: WorkspaceKind): Promise<WorkspaceContext> {
  validateWorkspace(name, kind); const { data, error } = await supabase().rpc("ledger_create_workspace", { p_name: name.trim(), p_kind: kind }); check(error); return data as WorkspaceContext;
}
export async function renameTeamWorkspace(id: string, name: string, kind: WorkspaceKind): Promise<void> {
  validateWorkspace(name, kind); const { error } = await supabase().rpc("ledger_update_workspace", { p_workspace: id, p_name: name.trim(), p_kind: kind }); check(error);
}
async function rows<T>(table: string, workspaceId: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase().from(table).select("*").eq("workspace_id", workspaceId).order("created_at").order("id").range(offset, offset + 999); check(error);
    result.push(...data as T[]); if (data!.length < 1000) return result;
  }
}
export async function fetchTeam(workspaceId: string) {
  const [members, invites, proposals] = await Promise.all([rows<TeamMember>("ledger_team_members", workspaceId), rows<WorkspaceInvite>("ledger_team_invites", workspaceId), rows<EntryProposal>("ledger_entry_proposals", workspaceId)]);
  return { members, invites, proposals };
}
export async function fetchIncomingInvites(): Promise<WorkspaceInvite[]> {
  const { data, error } = await supabase().rpc("ledger_incoming_team_invites"); check(error); return (data || []) as WorkspaceInvite[];
}
export async function inviteToWorkspace(workspaceId: string, email: string, role: "accountant" | "staff"): Promise<WorkspaceInvite> {
  validateTeamRole(role); const { data, error } = await supabase().rpc("ledger_invite_workspace", { p_workspace: workspaceId, p_email: normalizeInviteEmail(email), p_role: role }); check(error); return data as WorkspaceInvite;
}
export async function acceptWorkspaceInvite(token: string): Promise<string> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) throw new Error("This invitation link is invalid.");
  const { data, error } = await supabase().rpc("ledger_accept_workspace_invite", { p_token: token }); check(error); return String(data);
}
export async function revokeWorkspaceInvite(inviteId: string) { const { error } = await supabase().rpc("ledger_revoke_workspace_invite", { p_invite: inviteId }); check(error); }
export async function updateTeamMember(workspaceId: string, userId: string, role: "accountant" | "staff") {
  validateTeamRole(role); const { error } = await supabase().rpc("ledger_change_workspace_member", { p_workspace: workspaceId, p_user: userId, p_role: role }); check(error);
}
export async function removeTeamMember(workspaceId: string, userId: string) { const { error } = await supabase().rpc("ledger_remove_workspace_member", { p_workspace: workspaceId, p_user: userId }); check(error); }
export async function submitTeamProposal(workspaceId: string, input: EntryInput): Promise<string> {
  const e = proposalEntry(input);
  const { data, error } = await supabase().rpc("ledger_submit_proposal", { p_workspace: workspaceId, p_type: e.type, p_amount: e.amount_paisa, p_category: e.category, p_description: e.description, p_date: e.date, p_method: e.payment_method, p_notes: e.notes }); check(error); return String(data);
}
export async function decideTeamProposal(proposalId: string, approve: boolean, notes = ""): Promise<string | null> {
  if (notes.length > 500) throw new Error("Decision notes must be 500 characters or fewer.");
  const { data, error } = await supabase().rpc("ledger_decide_proposal", { p_proposal: proposalId, p_approve: approve, p_notes: notes.trim() }); check(error); return data ? String(data) : null;
}
