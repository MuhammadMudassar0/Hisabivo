"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookMarked, Check, FileDown, LoaderCircle, Plus, Sparkles, Trash2, WandSparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { Select } from "./entry-dialog";
import { money, parseAmount, paymentMethods, today, validDate, type Category, type EntryInput, type EntryType } from "@/lib/ledger";
import { clientRequestId } from "@/lib/client-request-id";
import { deleteQuickTemplate, listQuickTemplates, parseQuickEntry, saveQuickTemplate, starterTemplates, templateDraft, type DraftIntent, type DraftPreview, type QuickTemplate } from "@/lib/quick-entry";
import { useLocale } from "./locale-provider";
import "@/app/productivity.css";

type Props = { ownerId: string; workspaceId?: string; demo: boolean; readOnly?: boolean; categories: Category[]; onClose: () => void; onDraft: (draft: Partial<EntryInput>, intent?: DraftIntent) => void };
const demoKey = "hisabivo.demo.templates.v1";
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "The template could not be saved. Please try again.";

export default function QuickEntryDialog({ ownerId, workspaceId, demo, readOnly = false, categories, onClose, onDraft }: Props) {
  const { t, locale } = useLocale();
  const [tab, setTab] = useState<"quick" | "templates" | "new">("quick");
  const [text, setText] = useState("");
  const [preview, setPreview] = useState<DraftPreview | null>(null);
  const [custom, setCustom] = useState<QuickTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [templateType, setTemplateType] = useState<EntryType>("expense");
  const [deleting, setDeleting] = useState<string | null>(null);
  const lock = useRef(false);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const rows = demo ? JSON.parse(localStorage.getItem(demoKey) || "[]") : workspaceId ? await listQuickTemplates(ownerId, workspaceId) : [];
        if (!Array.isArray(rows)) throw new Error("Saved demo templates could not be opened.");
        if (active) setCustom(rows);
      } catch (err) { if (active) setError(errorText(err)); }
      finally { if (active) setLoading(false); }
    }
    void load(); return () => { active = false; };
  }, [ownerId, workspaceId, demo]);
  function persistDemo(rows: QuickTemplate[]) {
    try { localStorage.setItem(demoKey, JSON.stringify(rows)); }
    catch { setNotice("This browser could not save templates. They remain available for this visit."); }
  }
  function parse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError("");
    try { setPreview(parseQuickEntry(text)); } catch (err) { setError(errorText(err)); }
  }
  async function createTemplate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current || readOnly) return; setError("");
    const form = new FormData(event.currentTarget);
    try {
      const amountText = String(form.get("amount")).trim();
      const input = { name: String(form.get("name")).trim(), type: templateType, amount_paisa: amountText ? parseAmount(amountText) : null, description: String(form.get("description")).trim(), category: String(form.get("category")), payment_method: String(form.get("payment_method")) as QuickTemplate["payment_method"] };
      if (!input.name || !input.description || !input.category) throw new Error("Add a name, description, and category.");
      if (!demo && !workspaceId) throw new Error("Choose a workspace before saving a template.");
      lock.current = true; setBusy(true);
      const saved = demo ? { ...input, id: clientRequestId() } : await saveQuickTemplate(ownerId, workspaceId!, input);
      const next = [...custom, saved]; setCustom(next); if (demo) persistDemo(next);
      setTab("templates"); setNotice(t("Template saved. Applying it will open a review form.", "ٹیمپلیٹ محفوظ ہو گیا۔ استعمال کرنے پر جائزہ فارم کھلے گا۔"));
    } catch (err) { setError(errorText(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function remove(id: string) {
    if (lock.current || readOnly) return; lock.current = true; setBusy(true); setError("");
    try {
      if (!demo) { if (!workspaceId) throw new Error("Choose a workspace first."); await deleteQuickTemplate(ownerId, workspaceId, id); }
      const next = custom.filter(template => template.id !== id); setCustom(next); if (demo) persistDemo(next); setDeleting(null);
    } catch (err) { setError(errorText(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  const missingSetup = /ledger_templates|schema cache|PGRST205|does not exist/.test(error);
  return <Dialog open onOpenChange={open => { if (!open && !lock.current) onClose(); }}><DialogContent className="prod-dialog" lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onPointerDownOutside={event => { if (lock.current) event.preventDefault(); }}>
    <span className="prod-modal-icon"><WandSparkles size={23} /></span><DialogTitle className="dialog-title">{t("A quicker way to record the everyday.", "روزمرہ کے اندراج کا آسان طریقہ۔")}</DialogTitle><DialogDescription className="dialog-description">{t("Prepare a draft, review it, then save. Nothing here records money automatically.", "مسودہ بنائیں، جائزہ لیں، پھر محفوظ کریں۔ یہاں رقم خود بخود درج نہیں ہوتی۔")}</DialogDescription>
    <div className="prod-tabs" role="group" aria-label="Quick entry options"><button type="button" aria-pressed={tab === "quick"} className={tab === "quick" ? "active" : ""} onClick={() => { setTab("quick"); setError(""); }}><Sparkles size={16} />{t("Quick text", "مختصر متن")}</button><button type="button" aria-pressed={tab === "templates"} className={tab === "templates" ? "active" : ""} onClick={() => setTab("templates")}><BookMarked size={16} />{t("Templates", "ٹیمپلیٹس")}</button></div>
    {tab === "quick" && <><form className="prod-form" onSubmit={parse}><label>{t("Write it in your own words", "اپنے الفاظ میں لکھیں")}<textarea value={text} onChange={event => { setText(event.target.value); setPreview(null); }} placeholder="e.g. Petrol 1500 · Salary 50 hazar aayi · Ali ko 5 hazar advance" maxLength={500} rows={3} required /></label><p className="prod-hint">{t("A simple text helper, not AI. Ambiguous advances and loans always need your choice.", "یہ سادہ متن کی سہولت ہے، AI نہیں۔ ایڈوانس یا ادھار کے لیے آپ کا انتخاب ضروری ہے۔")}</p><Button type="submit" variant="outline"><Sparkles />{t("Preview entry", "اندراج کا پیش نظارہ")}</Button></form>{preview && <DraftReview key={JSON.stringify(preview)} preview={preview} disabled={readOnly} onDraft={onDraft} />}</>}
    {tab === "templates" && <div className="prod-template-section"><div className="prod-section-heading"><h3>{t("Ready for your daily routine", "روزمرہ کے لیے تیار")}</h3><Button size="sm" variant="outline" disabled={readOnly || busy} onClick={() => { setTab("new"); setError(""); }}><Plus />{t("New template", "نیا ٹیمپلیٹ")}</Button></div>{loading && <p role="status" className="prod-hint"><LoaderCircle size={16} className="animate-spin" />Loading your templates…</p>}<div className="prod-template-grid">{[...starterTemplates, ...custom].map(template => <article key={template.id}><span className="prod-template-type">{template.type === "income" ? t("Income", "آمدنی") : t("Expense", "خرچ")}</span><h3>{template.name}</h3><p>{template.category} · {template.payment_method}</p><strong>{template.amount_paisa ? money(template.amount_paisa) : t("Add amount when you use it", "استعمال کرتے وقت رقم لکھیں")}</strong><div><Button size="sm" variant="outline" disabled={readOnly || busy} onClick={() => { setPreview(templateDraft(template)); setTab("quick"); }}>{t("Use template", "استعمال کریں")}</Button>{custom.some(row => row.id === template.id) && <Button size="icon" variant="ghost" aria-label={`Delete template ${template.name}`} disabled={readOnly || busy} onClick={() => setDeleting(template.id)}><Trash2 size={16} /></Button>}</div>{deleting === template.id && <div className="prod-inline-confirm"><p>Remove this reusable template? Existing records stay in place.</p><div><Button size="sm" variant="outline" disabled={busy} onClick={() => setDeleting(null)}>Keep</Button><Button size="sm" variant="destructive" disabled={busy} onClick={() => remove(template.id)}>Delete template</Button></div></div>}</article>)}</div></div>}
    {tab === "new" && <form className="prod-form" onSubmit={createTemplate}><h3>{t("Save a reusable template", "بار بار استعمال کا ٹیمپلیٹ")}</h3><fieldset disabled={busy || readOnly} className="prod-fieldset"><label>Name<Input name="name" placeholder="e.g. Monday fuel" maxLength={60} required /></label><label>Used for<Select value={templateType} onChange={event => setTemplateType(event.target.value as EntryType)}><option value="expense">Expense</option><option value="income">Income</option></Select></label><label>Description<Input name="description" maxLength={100} required /></label><label>Amount <span className="prod-optional">optional · PKR</span><Input name="amount" inputMode="decimal" maxLength={32} placeholder="Set it now or when you use it" /></label><label>Category / source<Select key={templateType} name="category">{categories.filter(category => category.type === templateType).map(category => <option key={category.id}>{category.name}</option>)}</Select></label><label>Payment method<Select name="payment_method">{paymentMethods.map(method => <option key={method}>{method}</option>)}</Select></label></fieldset><div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={() => setTab("templates")}>Cancel</Button><Button type="submit" disabled={busy || readOnly}>{busy && <LoaderCircle className="animate-spin" />}Save template</Button></div></form>}
    {notice && <p className="success-message" role="status">{notice}</p>}{error && <div className="error-message" role="alert"><p>{error}</p>{missingSetup && <a href="/setup-productivity.sql" download><FileDown size={15} />Download template setup</a>}</div>}
  </DialogContent></Dialog>;
}

function DraftReview({ preview, disabled, onDraft }: { preview: DraftPreview; disabled: boolean; onDraft: Props["onDraft"] }) {
  const { t } = useLocale();
  const [kind, setKind] = useState<DraftIntent["kind"]>(preview.intent.kind);
  const [person, setPerson] = useState(preview.intent.person || "");
  const [date, setDate] = useState(preview.draft.date || today());
  const [amount, setAmount] = useState(preview.draft.amount_paisa ? (preview.draft.amount_paisa / 100).toFixed(2) : "");
  const [error, setError] = useState("");
  function review(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (disabled) return; setError("");
    try {
      if (kind === "ambiguous") throw new Error("Choose what this entry represents before continuing.");
      if (!validDate(date)) throw new Error("Choose a valid date.");
      if ((kind === "udhar_given" || kind === "udhar_taken") && !person.trim()) throw new Error("Add the person or business for this udhar.");
      const draft = { ...preview.draft, ...(kind === "income" || kind === "expense" ? { type: kind } : { type: undefined }), ...(kind !== preview.intent.kind ? { category: undefined } : {}), ...(amount.trim() ? { amount_paisa: parseAmount(amount) } : { amount_paisa: undefined }), date, notes: person.trim() ? `Person: ${person.trim()}` : preview.draft.notes };
      onDraft(draft, { ...preview.intent, kind, ...(person.trim() ? { person: person.trim() } : {}) });
    } catch (err) { setError(errorText(err)); }
  }
  return <section className="prod-draft-review"><span className="prod-review-kicker"><Check size={15} />{t("DRAFT · REVIEW REQUIRED", "مسودہ · جائزہ ضروری")}</span><h3>{preview.draft.description}</h3><ul>{preview.warnings.map(warning => <li key={warning}>{warning}</li>)}</ul><form className="prod-form" onSubmit={review}><fieldset disabled={disabled} className="prod-fieldset"><label>What does this entry represent?<Select aria-label="Quick entry type" value={kind} onChange={event => setKind(event.target.value as DraftIntent["kind"])}><option value="ambiguous">Choose the type</option><option value="income">Income received</option><option value="expense">Expense</option><option value="udhar_given">Udhar given</option><option value="udhar_taken">Udhar taken</option></Select></label><div className="prod-form-row"><label>Amount (PKR)<Input value={amount} onChange={event => setAmount(event.target.value)} inputMode="decimal" maxLength={32} placeholder="Add in the final review" /></label><label>Date<Input type="date" value={date} onChange={event => setDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label></div><label>Person / business <span className="prod-optional">{kind.startsWith("udhar") ? "required" : "optional"}</span><Input value={person} onChange={event => setPerson(event.target.value)} maxLength={100} /></label></fieldset>{error && <p role="alert" className="error-message">{error}</p>}<Button type="submit" disabled={disabled}>{t("Open review form", "جائزہ فارم کھولیں")}</Button></form></section>;
}
