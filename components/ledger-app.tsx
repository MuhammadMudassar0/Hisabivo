"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { LoaderCircle, LogOut, RefreshCw } from "lucide-react";
import AuthScreen, { Logo } from "./auth-screen";
import Onboarding from "./onboarding";
import {useTeam} from "./use-team";
import TeamWorkspace from "./team-workspace";
import {LocaleProvider,LanguageSwitcher} from "./locale-provider";
import {setActiveWorkspace} from "@/lib/supabase";
import Workspace, {type WorkspaceView} from "./workspace";
import { Button } from "./ui/button";
import { isConnected, supabase } from "@/lib/supabase";
import { fetchProfile, type Profile } from "@/lib/profile";

const demoProfile: Profile = { user_id: "demo", display_name: "Alex", purpose: "personal", business_name: "", referral_source: "other", referral_details: "", goals: ["understand_spending", "save_more"], currency: "PKR" };
export default function LedgerApp({ mode = "dashboard" }: { mode?: "login" | "signup" | "dashboard" | "onboarding" | "salaries" }) {
  const router = useRouter();
  const [requestedView,setRequestedView]=useState<WorkspaceView>("overview");
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [demo, setDemo] = useState(false);
  const [editingProfile, setEditingProfile] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested=params.get("view");if(requested&&["overview","transactions","recurring","reminders","udhar","categories","reports","insights","tax","settings","accounts","forecast","team","data","salaries"].includes(requested))setRequestedView(requested as WorkspaceView);
    if ((mode === "dashboard" || mode === "salaries") && params.get("demo") === "1") { setDemo(true); setLoading(false); return; }
    setDemo(false);
    setEditingProfile(params.get("edit") === "1");
    if (!isConnected) { setLoading(false); return; }
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((_event, session) => {
      authEventReceived = true;
      if (active) { setUser(session?.user || null); setLoading(false); }
    });
    supabase().auth.getSession().then(({ data, error }) => {
      if (!active || authEventReceived) return;
      if (error) setError(error.message);
      setUser(data.session?.user || null); setLoading(false);
    }).catch(err => { if (active && !authEventReceived) { setError(err instanceof Error ? err.message : "Unable to restore your session."); setLoading(false); } });
    return () => { active = false; subscription.unsubscribe(); };
  }, [mode, retry]);
  useEffect(() => {
    if (!user || demo) { setProfile(null); setLoadedFor(""); return; }
    let active = true; setLoadedFor(""); setProfile(null); setError("");
    fetchProfile(user.id).then(result => { if (active) setProfile(result); }).catch(err => { if (active) setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Unable to load your profile."); }).finally(() => { if (active) setLoadedFor(user.id); });
    return () => { active = false; };
  }, [user?.id, retry, demo]);
  useEffect(() => {
    if (loading || demo || error || (user && loadedFor !== user.id)) return;
    if (!user && (mode === "dashboard" || mode === "onboarding" || mode === "salaries")) router.replace("/login/");
    if (user && profile && mode !== "dashboard" && mode !== "salaries" && !(mode === "onboarding" && editingProfile)) router.replace("/dashboard/");
    if (user && !profile && mode !== "onboarding") router.replace("/onboarding/");
  }, [user, profile, mode, loading, loadedFor, demo, error, editingProfile, router]);
  async function signOut() {
    if (demo) { router.push("/login/"); return; }
    const { error } = await supabase().auth.signOut();
    if (error) throw error;
    setUser(null); setProfile(null); router.replace("/login/");
  }
  const routeView=(next:WorkspaceView)=>{const query=new URLSearchParams();if(demo)query.set("demo","1");if(next!=="salaries")query.set("view",next);router.push(`${next==="salaries"?"/salaries/":"/dashboard/"}${query.size?"?"+query.toString():""}`);};
  function safeSignOut() {
    void signOut().catch(err => setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Unable to sign out. Please try again."));
  }
  if (demo) return <WorkspaceGate initialView={mode==="salaries"?"salaries":requestedView} onRouteNavigate={routeView} key={`demo:${mode}:${requestedView}`} userId="demo" email="demo@hisabivo.local" profile={demoProfile} demo onExit={signOut} onProfileUpdate={setProfile} />;
  if (error) return <main className="app-loading"><Logo /><div className="connection-error"><h1>Let’s reconnect.</h1><p className="error-message" role="alert">{error}</p><p className="muted">If you’re setting up Hisabivo, run the database script in your Supabase SQL Editor first.</p><div className="connection-actions"><Button onClick={() => { setError(""); setRetry(v => v + 1); }}><RefreshCw /> Try again</Button><Button asChild variant="outline"><a href="/setup.sql" download>Database setup script</a></Button>{user && <Button variant="ghost" onClick={safeSignOut}><LogOut /> Sign out</Button>}</div></div></main>;
  if (loading || (user && loadedFor !== user.id)) return <main className="app-loading"><Logo /><LoaderCircle className="animate-spin" size={25} /><p>Opening your money space…</p></main>;
  if (!user) return <AuthScreen key={mode} initialMode={mode === "signup" ? "signup" : "login"} onDemo={() => router.push("/dashboard/?demo=1")} />;
  if (!profile || (mode === "onboarding" && editingProfile)) return <Onboarding key={user.id} userId={user.id} initialProfile={profile} suggestedName={user.user_metadata?.full_name || user.email?.split("@")[0] || ""} onComplete={p => { setProfile(p); setEditingProfile(false); router.replace("/dashboard/"); }} onExit={() => { void signOut().catch(err => setError(err instanceof Error ? err.message : "Unable to sign out. Please try again.")); }} />;
  return <WorkspaceGate initialView={mode==="salaries"?"salaries":requestedView} onRouteNavigate={routeView} key={`${user.id}:${mode}:${requestedView}`} userId={user.id} email={user.email || ""} profile={profile} demo={false} onExit={signOut} onProfileUpdate={setProfile} />;
}

function WorkspaceGate(props:React.ComponentProps<typeof Workspace>){
 const team=useTeam(props.userId,props.demo);const selected=team.selected;
 setActiveWorkspace(props.demo?null:selected?.id||null);
 if(team.loading)return <main className="app-loading"><Logo/><LoaderCircle className="animate-spin"/><p>Opening your workspaces…</p></main>;
 if(team.error||!selected)return <main className="app-loading"><Logo/><div className="connection-error"><h1>Complete workspace setup</h1><p role="alert">{team.error||"No workspace is available."}</p><p>Run the complete update script in Supabase SQL Editor, then try again.</p><div className="connection-actions"><Button onClick={team.reload}>Try again</Button><Button asChild variant="outline"><a href="/setup-suite.sql" download>Download database update</a></Button><Button variant="ghost" onClick={()=>void props.onExit()}>Sign out</Button></div></div></main>;
 if(selected.role==='staff')return <LocaleProvider><main className="ws-main"><div className="workspace-chooser"><Logo/><select aria-label="Choose workspace" value={selected.id} onChange={e=>team.selectWorkspace(e.target.value)}>{team.workspaces.map(w=><option key={w.id} value={w.id}>{w.name} · {w.role}</option>)}</select><LanguageSwitcher/><Button variant="outline" onClick={()=>void props.onExit()}>Sign out</Button></div><TeamWorkspace key={selected.id} team={team} actorId={props.userId} demo={props.demo}/></main></LocaleProvider>;
 return <Workspace {...props} key={selected.id} actorId={props.userId} userId={selected.owner_id} team={team} workspace={selected} readOnly={selected.role!=='owner'}/>;
}
