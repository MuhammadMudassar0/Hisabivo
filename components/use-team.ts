"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { acceptWorkspaceInvite, createTeamWorkspace, fetchIncomingInvites, fetchTeamWorkspaces } from "@/lib/team-store";
import type { WorkspaceContext, WorkspaceInvite, WorkspaceKind } from "@/lib/team";

export function useTeam(actorId: string, demo = false) {
  const [workspaces, setWorkspaces] = useState<WorkspaceContext[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [incomingInvites, setIncomingInvites] = useState<WorkspaceInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const reload = useCallback(() => setRevision(v => v + 1), []);
  useEffect(() => {
    let active = true; setLoading(true); setError(""); setWorkspaces([]); setIncomingInvites([]);
    if (!actorId) { setSelectedId(""); setLoading(false); return; }
    if (demo) { setWorkspaces([{ id: "demo-personal", owner_id: actorId, name: "Personal workspace", kind: "personal", role: "owner", is_default: true }]); setSelectedId("demo-personal"); setLoading(false); return; }
    Promise.all([fetchTeamWorkspaces(), fetchIncomingInvites()]).then(([list, invites]) => {
      if (!active) return; setWorkspaces(list); setIncomingInvites(invites);
      let remembered = ""; try { remembered = localStorage.getItem(`hisabivo.workspace.${actorId}`) || ""; } catch { /* Session selection still works without browser storage. */ }
      setSelectedId(current => list.some(w => w.id === current) ? current : list.some(w => w.id === remembered) ? remembered : list.find(w => w.is_default && w.owner_id === actorId)?.id || list[0]?.id || "");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "Your workspaces could not be loaded."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [actorId, demo, revision]);
  const selected = useMemo(() => workspaces.find(w => w.id === selectedId) || null, [workspaces, selectedId]);
  const selectWorkspace = useCallback((id: string) => {
    if (!workspaces.some(w => w.id === id)) throw new Error("Choose an available workspace.");
    setSelectedId(id); try { localStorage.setItem(`hisabivo.workspace.${actorId}`, id); } catch { /* Memory selection is sufficient. */ }
  }, [actorId, workspaces]);
  async function createWorkspace(name: string, kind: WorkspaceKind) {
    if (demo) throw new Error("Sign in to create separate workspaces.");
    const created = await createTeamWorkspace(name, kind); setWorkspaces(list => [...list, created]); setSelectedId(created.id);
    try { localStorage.setItem(`hisabivo.workspace.${actorId}`, created.id); } catch { /* Memory selection is sufficient. */ }
    return created;
  }
  async function acceptInvite(token: string) {
    if (demo) throw new Error("Sign in with the invited email address to join a workspace.");
    const id = await acceptWorkspaceInvite(token); const list = await fetchTeamWorkspaces(); setWorkspaces(list); setSelectedId(id); setIncomingInvites(await fetchIncomingInvites());
    try { localStorage.setItem(`hisabivo.workspace.${actorId}`, id); } catch { /* Memory selection is sufficient. */ }
  }
  return { workspaces, selected, incomingInvites, loading, error, reload, selectWorkspace, createWorkspace, acceptInvite };
}
export type TeamController = ReturnType<typeof useTeam>;
