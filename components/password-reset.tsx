"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { isConnected, supabase } from "@/lib/supabase";
import { Logo } from "./auth-screen";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
export default function PasswordReset() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  useEffect(() => {
    if (!isConnected) return;
    let active = true;
    let authEventReceived = false;
    const { data: { subscription } } = supabase().auth.onAuthStateChange((_event, session) => { authEventReceived = true; if (active) setReady(Boolean(session)); });
    supabase().auth.getSession().then(({ data, error }) => { if (active && !authEventReceived) { setReady(Boolean(data.session)); if (error) setError(error.message); } }).catch(err => { if (active && !authEventReceived) setError(err instanceof Error ? err.message : "Your recovery session could not be opened."); });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError("");
    const f = new FormData(e.currentTarget);
    if (f.get("password") !== f.get("confirm")) { setError("The two passwords don’t match."); return; }
    setBusy(true);
    try { const { error } = await supabase().auth.updateUser({ password: String(f.get("password")) }); if (error) throw error; setSuccess(true); }
    catch(err) { setError(err instanceof Error ? err.message : "Unable to update your password."); }
    finally { setBusy(false); }
  }
  return <main className="reset-page"><Logo /><section className="reset-card"><h1>{success ? "Your password is updated." : "A fresh password."}</h1><p className="muted">{success ? "You’re ready to return to your ledger." : "Open this page from your password reset email to choose a new password."}</p>{success ? <Button onClick={() => router.replace("/dashboard/")}>Open my ledger</Button> : <form className="auth-form" onSubmit={submit}><label>New password<Input type="password" name="password" minLength={8} maxLength={128} autoComplete="new-password" required disabled={!ready || busy} /></label><label>Confirm password<Input type="password" name="confirm" minLength={8} maxLength={128} autoComplete="new-password" required disabled={!ready || busy} /></label>{error && <p className="error-message" role="alert">{error}</p>}<Button type="submit" disabled={!ready || busy}>{busy && <LoaderCircle className="animate-spin" />}Update password</Button></form>}<Button variant="ghost" onClick={() => router.push("/login/")}>Back to sign in</Button></section></main>;
}
