"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { BriefcaseBusiness, Building2, Check, CircleCheck, Heart, Leaf, LoaderCircle, LockKeyhole, LogOut, PiggyBank, ScanLine, ShieldCheck, Sparkles, Store, TrendingUp, Wallet } from "lucide-react";
import { Logo } from "./auth-screen";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import ReferralSelect from "./referral-select";
import { goals, purposes, saveProfile, type Profile } from "@/lib/profile";
import "@/app/onboarding.css";

const purposeIcons = [Heart, BriefcaseBusiness, Store, TrendingUp, Building2];
const goalIcons = [PiggyBank, ScanLine, TrendingUp, Wallet];
const steps = ["Your space", "Your goals", "Your details"];

export default function Onboarding({ userId, initialProfile, suggestedName, onComplete, onExit }: { userId: string; initialProfile?: Profile | null; suggestedName: string; onComplete: (p: Profile) => void; onExit: () => void }) {
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [purpose, setPurpose] = useState<Profile["purpose"] | "">(initialProfile?.purpose || "");
  const [selectedGoals, setSelectedGoals] = useState<string[]>(initialProfile?.goals || []);
  const [name, setName] = useState(initialProfile?.display_name || (typeof suggestedName === "string" ? suggestedName.slice(0, 80) : ""));
  const [businessName, setBusinessName] = useState(initialProfile?.business_name || "");
  const [source, setSource] = useState<Profile["referral_source"] | "">(initialProfile?.referral_source || "");
  const [details, setDetails] = useState(initialProfile?.referral_details || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sourceInvalid, setSourceInvalid] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const selectedPurpose = purposes.find(p => p.id === purpose);
  const initials = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("").toUpperCase();

  useEffect(() => { headingRef.current?.focus({ preventScroll: true }); }, [step]);
  function goToStep(next: number) { setError(""); setStep(next); }
  async function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    if (step === 0) {
      if (!purpose) { setError("Choose how you’ll use Hisabivo."); return; }
      setFurthestStep(s => Math.max(s, 1)); goToStep(1); return;
    }
    if (step === 1) {
      if (!selectedGoals.length) { setError("Choose at least one goal."); return; }
      setFurthestStep(2); goToStep(2); return;
    }
    if (!source) { setSourceInvalid(true); setError("Choose where you heard about Hisabivo."); return; }
    if (!purpose || !name.trim() || !selectedGoals.length) { setError("Please complete your name, purpose, and goals."); return; }
    setBusy(true);
    try {
      const profile = await saveProfile({ user_id: userId, display_name: name.trim(), purpose, business_name: businessName.trim(), referral_source: source, referral_details: source === "other" ? details.trim() : "", goals: selectedGoals, currency: "PKR" });
      onComplete(profile);
    } catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Could not save your preferences. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="ob-page">
    <header className="ob-header"><Link href="/" aria-label="Hisabivo home"><Logo /></Link><div><span className="ob-header-note"><LockKeyhole size={14} /> Your own private space</span><Button variant="ghost" onClick={onExit} disabled={busy}><LogOut /> Sign out</Button></div></header>
    <div className="ob-shell">
      <aside className="ob-story"><div className="ob-story-top"><span className="ob-story-badge"><Sparkles size={15} /> A FRESH START</span><h1>A little setup.<br />A lot more <em>clarity.</em></h1><p>A space for the money you earn, the life you live, and the things you’re working toward.</p></div>
        <div className="ob-preview"><div className="ob-preview-head"><span className="ob-preview-icon"><Wallet size={20} /></span><div><span>YOUR WORKSPACE</span><strong>{selectedPurpose?.name || "A place for your everyday"}</strong></div><span className="ob-preview-check"><Check size={14} /></span></div><div className="ob-preview-grid"><div><span>Money in</span><strong>All your sources</strong><span className="ob-preview-line" /></div><div><span>Money out</span><strong>Everyday details</strong><span className="ob-preview-line ob-preview-line-light" /></div></div><div className="ob-preview-goals">{selectedGoals.length ? selectedGoals.map(g => <span key={g}><Check size={12} />{goals.find(item => item.id === g)?.name}</span>) : <span><Leaf size={13} /> Small habits. A bigger picture.</span>}</div></div>
        <div className="ob-story-bottom"><ShieldCheck size={20} /><div><strong>Built around you.</strong><span>Your preferences stay with your account.<br />Change them whenever life changes.</span></div></div><span className="ob-story-orbit" aria-hidden="true" />
      </aside>
      <section className="ob-setup" aria-label="Set up your Hisabivo workspace">
        <nav aria-label="Onboarding progress" className="ob-progress"><ol>{steps.map((label, i) => <li key={label} className={step === i ? "is-current" : step > i ? "is-complete" : ""}><button type="button" onClick={() => goToStep(i)} disabled={i > furthestStep || busy} aria-current={step === i ? "step" : undefined}><span>{step > i ? <Check size={14} /> : i + 1}</span><strong>{label}</strong></button></li>)}</ol></nav>
        <div className="ob-card"><div className="ob-card-meta"><span>{initialProfile ? "MAKE IT YOURS" : "WELCOME TO HISABIVO"}</span><span>Step {step + 1} of 3</span></div><div className="ob-step-content" key={step}>
          <div className="ob-step-heading"><h2 ref={headingRef} tabIndex={-1}>{["What brings you to Hisabivo?", "What would you like to work on?", "Let’s make it feel like yours."][step]}</h2><p>{["From everyday life to your next big idea. Choose the space that fits you best.", "Pick what matters to you. We’ll keep your goals in view as you go.", "A few final details, and your money space is ready to go."][step]}</p></div>
          <form onSubmit={submit} noValidate={step < 2}><fieldset disabled={busy} className="ob-fields">
            {step === 0 && <div className="ob-purpose-grid" role="radiogroup" aria-label="How will you use Hisabivo?">{purposes.map((p, i) => { const Icon = purposeIcons[i]; return <label key={p.id} className={`ob-choice ob-purpose ${purpose === p.id ? "is-selected" : ""}`}><input type="radio" name="purpose" value={p.id} checked={purpose === p.id} onChange={() => setPurpose(p.id)} /><span className="ob-choice-icon"><Icon size={22} strokeWidth={1.6} /></span><span className="ob-choice-copy"><strong>{p.name}</strong><span>{p.description}</span></span><span className="ob-choice-check">{purpose === p.id && <Check size={12} />}</span></label>; })}</div>}
            {step === 1 && <><div className="ob-goal-caption"><span>CHOOSE ONE OR MORE</span><span>{selectedGoals.length} selected</span></div><div className="ob-goal-grid">{goals.map((g, i) => { const Icon = goalIcons[i]; const checked = selectedGoals.includes(g.id); return <label key={g.id} className={`ob-choice ob-goal ${checked ? "is-selected" : ""}`}><input type="checkbox" name="goals" value={g.id} checked={checked} onChange={() => setSelectedGoals(prev => prev.includes(g.id) ? prev.filter(v => v !== g.id) : [...prev, g.id])} /><span className="ob-choice-icon"><Icon size={23} strokeWidth={1.6} /></span><span className="ob-choice-copy"><strong>{g.name}</strong><span>{g.description}</span></span><span className="ob-choice-check ob-square">{checked && <Check size={12} />}</span></label>; })}</div><p className="ob-field-note"><Sparkles size={15} /> A little direction makes the bigger picture more useful.</p></>}
            {step === 2 && <><div className="ob-profile-intro"><span className="ob-avatar">{initials || <Heart size={23} strokeWidth={1.5} />}</span><div><strong>{name.trim() ? `Your space, ${name.trim().split(" ")[0]}.` : "Your space starts here."}</strong><span>{selectedPurpose?.name}{businessName && purpose !== "personal" ? ` · ${businessName}` : ""}</span></div></div><div className="ob-profile-fields"><label>What should we call you?<Input value={name} onChange={e => setName(e.target.value)} name="name" required maxLength={80} autoComplete="given-name" placeholder="Your name" /></label>{purpose !== "personal" && <label>Business name <span className="ob-optional">optional</span><Input value={businessName} onChange={e => setBusinessName(e.target.value)} maxLength={100} autoComplete="organization" placeholder="Your business or brand" /></label>}<div className="ob-referral-field"><span id="referral-label">Where did you hear about us?</span><ReferralSelect value={source} onChange={v => { setSource(v); setSourceInvalid(false); setError(""); }} disabled={busy} invalid={sourceInvalid} /><span className="ob-field-hint">We’d love to know what brought you here.</span></div>{source === "other" && <label>Tell us a little more <span className="ob-optional">optional</span><Input value={details} onChange={e => setDetails(e.target.value)} maxLength={200} placeholder="Where did you find Hisabivo?" /></label>}</div><div className="ob-currency-note"><span className="ob-pk">PK</span><span><strong>Pakistani rupee</strong><small>Your entries and reports will use PKR.</small></span><span className="ob-currency-badge">PKR</span></div></>}
          </fieldset>{error && <p role="alert" id="onboarding-error" className="error-message ob-error">{error}</p>}<div className="ob-actions">{step > 0 ? <Button variant="ghost" onClick={() => goToStep(step - 1)} disabled={busy}>Back</Button> : <span className="ob-action-note">About a minute to make it yours</span>}<Button type="submit" size="lg" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{step === 2 ? initialProfile ? "Save preferences" : "Open my ledger" : "Continue"}</Button></div></form>
        </div></div><div className="ob-footer"><CircleCheck size={14} /> No perfect answers needed. You can update these later.</div>
      </section>
    </div>
  </main>;
}
