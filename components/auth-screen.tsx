"use client";
import { useState, type FormEvent } from "react";
import { BookOpen, Check, Eye, EyeOff, Leaf, LoaderCircle, LockKeyhole, Wallet } from "lucide-react";
import { supabase, isConnected } from "@/lib/supabase";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import Link from "next/link";
import { brand } from "@/lib/brand";

export function Logo() {
  return <div className="brand"><span className="brand-mark"><BookOpen size={23} strokeWidth={1.7} /></span><span>{brand.name.toLowerCase()}<span className="brand-period">.</span></span></div>;
}
function GoogleIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-1.99 3.02v2.51h3.22c1.88-1.74 2.99-4.29 2.99-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.22-2.51c-.9.6-2.04.96-3.39.96-2.6 0-4.81-1.76-5.6-4.12H3.08v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.09 12c0-.67.11-1.32.31-1.92V7.49H3.08A10 10 0 0 0 2 12c0 1.61.39 3.14 1.08 4.51l3.32-2.59Z"/><path fill="#EA4335" d="M12 5.96c1.47 0 2.79.51 3.82 1.51l2.86-2.87A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.92 5.49l3.32 2.59C7.19 7.72 9.4 5.96 12 5.96Z"/></svg>;
}
export default function AuthScreen({ onDemo, initialMode = "login" }: { onDemo: () => void; initialMode?: "login" | "signup" }) {
  const [forgot, setForgot] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const signup = initialMode === "signup";
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault(); setError(""); setMessage(""); setBusy(true);
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email")).trim();
    try {
      if (forgot) {
        const { error } = await supabase().auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password/` });
        if (error) throw error;
        setMessage("If there’s an account with this email, you’ll receive a password reset link."); return;
      }
      const credentials = { email, password: String(form.get("password")) };
      const { data, error } = !signup ? await supabase().auth.signInWithPassword(credentials) : await supabase().auth.signUp({ ...credentials, options: { emailRedirectTo: `${window.location.origin}/dashboard/` } });
      if (error) throw error;
      if (signup && !data.session) setMessage("Check your email to confirm your account, then come back to sign in.");
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to connect. Please try again."); }
    finally { setBusy(false); }
  }
  async function googleLogin() {
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" }, signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error("Unable to check Google sign-in. Please try again.");
      const settings = await response.json();
      if (!settings.external?.google) throw new Error("Google sign-in is being set up. You can use email and password for now.");
      const { error } = await supabase().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${window.location.origin}/dashboard/` } });
      if (error) throw error;
    } catch (err) { setError(err instanceof Error ? err.message : "Google sign-in is unavailable. Please use email."); setBusy(false); }
  }
  return <div className="auth-page">
    <section className="auth-story"><Link href="/" aria-label="Hisabivo home"><Logo /></Link><div className="auth-story-content"><div className="eyebrow"><span className="eyebrow-line" />A LITTLE CLARITY, EVERY DAY</div><h1>Your money.<br />A clearer picture.</h1><p>From the morning fuel stop to your monthly salary. Give every rupee a place, and make room for what matters.</p><div className="auth-preview" aria-label="Illustrative sample monthly balance"><div className="auth-preview-label"><Wallet size={18} /> A month, at a glance <span>PKR</span></div><div className="auth-preview-total">Rs 108,600<span>left after expenses · sample data</span></div><div className="auth-preview-bars" aria-hidden="true">{[45, 68, 53, 90, 67, 83, 100, 72, 93, 80, 65, 89].map((v, i) => <i key={i} style={{ height: `${v}%` }} />)}</div><div className="auth-preview-foot"><span>See where it goes</span><span>Make it count</span></div></div><div className="auth-perks"><span><Check size={16} /> Private records</span><span><Check size={16} /> Monthly PDF reports</span></div></div><div className="auth-footer"><Leaf size={17} /> A small daily habit. A better financial picture.</div></section>
    <section className="auth-form-side"><div className="auth-mobile-logo"><Link href="/"><Logo /></Link></div><div className="auth-form-wrap"><span className="section-kicker">YOUR PERSONAL MONEY SPACE</span><h2>{forgot ? "Forgot your password?" : signup ? "Make room for a fresh start." : "Welcome back"}</h2><p className="muted">{forgot ? "We’ll email you a link to set a new password." : signup ? "Start your ledger. Your records stay yours." : "Sign in to pick up where you left off."}</p>
      {!forgot && <><div className="auth-tabs"><Link href="/login/" className={!signup ? "active" : ""}>Sign in</Link><Link href="/signup/" className={signup ? "active" : ""}>Create account</Link></div><Button variant="outline" size="lg" className="w-full google-button" onClick={googleLogin} disabled={busy || !isConnected}><GoogleIcon /> Continue with Google</Button><div className="auth-divider"><span>or continue with email</span></div></>}
      <form onSubmit={submit} className="auth-form"><fieldset disabled={busy} className="form-fieldset"><label>Email address<Input name="email" type="email" placeholder="you@example.com" required autoComplete="email" maxLength={254} /></label>{!forgot && <label><span className="password-label">Password{!signup && <button type="button" onClick={() => { setForgot(true); setError(""); setMessage(""); }}>Forgot password?</button>}</span><div className="password-field"><Input name="password" type={showPassword ? "text" : "password"} placeholder={signup ? "At least 8 characters" : "Enter your password"} required minLength={signup ? 8 : 1} maxLength={128} autoComplete={signup ? "new-password" : "current-password"} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword(!showPassword)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>}</fieldset>
      {error && <p className="error-message" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}
      <Button type="submit" size="lg" className="w-full" disabled={busy || !isConnected}>{busy && <LoaderCircle className="animate-spin" />}{forgot ? "Send reset link" : signup ? "Create your account" : "Sign in to Hisabivo"}</Button>{forgot && <Button variant="ghost" className="w-full" onClick={() => { setForgot(false); setError(""); setMessage(""); }}>Back to sign in</Button>}{!isConnected && <p className="muted">Sign-in isn’t available yet. Explore the demo below.</p>}</form>
      <div className="auth-security"><LockKeyhole size={15} /> Each account has its own private records.</div><Button variant="ghost" className="w-full" onClick={onDemo}>Explore the demo</Button><p className="demo-hint">Sample data. No account needed.</p>
    </div><p className="auth-bottom-note">Made for everyday life. All amounts in Pakistani rupees.</p></section>
  </div>;
}
