"use client";

import { useMemo, useRef, useState, type FormEvent } from "react";
import { Banknote, CalendarDays, Check, CheckCheck, CircleHelp, Clock3, FileDown, HandCoins, History, LoaderCircle, Pencil, Plus, RefreshCw, Search, ShieldCheck, Trash2, Users, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Select } from "./entry-dialog";
import { dateLabel, money, parseAmount, paymentMethods, today, type PaymentMethod } from "@/lib/ledger";
import { loanPaid, loanRemaining, loanStatus, udharSummary, validateLoan, validatePayment, type UdharInput, type UdharLoan, type UdharPayment, type UdharPaymentInput } from "@/lib/udhar";
import "@/app/udhar.css";

type Props = {
  initialLoanId?:string|null;
  loans: UdharLoan[];
  payments: UdharPayment[];
  loading: boolean;
  error: string;
  canWrite: boolean;
  onRetry: () => void;
  onSaveLoan: (input: UdharInput, id?: string) => Promise<void>;
  onDeleteLoan: (id: string) => Promise<void>;
  onSavePayment: (input: UdharPaymentInput) => Promise<void>;
  onDeletePayment: (id: string) => Promise<void>;
};
type Direction = UdharLoan["direction"];
const errorText = (err: unknown) => err instanceof Error ? err.message : err && typeof err === "object" && "message" in err ? String(err.message) : "We couldn’t save that change. Please try again.";

function Initials({ name }: { name: string }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map(s => s[0]).join("");
  return <span className="ud-person-avatar" aria-hidden="true">{letters.toUpperCase()}</span>;
}

function StatusBadge({ loan, payments }: { loan: UdharLoan; payments: UdharPayment[] }) {
  const status = loanStatus(loan, payments);
  return <span className={`ud-status ud-status-${status}`}>{status === "settled" ? <CheckCheck size={14} /> : status === "overdue" ? <Clock3 size={14} /> : <span className="ud-status-dot" />}{status === "settled" ? "Settled" : status === "overdue" ? "Overdue" : "Open"}</span>;
}

