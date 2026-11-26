"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Check, Download, FileDown, FileText, HandCoins, LoaderCircle, Plus, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Select } from "./entry-dialog";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { dateLabel, expenseRemaining, money, monthLabel, parseAmount, paymentMethods, today, validDate, type Transaction } from "@/lib/ledger";
import { advanceUnused, downloadSalaryStatement, validateSalaryAdvance, type AdvanceInput, type SalaryAdvance } from "@/lib/salary-extras";
import type { Account } from "@/lib/accounts";
import type { Employee } from "@/lib/salaries";
import { clientRequestId } from "@/lib/client-request-id";
import type { SalaryBill, useSalaryExtras } from "./use-salary-extras";
import { useLocale } from "./locale-provider";
import "@/app/salary-advances.css";

type Extras = ReturnType<typeof useSalaryExtras>;
type Props = { extras: Extras; employees: Employee[]; entries: Transaction[]; accounts: Account[]; month: string; canWrite: boolean; salaryBills: SalaryBill[] };
const errorText = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "This salary change could not be completed. Please try again.";

export default function SalaryAdvances({ extras, employees, entries, accounts, month, canWrite, salaryBills }: Props) {
  const { t } = useLocale();
  const [granting, setGranting] = useState(false);
  const [applying, setApplying] = useState<SalaryAdvance | null>(null);
  const [downloading, setDownloading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { extras.captureStatements(salaryBills); }, [extras.captureStatements, salaryBills]);
  const active = employees.filter(employee => !employee.archived_at);
  const unused = extras.advances.reduce((sum, advance) => sum + advanceUnused(advance, entries), 0);
  const statements = extras.statements.filter(statement => statement.period.slice(0, 7) === month).sort((a, b) => a.name_snapshot.localeCompare(b.name_snapshot));
  async function download(id: string) {
    if (downloading) return;
    const statement = statements.find(row => row.id === id);
    const entry = entries.find(row => row.id === statement?.expense_id && !row.deleted_at);
    if (!statement || !entry) { setError("Restore the original salary bill before downloading its statement."); return; }
    setDownloading(id); setError("");
    try { await downloadSalaryStatement(statement, entry); }
    catch (err) { setError(errorText(err)); }
    finally { setDownloading(""); }
  }
  const writable = canWrite && extras.ready && !extras.busy;
  return <div className="sax-workspace"><section className="sax-advances"><div className="sax-heading"><div><span className="sax-kicker">SALARY ADVANCES</span><h2>{t("Pay an advance. Keep the balance clear.", "ایڈوانس دیں اور حساب واضح رکھیں۔")}</h2><p>{t("An advance records cash paid now. Apply it to the same employee’s salary later without paying that amount twice.", "ایڈوانس میں ابھی دی گئی رقم درج ہوتی ہے۔ بعد میں اسی ملازم کی تنخواہ میں شامل کریں، دوبارہ ادائیگی کے بغیر۔")}</p></div><Button onClick={() => { setGranting(true); setError(""); }} disabled={!writable || !active.length}><Plus />{t("Grant salary advance", "تنخواہ کا ایڈوانس دیں")}</Button></div>
      <div className="sax-balance"><span><HandCoins size={22} /><span>{t("Unused advances", "غیر استعمال شدہ ایڈوانس")}<small>{t("Across all periods", "تمام ادوار")}</small></span></span><strong>{extras.ready ? money(unused, true) : "—"}</strong></div>
      {extras.error && <div className="error-message" role="alert"><p>{extras.error}</p><a href="/setup-suite.sql" download><FileDown size={15} />Download salary setup</a><Button variant="outline" size="sm" disabled={extras.busy} onClick={extras.retry}>Retry</Button></div>}
      {!extras.ready && !extras.error ? <p className="sax-empty" role="status">Loading salary advances…</p> : extras.advances.length ? <ul className="sax-list">{[...extras.advances].sort((a, b) => b.date.localeCompare(a.date) || b.created_at.localeCompare(a.created_at)).map(advance => { const remaining = advanceUnused(advance, entries); const employee = employees.find(row => row.id === advance.employee_id); const transactionAvailable = entries.some(entry => entry.id === advance.transaction_id && !entry.deleted_at); return <li key={advance.id}><div className="sax-advance-top"><span className="sax-avatar">{employee?.name.slice(0, 1).toUpperCase() || "E"}</span><div><strong>{employee?.name || "Former employee"}</strong><span>Given {dateLabel(advance.date)}</span></div><span className={`sax-state ${remaining ? "" : "settled"}`}>{remaining ? "Available credit" : "Fully applied"}</span></div><div className="sax-amounts"><span>Original advance<strong>{money(advance.amount_paisa, true)}</strong></span><span>Still available<strong>{money(remaining, true)}</strong></span></div>{advance.notes && <p className="sax-notes">{advance.notes}</p>}<div className="sax-advance-bottom"><span><Wallet size={15} />{transactionAvailable ? "Cash recorded when granted" : "Original cash record unavailable"}</span>{remaining > 0 && <Button variant="outline" size="sm" onClick={() => { setApplying(advance); setError(""); }} disabled={!writable || !transactionAvailable}>Apply to salary</Button>}</div></li>; })}</ul> : !extras.error && <p className="sax-empty">No salary advances recorded. Grant one only when you actually pay the employee.</p>}
    </section>
    <section className="sax-statements"><div className="sax-heading"><div><span className="sax-kicker">ORIGINAL PERIOD RECORDS</span><h2>{t("Salary statements", "تنخواہ کے گوشوارے")}</h2><p>{monthLabel(month)} · Original salary figures stay fixed when you change an employee’s current pay.</p></div><FileText size={25} /></div>{statements.length ? <ul className="sax-statement-list">{statements.map(statement => { const available = entries.some(entry => entry.id === statement.expense_id && !entry.deleted_at); return <li key={statement.id}><span className="sax-file-icon"><FileText size={22} /></span><div><strong>{statement.name_snapshot}</strong><span>{monthLabel(statement.period.slice(0, 7))} · Original net {money(statement.net_paisa, true)}</span><small>{statement.base_paisa === null ? "Original breakdown unavailable; historical amounts are not guessed." : "Original base, allowances, and manual deductions preserved."}{!available ? " Restore the source bill to download." : ""}</small></div><Button variant="outline" size="sm" disabled={Boolean(downloading) || !available} onClick={() => download(statement.id)}>{downloading === statement.id ? <LoaderCircle className="animate-spin" /> : <Download />}{t("Statement PDF", "PDF گوشوارہ")}</Button></li>; })}</ul> : <p className="sax-empty">No salary bill statements for this month. Prepare the period’s salary bills to create their original records.</p>}<p className="sax-preserved"><ShieldCheck size={15} />Statements use period snapshots, not the employee’s current salary configuration.</p></section>
    {notice && <p className="success-message" role="status">{notice}</p>}{error && <p className="error-message" role="alert">{error}</p>}
    {granting && <GrantAdvance employees={active} accounts={accounts.filter(account => !account.archived)} onClose={() => setGranting(false)} onSave={async (input, requestId) => { await extras.grant(input, requestId); setNotice("Salary advance recorded. This cash outflow will not be counted again when the advance is applied."); }} />}
    {applying && <ApplyAdvance advance={applying} entries={entries} bills={salaryBills.filter(bill => bill.employeeId === applying.employee_id && !bill.entry.deleted_at && expenseRemaining(bill.entry) > 0)} onClose={() => setApplying(null)} onApply={async (billId, amount, date, requestId) => { await extras.apply(applying.id, billId, amount, date, requestId); setNotice("Advance credit applied to the salary bill. No additional cash payment was recorded."); }} />}
  </div>;
}

