"use client";
import { useEffect, useState, type FormEvent } from "react";
import { Building2, Check, Copy, FileCheck2, FolderPlus, LoaderCircle, Plus, ShieldCheck, Users, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./entry-dialog";
import { defaultCategories, dateLabel, money, parseAmount, paymentMethods, today, type EntryType } from "@/lib/ledger";
import { decideTeamProposal, fetchTeam, inviteToWorkspace, removeTeamMember, revokeWorkspaceInvite, submitTeamProposal, updateTeamMember } from "@/lib/team-store";
import type { EntryProposal, TeamMember, WorkspaceInvite, WorkspaceKind } from "@/lib/team";
import type { TeamController } from "./use-team";
import "@/app/team-workspace.css";

export default function TeamWorkspace({ team, actorId, demo = false, onDataChange }: { team: TeamController; actorId: string; demo?: boolean; onDataChange?: () => void }) {
  const workspace = team.selected;
  const [data, setData] = useState<{ members: TeamMember[]; invites: WorkspaceInvite[]; proposals: EntryProposal[] }>({ members: [], invites: [], proposals: [] });
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [inviteRole, setInviteRole] = useState<"accountant" | "staff">("accountant");
  const [kind, setKind] = useState<WorkspaceKind>("business");
  const [proposalType, setProposalType] = useState<EntryType>("expense");
  useEffect(() => {
    let active = true; setData({ members: [], invites: [], proposals: [] }); setError(""); setNotice("");
    if (!workspace || demo) return;
    setLoading(true);
    fetchTeam(workspace.id).then(result => { if (active) setData(result); }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Team details could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace?.id, workspace?.role, demo, revision]);
  async function action(work: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setNotice("");
    try { await work(); setNotice(success); setRevision(v => v + 1); onDataChange?.(); }
    catch (err) { setError(err instanceof Error ? err.message : "This change could not be completed."); }
    finally { setBusy(false); }
  }
  async function createWorkspace(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); const name = String(new FormData(e.currentTarget).get("workspace_name") || "");
    await action(() => team.createWorkspace(name, kind), "Your separate workspace is ready.");
  }
  async function invite(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!workspace) return;
    const email = String(new FormData(e.currentTarget).get("email") || "");
    await action(() => inviteToWorkspace(workspace.id, email, inviteRole), "Invitation is ready. Share its link with the invited person.");
  }
  async function proposal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); if (!workspace) return; const f = new FormData(e.currentTarget);
    await action(async () => submitTeamProposal(workspace.id, { type: proposalType, amount_paisa: parseAmount(String(f.get("amount"))), description: String(f.get("description") || "").trim(), category: String(f.get("category")), date: String(f.get("date")), payment_method: String(f.get("payment_method")) as typeof paymentMethods[number], notes: String(f.get("notes") || ""), expense_status: "paid", paid_date: proposalType === "expense" ? String(f.get("date")) : null }), "Your entry is waiting for the workspace owner’s review.");
  }
  async function copyInvite(token: string) {
    const url = `${window.location.origin}/dashboard/?view=team&invite=${encodeURIComponent(token)}`;
    try { await navigator.clipboard.writeText(url); setNotice("Invitation link copied."); }
    catch { setNotice(`Share this invitation link: ${url}`); }
  }
  if (!workspace) return <section className="tw-card"><h2>Your workspaces</h2><p>{team.loading ? "Loading your workspaces…" : team.error || "Your workspace is not available yet."}</p><Button onClick={team.reload}>Try again</Button></section>;
  const owner = workspace.role === "owner";
  const activeInvites = data.invites.filter(i => !i.accepted_by && !i.cancelled_at && Date.parse(i.expires_at) > Date.now());
  return <div className="team-workspace">
    <section className="tw-context"><span className="tw-icon"><Building2 /></span><div><span className="tw-eyebrow">{workspace.kind === "business" ? "BUSINESS WORKSPACE" : "PERSONAL WORKSPACE"}</span><h2>{workspace.name}</h2><p>{owner ? "You own this workspace. Its records are separate from your other ledgers." : workspace.role === "accountant" ? "You can review this workspace’s records. Financial changes are reserved for its owner." : "Submit income and paid expenses for review. Only the owner can add them to the ledger."}</p></div><span className="tw-role"><ShieldCheck size={15} />{workspace.role}</span></section>
    {(error || team.error) && <p className="error-message" role="alert">{error || team.error}</p>}{notice && <p className="success-message tw-notice" role="status">{notice}</p>}{demo && <p className="tw-demo">Sign in to create separate personal and business ledgers or invite your team. Sharing is disabled in the demo.</p>}
    {team.incomingInvites.length > 0 && <section className="tw-card"><h2>Invitations for your email</h2><p>Accept only workspaces you recognise. Each workspace has its own records and access.</p><div className="tw-list">{team.incomingInvites.map(i => <div className="tw-list-row" key={i.id}><div><strong>{i.workspace_name || "Workspace invitation"}</strong><span>{i.role} access · expires {dateLabel(i.expires_at.slice(0, 10))}</span></div><Button disabled={busy || demo} onClick={() => action(() => team.acceptInvite(i.token), "You joined the workspace.")}>Accept invitation</Button></div>)}</div></section>}
    {workspace.role === "staff" && <section className="tw-card"><div className="tw-section-heading"><span className="tw-icon"><Plus /></span><div><h2>Submit an entry</h2><p>Received income or an expense you have already paid. Expected bills, installments and transfers stay with the owner.</p></div></div><form onSubmit={proposal} className="tw-form"><fieldset disabled={busy || demo}><div className="tw-form-row"><label>Entry type<Select value={proposalType} onChange={e => setProposalType(e.target.value as EntryType)}><option value="expense">Paid expense</option><option value="income">Income received</option></Select></label><label>Amount (PKR)<Input name="amount" inputMode="decimal" required placeholder="0.00" /></label></div><label>Description<Input name="description" maxLength={100} required placeholder="What was this entry for?" /></label><div className="tw-form-row"><label>{proposalType === "income" ? "Income source" : "Category"}<Select key={proposalType} name="category">{defaultCategories.filter(c => c.type === proposalType).map(c => <option key={c.id}>{c.name}</option>)}</Select></label><label>Date<Input name="date" type="date" defaultValue={today()} min="1900-01-01" max="9999-12-31" required /></label></div><label>Payment method<Select name="payment_method">{paymentMethods.map(p => <option key={p}>{p}</option>)}</Select></label><label>Notes <span>optional</span><Input name="notes" maxLength={500} /></label><Button type="submit" disabled={busy || demo}>{busy && <LoaderCircle className="animate-spin" />}Submit for review</Button></fieldset></form></section>}
    {owner && <div className="tw-grid"><section className="tw-card"><div className="tw-section-heading"><span className="tw-icon"><Users /></span><div><h2>Invite your team</h2><p>Use each person’s own account. No passwords are shared.</p></div></div><form onSubmit={invite} className="tw-form"><fieldset disabled={busy || demo}><label>Email address<Input type="email" name="email" maxLength={254} required placeholder="teammate@example.com" /></label><label>Access<Select value={inviteRole} onChange={e => setInviteRole(e.target.value as "accountant" | "staff")}><option value="accountant">Accountant · read-only financial records</option><option value="staff">Staff · submit entries for approval</option></Select></label><p className="tw-helper">A link is created for this email address. Share it yourself; Hisabivo does not send an invitation email.</p><Button type="submit" disabled={busy || demo}><Plus />Create invitation</Button></fieldset></form></section><section className="tw-card"><h2>Access in plain language</h2><ul className="tw-access"><li><strong>Owner</strong><span>Manage this ledger, its team, and submitted entries.</span></li><li><strong>Accountant</strong><span>Read financial records in this workspace. No changes or approvals.</span></li><li><strong>Staff</strong><span>Submit and view their own proposals. No access to financial records or another person’s proposals.</span></li></ul></section></div>}
    {owner && <section className="tw-card"><h2>Members</h2>{loading ? <p>Loading team access…</p> : !data.members.length ? <p>No members yet. Invite an accountant or staff member when you’re ready.</p> : <div className="tw-list">{data.members.map(m => <div className="tw-list-row" key={m.id}><div><strong>{m.email}</strong><span>Joined {dateLabel(m.created_at.slice(0, 10))}</span></div><div className="tw-member-actions"><Select aria-label={`Access for ${m.email}`} value={m.role} disabled={busy || demo} onChange={e => action(() => updateTeamMember(workspace.id, m.user_id, e.target.value as "accountant" | "staff"), "Member access updated.")}><option value="accountant">Accountant</option><option value="staff">Staff</option></Select><Button variant="outline" disabled={busy || demo} onClick={() => action(() => removeTeamMember(workspace.id, m.user_id), "Workspace access removed.")}><X />Remove</Button></div></div>)}</div>}{activeInvites.length > 0 && <><h3>Pending invitations</h3><div className="tw-list">{activeInvites.map(i => <div className="tw-list-row" key={i.id}><div><strong>{i.email}</strong><span>{i.role} · expires {dateLabel(i.expires_at.slice(0, 10))}</span></div><div className="tw-member-actions"><Button variant="outline" onClick={() => copyInvite(i.token)}><Copy />Copy link</Button><Button variant="ghost" disabled={busy} onClick={() => action(() => revokeWorkspaceInvite(i.id), "Invitation cancelled.")}>Cancel</Button></div></div>)}</div></>}</section>}
    {(owner || workspace.role === "staff") && <section className="tw-card"><div className="tw-section-heading"><span className="tw-icon"><FileCheck2 /></span><div><h2>{owner ? "Entries for review" : "Your submitted entries"}</h2><p>{owner ? "Approval records an entry once in this workspace’s ledger." : "Only your submissions are visible here."}</p></div></div>{!data.proposals.length ? <p>No entries have been submitted yet.</p> : <div className="tw-proposals">{data.proposals.map(p => <article className="tw-proposal" key={p.id}><div><span className={`tw-status ${p.status}`}>{p.status}</span><strong>{p.description}</strong><span>{p.type === "income" ? "Income" : "Paid expense"} · {p.category} · {dateLabel(p.date)}</span><span>{p.payment_method}{p.notes ? ` · ${p.notes}` : ""}</span></div><div><strong>{money(p.amount_paisa)}</strong>{owner && p.status === "pending" && <div className="tw-member-actions"><Button disabled={busy || demo} onClick={() => action(() => decideTeamProposal(p.id, true), "Entry approved and recorded once.")}><Check />Approve</Button><Button variant="outline" disabled={busy || demo} onClick={() => action(() => decideTeamProposal(p.id, false), "Entry rejected.")}>Reject</Button></div>}</div></article>)}</div>}</section>}
    <section className="tw-card"><div className="tw-section-heading"><span className="tw-icon"><FolderPlus /></span><div><h2>A separate workspace</h2><p>Keep personal spending and each business in independent ledgers. New workspaces start empty and private.</p></div></div><form onSubmit={createWorkspace} className="tw-create"><label>Workspace name<Input name="workspace_name" maxLength={100} required placeholder="e.g. Home or Acme Studio" disabled={busy || demo} /></label><label>Type<Select value={kind} onChange={e => setKind(e.target.value as WorkspaceKind)} disabled={busy || demo}><option value="business">Business</option><option value="personal">Personal</option></Select></label><Button type="submit" disabled={busy || demo}><Plus />Create workspace</Button></form><p className="tw-helper">Your signed-in account: {actorId === workspace.owner_id ? "workspace owner" : "team member"}. Changing workspaces changes the records you see; your account profile stays private.</p></section>
  </div>;
}