export default function UdharWorkspace({ initialLoanId, loans, payments, loading, error, canWrite, onRetry, onSaveLoan, onDeleteLoan, onSavePayment, onDeletePayment }: Props) {
  const [query, setQuery] = useState("");
  const [direction, setDirection] = useState("all");
  const [status, setStatus] = useState("all");
  const [editor, setEditor] = useState<{ direction: Direction; loan?: UdharLoan } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialLoanId||null);
  const [notice, setNotice] = useState("");
  const totals = useMemo(() => udharSummary(loans, payments), [loans, payments]);
  const selected = loans.find(loan => loan.id === selectedId);
  const filtered = useMemo(() => loans.filter(loan =>
    (direction === "all" || loan.direction === direction) &&
    (status === "all" || loanStatus(loan, payments) === status) &&
    `${loan.person} ${loan.notes}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  ).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)), [loans, payments, direction, status, query]);
  const missingSchema = /PGRST205|42P01|ledger_loans|ledger_loan_payments|schema cache|does not exist/i.test(error);
  const givenCount = loans.filter(loan => loan.direction === "given" && loanRemaining(loan, payments) > 0).length;
  const takenCount = loans.filter(loan => loan.direction === "taken" && loanRemaining(loan, payments) > 0).length;

  function createLoan(next: Direction) { setNotice(""); setEditor({ direction: next }); }

  return <section className="ud-workspace" aria-label="Udhar given and taken">
    <div className="ud-intro"><div><span className="ud-intro-icon"><HandCoins size={24} strokeWidth={1.6} /></span><div><h2>Keep a clear record of udhar.</h2><p>What you’ve lent. What you’ve borrowed. Every repayment along the way.</p></div></div><div className="ud-intro-actions"><Button variant="outline" disabled={!canWrite} onClick={() => createLoan("taken")}><Wallet />Take udhar</Button><Button disabled={!canWrite} onClick={() => createLoan("given")}><Plus />Give udhar</Button></div></div>
    {notice && <div className="ud-notice" role="status"><Check size={17} /><span>{notice}</span><button type="button" onClick={() => setNotice("")}>Dismiss</button></div>}
    {error && <div className="ud-error" role="alert"><CircleHelp size={22} /><div><h3>{missingSchema ? "A quick setup is needed for udhar." : "We couldn’t load your udhar records."}</h3><p>{missingSchema ? "Run the udhar setup script once in your Supabase SQL Editor, then try again. Your income and expenses stay in place." : "Your existing records haven’t been changed. Check your connection and try again."}</p><div className="ud-error-actions">{missingSchema && <a href="/setup-udhar.sql" download><FileDown size={15} />Download udhar setup</a>}<Button size="sm" variant="outline" onClick={onRetry} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} />Try again</Button></div><details><summary>Connection details</summary><p>{error}</p></details></div></div>}
    <div className="ud-summary-grid" aria-busy={loading}>
      <article className="ud-summary ud-summary-given"><div className="ud-summary-header"><span>Udhar given</span><span className="ud-summary-icon"><HandCoins size={20} /></span></div><p>To receive</p><strong>{loading ? <span className="ud-loading-value" /> : error ? "—" : money(totals.toReceive)}</strong><div className="ud-summary-footer"><span>{loading ? "Loading records…" : error ? "Records unavailable" : `${givenCount} open ${givenCount === 1 ? "record" : "records"}`}</span><span>Money owed to you</span></div></article>
      <article className="ud-summary ud-summary-taken"><div className="ud-summary-header"><span>Udhar taken</span><span className="ud-summary-icon"><Wallet size={20} /></span></div><p>To repay</p><strong>{loading ? <span className="ud-loading-value" /> : error ? "—" : money(totals.toPay)}</strong><div className="ud-summary-footer"><span>{loading ? "Loading records…" : error ? "Records unavailable" : `${takenCount} open ${takenCount === 1 ? "record" : "records"}`}</span><span>Money you need to return</span></div></article>
    </div>
    <div className="ud-principal-note"><ShieldCheck size={17} /><p>Udhar and repayments are tracked separately from income and expenses. These balances show the original amount and repayments only.</p></div>
    <section className="ud-ledger"><div className="ud-ledger-heading"><div><h2>Your udhar records</h2><p>Open a record to add a repayment or see its history.</p></div><span>{loans.length} {loans.length === 1 ? "record" : "records"}</span></div>
      <div className="ud-filters"><div className="ud-search"><Search size={18} /><Input aria-label="Search udhar records" placeholder="Search a person or notes…" value={query} onChange={event => setQuery(event.target.value)} /></div><Select aria-label="Filter udhar direction" value={direction} onChange={event => setDirection(event.target.value)}><option value="all">Given & taken</option><option value="given">Udhar given</option><option value="taken">Udhar taken</option></Select><Select aria-label="Filter udhar status" value={status} onChange={event => setStatus(event.target.value)}><option value="all">All statuses</option><option value="open">Open</option><option value="overdue">Overdue</option><option value="settled">Settled</option></Select></div>
      {loading ? <div className="ud-empty" role="status"><LoaderCircle size={28} className="animate-spin" /><h3>Gathering your udhar records</h3><p>Your balances and repayments will appear here.</p></div> : filtered.length ? <div className="ud-records">{filtered.map(loan => {
        const paid = loanPaid(loan.id, payments);
        const remaining = loanRemaining(loan, payments);
        return <article key={loan.id} className={`ud-record ud-record-${loan.direction}`}><div className="ud-record-top"><div className="ud-record-person"><Initials name={loan.person} /><div><button type="button" className="ud-person-name" onClick={() => setSelectedId(loan.id)}>{loan.person}</button><span>{loan.direction === "given" ? "Given to" : "Borrowed from"} · {dateLabel(loan.date)}</span></div></div><StatusBadge loan={loan} payments={payments} /></div><div className="ud-record-amounts"><div><span>Original amount</span><strong>{money(loan.amount_paisa)}</strong></div><div><span>{loan.direction === "given" ? "Received back" : "Repaid"}</span><strong>{money(paid)}</strong></div><div className="ud-record-outstanding"><span>{loan.direction === "given" ? "Still to receive" : "Still to repay"}</span><strong>{money(remaining)}</strong></div></div><div className="ud-record-bottom"><span className={loanStatus(loan, payments) === "overdue" ? "ud-overdue-date" : ""}><CalendarDays size={15} />{loan.due_date ? `Due ${dateLabel(loan.due_date)}` : "No due date set"}</span><Button variant="ghost" size="sm" onClick={() => setSelectedId(loan.id)}>View details</Button></div></article>;
      })}</div> : <div className="ud-empty"><span className="ud-empty-icon"><Users size={28} strokeWidth={1.5} /></span><h3>{loans.length ? "No matching udhar records" : error ? "Your udhar records will appear here" : "A little clarity between people."}</h3><p>{loans.length ? "Try another name or change your filters." : error ? "Complete the setup or retry the connection to get started." : "Record money you give or take, then keep track as it’s returned."}</p>{loans.length ? <Button variant="outline" onClick={() => { setQuery(""); setDirection("all"); setStatus("all"); }}>Clear filters</Button> : !error && <Button disabled={!canWrite} onClick={() => createLoan("given")}><Plus />Add your first udhar</Button>}</div>}
      {filtered.length > 0 && !loading && <div className="ud-list-footer"><span>Showing {filtered.length} of {loans.length} {loans.length === 1 ? "record" : "records"}</span><span>All amounts in PKR</span></div>}
    </section>
    {editor && <LoanEditor key={editor.loan?.id || editor.direction} loan={editor.loan} initialDirection={editor.direction} payments={payments} canWrite={canWrite} onClose={() => setEditor(null)} onSave={async (input, id) => { await onSaveLoan(input, id); setNotice(id ? "Udhar record updated." : input.direction === "given" ? "Udhar given recorded. You can add repayments as they come in." : "Udhar taken recorded. You can add repayments as you return it."); }} />}
    {selected && !editor && <LoanDetail key={selected.id} loan={selected} payments={payments} canWrite={canWrite} onClose={() => setSelectedId(null)} onEdit={() => setEditor({ direction: selected.direction, loan: selected })} onDelete={async () => { await onDeleteLoan(selected.id); setSelectedId(null); setNotice("Udhar record and its repayment history deleted."); }} onSavePayment={async input => { await onSavePayment(input); setNotice(selected.direction === "given" ? "Money received back recorded." : "Repayment recorded."); }} onDeletePayment={async id => { await onDeletePayment(id); setNotice("Repayment removed. The outstanding balance has been updated."); }} />}
  </section>;
}

function LoanEditor({ loan, initialDirection, payments, canWrite, onClose, onSave }: { loan?: UdharLoan; initialDirection: Direction; payments: UdharPayment[]; canWrite: boolean; onClose: () => void; onSave: (input: UdharInput, id?: string) => Promise<void> }) {
  const [direction, setDirection] = useState<Direction>(loan?.direction || initialDirection);
  const [date, setDate] = useState(loan?.date || today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const paid = loan ? loanPaid(loan.id, payments) : 0;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canWrite) return;
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const input: UdharInput = { direction, person: String(form.get("person")).trim(), amount_paisa: parseAmount(String(form.get("amount"))), date: String(form.get("date")), due_date: String(form.get("due_date")) || null, payment_method: String(form.get("payment_method")) as PaymentMethod, notes: String(form.get("notes")).trim() };
      validateLoan(input);
      if (input.amount_paisa < paid) throw new Error(`The original amount cannot be less than ${money(paid)}, which has already been repaid.`);
      if (loan && payments.some(payment => payment.loan_id === loan.id && payment.date < input.date)) throw new Error("The udhar date must be on or before every recorded repayment.");
      pending.current = true; setBusy(true);
      await onSave(input, loan?.id); onClose();
    } catch (err) { setError(errorText(err)); }
    finally { pending.current = false; setBusy(false); }
  }
  const given = direction === "given";
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent className="ud-dialog" onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}><span className="ud-modal-icon"><HandCoins size={24} /></span><DialogTitle className="ud-dialog-title">{loan ? "Edit udhar record" : given ? "Give udhar. Keep it clear." : "Take udhar. Keep it clear."}</DialogTitle><DialogDescription className="ud-dialog-description">{loan ? "Update the original amount or the details of this record." : given ? "Record money you’ve lent and who will return it." : "Record money you’ve borrowed and who you need to repay."}</DialogDescription><form onSubmit={submit} className="ud-form"><fieldset disabled={busy || !canWrite} className="ud-fieldset">{!loan ? <div className="ud-direction-toggle"><button type="button" aria-pressed={given} className={given ? "active" : ""} onClick={() => setDirection("given")}><HandCoins size={17} />Udhar given</button><button type="button" aria-pressed={!given} className={!given ? "active" : ""} onClick={() => setDirection("taken")}><Wallet size={17} />Udhar taken</button></div> : <div className="ud-edit-direction"><span>{given ? "Udhar given" : "Udhar taken"}</span><span>{given ? "Money you lent" : "Money you borrowed"}</span></div>}<label>{given ? "Given to" : "Borrowed from"}<Input name="person" placeholder="Person or business name" defaultValue={loan?.person} maxLength={100} required autoFocus /></label><label>Original amount <span className="ud-field-note">PKR</span><div className="ud-amount-field"><span>Rs</span><Input name="amount" inputMode="decimal" placeholder="0.00" defaultValue={loan ? (loan.amount_paisa / 100).toFixed(2) : ""} maxLength={32} required /></div></label>{paid > 0 && <p className="ud-form-hint">Already repaid: {money(paid)}. The original amount must cover these repayments.</p>}<div className="ud-form-row"><label>{given ? "Date given" : "Date borrowed"}<Input name="date" type="date" value={date} onChange={event => setDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label><label>Due date <span className="ud-field-note">optional</span><Input name="due_date" type="date" defaultValue={loan?.due_date || ""} min={date || "1900-01-01"} max="9999-12-31" /></label></div><label>Payment method<Select aria-label="Udhar payment method" name="payment_method" defaultValue={loan?.payment_method || "Cash"}>{paymentMethods.map(method => <option key={method}>{method}</option>)}</Select></label><label>Notes <span className="ud-field-note">optional</span><textarea name="notes" placeholder="What would you like to remember?" defaultValue={loan?.notes} maxLength={500} rows={3} /></label></fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="ud-dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy || !canWrite}>{busy && <LoaderCircle className="animate-spin" />}{loan ? "Save changes" : given ? "Save udhar given" : "Save udhar taken"}</Button></div></form></DialogContent></Dialog>;
}

function LoanDetail({ loan, payments, canWrite, onClose, onEdit, onDelete, onSavePayment, onDeletePayment }: { loan: UdharLoan; payments: UdharPayment[]; canWrite: boolean; onClose: () => void; onEdit: () => void; onDelete: () => Promise<void>; onSavePayment: (input: UdharPaymentInput) => Promise<void>; onDeletePayment: (id: string) => Promise<void> }) {
  const [recording, setRecording] = useState(false);
  const [confirmLoanDelete, setConfirmLoanDelete] = useState(false);
  const [deletingPaymentId, setDeletingPaymentId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const history = payments.filter(payment => payment.loan_id === loan.id).sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at));
  const paid = loanPaid(loan.id, payments);
  const remaining = loanRemaining(loan, payments);
  const given = loan.direction === "given";

  async function mutate(action: () => Promise<void>, onSuccess?: () => void) {
    if (pending.current || !canWrite) return;
    pending.current = true; setBusy(true); setError("");
    try { await action(); onSuccess?.(); }
    catch (err) { setError(errorText(err)); }
    finally { pending.current = false; setBusy(false); }
  }
  async function submitRepayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !canWrite) return;
    setError("");
    const form = new FormData(event.currentTarget);
    try {
      const input: UdharPaymentInput = { loan_id: loan.id, amount_paisa: parseAmount(String(form.get("amount"))), date: String(form.get("date")), payment_method: String(form.get("payment_method")) as PaymentMethod, notes: String(form.get("notes")).trim() };
      validatePayment(input, loan, payments);
      await mutate(() => onSavePayment(input), () => setRecording(false));
    } catch (err) { setError(errorText(err)); }
  }

  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent className="ud-dialog ud-detail-dialog" onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}><div className="ud-detail-heading"><Initials name={loan.person} /><div><DialogTitle className="ud-dialog-title">{loan.person}</DialogTitle><DialogDescription className="ud-dialog-description">{given ? "Udhar given" : "Udhar taken"} · {dateLabel(loan.date)}</DialogDescription></div></div><div className="ud-detail-status"><StatusBadge loan={loan} payments={payments} /><span>{loan.payment_method}</span></div><div className="ud-detail-totals"><div><span>Original amount</span><strong>{money(loan.amount_paisa)}</strong></div><div><span>{given ? "Received back" : "Repaid"}</span><strong>{money(paid)}</strong></div><div><span>{given ? "Still to receive" : "Still to repay"}</span><strong>{money(remaining)}</strong></div></div><div className="ud-detail-due"><CalendarDays size={16} /><span>{loan.due_date ? `Due ${dateLabel(loan.due_date)}` : "No due date set"}</span></div>{loan.notes && <div className="ud-detail-note"><strong>Notes</strong><p>{loan.notes}</p></div>}
      {!confirmLoanDelete && <div className="ud-detail-actions">{remaining > 0 && !recording && <Button disabled={busy || !canWrite} onClick={() => { setRecording(true); setDeletingPaymentId(null); setError(""); }}><Plus />{given ? "Record money received" : "Record repayment"}</Button>}<Button variant="outline" disabled={busy || !canWrite} onClick={onEdit}><Pencil />Edit record</Button><Button variant="ghost" className="ud-delete-record" disabled={busy || !canWrite} onClick={() => { setConfirmLoanDelete(true); setRecording(false); setDeletingPaymentId(null); setError(""); }}><Trash2 />Delete</Button></div>}
      {confirmLoanDelete && <div className="ud-delete-confirm"><h3>Delete this udhar record?</h3><p>This removes the {money(loan.amount_paisa)} record for {loan.person}{history.length ? ` and all ${history.length} ${history.length === 1 ? "repayment" : "repayments"}` : ""}. Your balances will update. This cannot be undone.</p><div><Button variant="outline" disabled={busy} onClick={() => { setConfirmLoanDelete(false); setError(""); }}>Keep record</Button><Button variant="destructive" disabled={busy || !canWrite} onClick={() => mutate(onDelete)}>{busy && <LoaderCircle className="animate-spin" />}Delete udhar</Button></div></div>}
      {recording && remaining > 0 && <section className="ud-repayment-section"><div className="ud-repayment-heading"><span><Banknote size={20} /></span><div><h3>{given ? "Money received back" : "Money returned"}</h3><p>{given ? `A repayment from ${loan.person}.` : `A repayment to ${loan.person}.`} Part or all of {money(remaining)}.</p></div></div><form onSubmit={submitRepayment} className="ud-form"><fieldset className="ud-fieldset" disabled={busy || !canWrite}><label>Repayment amount <span className="ud-field-note">PKR</span><div className="ud-amount-field"><span>Rs</span><Input name="amount" inputMode="decimal" defaultValue={(remaining / 100).toFixed(2)} maxLength={32} required autoFocus /></div></label><div className="ud-form-row"><label>Date received / repaid<Input type="date" name="date" defaultValue={today() < loan.date ? loan.date : today()} min={loan.date} max="9999-12-31" required /></label><label>Payment method<Select aria-label="Repayment payment method" name="payment_method" defaultValue="Cash">{paymentMethods.map(method => <option key={method}>{method}</option>)}</Select></label></div><label>Repayment notes <span className="ud-field-note">optional</span><textarea name="notes" placeholder="Any details about this repayment" maxLength={500} rows={2} /></label></fieldset><div className="ud-dialog-actions"><Button variant="outline" disabled={busy} onClick={() => { setRecording(false); setError(""); }}>Cancel repayment</Button><Button type="submit" disabled={busy || !canWrite}>{busy && <LoaderCircle className="animate-spin" />}Save repayment</Button></div></form></section>}
      {error && <p className="error-message" role="alert">{error}</p>}
      <section className="ud-history"><div className="ud-history-heading"><span><History size={19} />Repayment history</span><strong>{history.length}</strong></div>{history.length ? <div className="ud-history-list">{history.map(payment => <article key={payment.id}><div className="ud-history-entry"><span className="ud-history-check"><Check size={16} /></span><div><strong>{money(payment.amount_paisa)}</strong><span>{dateLabel(payment.date)} · {payment.payment_method}</span>{payment.notes && <p>{payment.notes}</p>}</div><Button variant="ghost" size="icon" aria-label={`Delete repayment of ${money(payment.amount_paisa)} on ${dateLabel(payment.date)}`} disabled={busy || !canWrite} onClick={() => { setDeletingPaymentId(payment.id); setConfirmLoanDelete(false); setRecording(false); setError(""); }}><Trash2 size={16} /></Button></div>{deletingPaymentId === payment.id && <div className="ud-payment-confirm"><p>Remove this {money(payment.amount_paisa)} repayment? The amount still {given ? "owed to you" : "to repay"} will increase by the same amount.</p><div><Button variant="outline" size="sm" disabled={busy} onClick={() => { setDeletingPaymentId(null); setError(""); }}>Keep repayment</Button><Button variant="destructive" size="sm" disabled={busy || !canWrite} onClick={() => mutate(() => onDeletePayment(payment.id), () => setDeletingPaymentId(null))}>{busy && <LoaderCircle className="animate-spin" />}Remove repayment</Button></div></div>}</article>)}</div> : <div className="ud-history-empty"><History size={23} /><p>No repayments recorded yet.</p><span>{given ? "Add a repayment when money comes back to you." : "Add a repayment when you return some or all of the amount."}</span></div>}</section>
      {remaining === 0 && <div className="ud-settled-note"><CheckCheck size={19} /><p>All settled. {given ? "The full amount has been received back." : "The full amount has been repaid."}</p></div>}
    </DialogContent></Dialog>;
}