function GrantAdvance({ employees, accounts, onClose, onSave }: { employees: Employee[]; accounts: Account[]; onClose: () => void; onSave: (input: AdvanceInput, requestId: string) => Promise<void> }) {
  const { locale } = useLocale();
  const [employeeId, setEmployeeId] = useState(employees[0]?.id || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false), intent = useRef<{ body: string; id: string } | null>(null);
  const employee = employees.find(row => row.id === employeeId);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return; setError("");
    const form = new FormData(event.currentTarget);
    try {
      const input: AdvanceInput = { employee_id: employeeId, amount_paisa: parseAmount(String(form.get("amount"))), date: String(form.get("date")), payment_method: String(form.get("payment_method")) as AdvanceInput["payment_method"], account_id: String(form.get("account_id")) || null, notes: String(form.get("notes")).trim() };
      validateSalaryAdvance(input, employee);
      const account = accounts.find(row => row.id === input.account_id);
      if (input.account_id && (!account || input.date < account.opening_date)) throw new Error("Choose an active account and an advance date on or after its starting balance date.");
      const body = JSON.stringify(input); if (intent.current?.body !== body) intent.current = { body, id: clientRequestId() };
      lock.current = true; setBusy(true); await onSave(input, intent.current!.id); onClose();
    } catch (err) { setError(errorText(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !lock.current) onClose(); }}><DialogContent className="sax-dialog" lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onPointerDownOutside={event => { if (lock.current) event.preventDefault(); }}><span className="sax-modal-icon"><HandCoins size={23} /></span><DialogTitle className="dialog-title">Grant a salary advance</DialogTitle><DialogDescription className="dialog-description">Record money actually paid now. This creates one paid Payroll entry and an available credit for this employee.</DialogDescription><form className="sax-form" onSubmit={submit}><fieldset disabled={busy}><label>Employee<Select aria-label="Advance employee" value={employeeId} onChange={event => setEmployeeId(event.target.value)} required>{employees.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></label><label>Advance amount (PKR)<Input name="amount" inputMode="decimal" maxLength={32} required autoFocus /></label><label>Actual date paid<Input name="date" type="date" defaultValue={today()} min={employee?.joining_date || "1900-01-01"} max={today()} required /></label><label>Paid from account<Select name="account_id"><option value="">Unassigned account</option>{accounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></label><label>Payment method<Select name="payment_method">{paymentMethods.map(method => <option key={method}>{method}</option>)}</Select></label><label>Notes <span className="sax-optional">optional</span><textarea name="notes" rows={2} maxLength={300} /></label></fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !employee}>{busy && <LoaderCircle className="animate-spin" />}Record salary advance</Button></div></form></DialogContent></Dialog>;
}

function ApplyAdvance({ advance, entries, bills, onClose, onApply }: { advance: SalaryAdvance; entries: Transaction[]; bills: SalaryBill[]; onClose: () => void; onApply: (billId: string, amount: number, date: string, requestId: string) => Promise<void> }) {
  const { locale } = useLocale();
  const [billId, setBillId] = useState(bills[0]?.entry.id || "");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const bill = bills.find(row => row.entry.id === billId)?.entry;
  const unused = advanceUnused(advance, entries), maximum = bill ? Math.min(unused, expenseRemaining(bill)) : 0;
  const lock = useRef(false), intent = useRef<{ body: string; id: string } | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (lock.current) return; setError(""); const form = new FormData(event.currentTarget);
    try {
      const amount = parseAmount(String(form.get("amount"))), date = String(form.get("date"));
      if (!bill || amount > maximum) throw new Error("Choose a salary bill and an amount that fits its unpaid balance and the unused advance.");
      if (!validDate(date) || date < advance.date || date > today()) throw new Error("Use the actual application date, on or after the advance and no later than today.");
      const body = JSON.stringify({ advance: advance.id, billId, amount, date }); if (intent.current?.body !== body) intent.current = { body, id: clientRequestId() };
      lock.current = true; setBusy(true); await onApply(billId, amount, date, intent.current!.id); onClose();
    } catch (err) { setError(errorText(err)); }
    finally { lock.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !lock.current) onClose(); }}><DialogContent className="sax-dialog" lang={locale} dir={locale === "ur" ? "rtl" : "ltr"} onEscapeKeyDown={event => { if (lock.current) event.preventDefault(); }} onPointerDownOutside={event => { if (lock.current) event.preventDefault(); }}><span className="sax-modal-icon"><Check size={23} /></span><DialogTitle className="dialog-title">Apply an advance to salary</DialogTitle><DialogDescription className="dialog-description">This is a credit against money already paid. It reduces the selected salary bill without a second cash outflow.</DialogDescription><div className="sax-credit-note"><span>Unused advance</span><strong>{money(unused, true)}</strong><span>Originally paid {dateLabel(advance.date)}</span></div>{!bills.length ? <p className="sax-empty">No unpaid salary bills are available for this employee. Prepare a salary period first.</p> : <form className="sax-form" onSubmit={submit}><fieldset disabled={busy}><label>Salary bill<Select aria-label="Salary bill for advance" value={billId} onChange={event => setBillId(event.target.value)} required>{bills.map(row => <option key={row.entry.id} value={row.entry.id}>{monthLabel(row.entry.date.slice(0, 7))} · {money(expenseRemaining(row.entry), true)} remaining</option>)}</Select></label><label>Credit amount (PKR)<Input key={billId} name="amount" inputMode="decimal" defaultValue={(maximum / 100).toFixed(2)} maxLength={32} required /></label><p className="sax-hint">You can apply up to {money(maximum, true)} to this bill.</p><label>Application date<Input name="date" type="date" defaultValue={today()} min={advance.date} max={today()} required /></label></fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" disabled={busy || !bill || maximum <= 0}>{busy && <LoaderCircle className="animate-spin" />}Apply salary credit</Button></div></form>}</DialogContent></Dialog>;
}
