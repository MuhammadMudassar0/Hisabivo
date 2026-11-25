"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Clock3, LoaderCircle, Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import PakistanTax from "./pakistan-tax";
import { isExpectedExpense, expensePaid, parseAmount, paymentMethods, today, validateEntry, type Category, type EntryInput, type EntryType, type Transaction } from "@/lib/ledger";
import "@/app/expense-status.css";

export function Select({ children, className = "", ...props }: React.ComponentProps<"select">) {
  return <div className={`select-wrap ${className}`}><select {...props}>{children}</select><ChevronDown size={16} /></div>;
}
export default function EntryDialog({ entry, initialType, categories, onClose, onSave, onAddCategory, onExpectedIncome }: { entry?: Transaction; initialType: EntryType; categories: Category[]; onClose: () => void; onSave: (input: EntryInput, id?: string) => Promise<void>; onAddCategory?: (name: string, type: EntryType) => Promise<Category>; onExpectedIncome?: (input:EntryInput)=>Promise<void> }) {
  const [type, setType] = useState<EntryType>(entry?.type || initialType);
  const [incomeExpected,setIncomeExpected]=useState(false);
  const tracked=Boolean(entry?.payment_tracking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entryDate, setEntryDate] = useState(entry?.date || today());
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "expected" | "partial">(entry?.expense_status || "paid");
  const [paidDate, setPaidDate] = useState(entry?.paid_date || (entry && isExpectedExpense(entry) ? today() : entry?.date || today()));
  const hasScheduledDate = Boolean(entry?.type === "expense" && (isExpectedExpense(entry) || (entry.paid_date && entry.paid_date !== entry.date)));
  const pending = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState(entry?.category || categories.find(c => c.type === initialType)?.name || "");
  const [addingSource, setAddingSource] = useState(false);
  const [sourceName, setSourceName] = useState("");
  async function createSource() {
    if (!onAddCategory || pending.current) return;
    pending.current = true; setError(""); setBusy(true);
    try { const saved = await onAddCategory(sourceName, "income"); setSelectedCategory(saved.name); setSourceName(""); setAddingSource(false); }
    catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Could not add this income source."); }
    finally { pending.current = false; setBusy(false); }
  }
  function chooseType(next: EntryType) {
    setType(next); setSelectedCategory(entry?.type === next ? entry.category : categories.find(c => c.type === next)?.name || ""); setAddingSource(false); setSourceName(""); setError("");
  }
  const options = categories.filter(c => c.type === type);
  const existingMissing = entry?.type === type && !options.some(c => c.name === entry.category);
  function changeDate(next: string) { setEntryDate(next); if (!hasScheduledDate) setPaidDate(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return; setError("");
    if (addingSource) { setError("Save your new income source or cancel it before recording the income."); return; }
    const form = new FormData(event.currentTarget);
    try {
      const input: EntryInput = { payment_tracking:entry?.payment_tracking,payments:entry?.payments,type, amount_paisa: parseAmount(String(form.get("amount"))), description: String(form.get("description")).trim(), category: String(form.get("category")), date: String(form.get("date")), payment_method: String(form.get("payment_method")) as EntryInput["payment_method"], notes: String(form.get("notes")).trim(), expense_status: type === "expense" ? expenseStatus : "paid", paid_date: type === "expense" && expenseStatus === "paid" ? (hasScheduledDate ? paidDate : entryDate) : null };
      if(tracked && input.amount_paisa<expensePaid(entry!))throw new Error("The total cannot be less than payments already recorded.");
      validateEntry(input); pending.current = true; setBusy(true); if(type === "income" && incomeExpected && onExpectedIncome)await onExpectedIncome(input);else await onSave(input, entry?.id); onClose();
    } catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Could not save this transaction. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}>
    <div className="modal-icon"><Plus size={22} /></div><DialogTitle className="dialog-title">{entry ? "Edit transaction" : "A little entry. A clearer picture."}</DialogTitle><DialogDescription className="dialog-description">{entry ? "Update the details in your ledger." : "Log your income, a paid expense, or a cost you’re expecting."}</DialogDescription>
    <form onSubmit={submit} className="entry-form"><fieldset disabled={busy} className="form-fieldset">
      <div className="type-toggle"><button type="button" aria-pressed={type === "expense"} className={type === "expense" ? "active expense" : ""} onClick={() => chooseType("expense")}><Minus size={16} /> Expense</button><button type="button" aria-pressed={type === "income"} className={type === "income" ? "active income" : ""} disabled={tracked} onClick={() => chooseType("income")}><Plus size={16} /> Income</button></div>
      {type === "expense" && !tracked && <div className="es-form-status"><span>Payment status</span><div role="group" aria-label="Expense payment status"><button type="button" aria-pressed={expenseStatus === "paid"} className={expenseStatus === "paid" ? "es-selected es-paid-choice" : ""} onClick={() => setExpenseStatus("paid")}><Check size={17} /><span>Paid<small>Already spent</small></span></button><button type="button" aria-pressed={expenseStatus === "expected"} className={expenseStatus === "expected" ? "es-selected es-expected-choice" : ""} onClick={() => setExpenseStatus("expected")}><Clock3 size={17} /><span>Expected<small>Not paid yet</small></span></button></div><p>{expenseStatus === "expected" ? "Keep this planned cost in view, then record full or partial payments. Only money actually paid counts as spending." : "This expense counts as money spent on its paid date."}</p></div>}
      {tracked && <p className="plan-note">Payment history controls this bill’s status. Use Payments to record or undo installments.</p>}
      {type === "income" && !entry && onExpectedIncome && <div className="es-form-status"><span>Income status</span><div role="group" aria-label="Income receipt status"><button type="button" aria-pressed={!incomeExpected} onClick={()=>setIncomeExpected(false)} className={!incomeExpected?"es-selected":""}><Check/><span>Received<small>Money already in</small></span></button><button type="button" aria-pressed={incomeExpected} onClick={()=>setIncomeExpected(true)} className={incomeExpected?"es-selected":""}><Clock3/><span>Expected<small>Receive later</small></span></button></div><p>Expected income stays outside cash and received totals until you confirm receipt.</p></div>}
      <label>Amount <span className="field-optional">PKR</span><div className="amount-input"><span>Rs</span><Input name="amount" type="text" inputMode="decimal" placeholder="0.00" defaultValue={entry ? (entry.amount_paisa / 100).toFixed(2) : ""} required maxLength={32} autoFocus /></div></label>
      <label>Description<Input name="description" placeholder={type === "expense" ? "e.g. Bike fuel on the way to work" : "e.g. Monthly salary"} defaultValue={entry?.description} maxLength={100} required /></label>
      <div className="form-row"><label>{type === "income" ? "Income source" : "Category"}<Select aria-label={type === "income" ? "Income source" : "Category"} name="category" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} required>{existingMissing && <option value={entry!.category}>{entry!.category}</option>}{options.map(category => <option key={category.id} value={category.name}>{category.name}</option>)}</Select></label><label>{type === "income" ? incomeExpected ? "Expected receipt date" : "Date" : tracked ? "Expected date" : expenseStatus === "expected" ? "Expected date" : hasScheduledDate ? "Original expected date" : "Paid on"}<Input name="date" type="date" value={entryDate} onChange={event => changeDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label></div>
      {type === "expense" && expenseStatus === "paid" && hasScheduledDate && !tracked && <label>Paid on<Input name="paid_date" type="date" value={paidDate} onChange={event => setPaidDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label>}
      {type === "income" && <div className="ws-income-source-help"><p>Salary, freelance work, rent, or something else — log income from as many sources as you need.</p>{onAddCategory && !addingSource && <Button variant="ghost" size="sm" onClick={() => { setAddingSource(true); setError(""); }}><Plus />New income source</Button>}{addingSource && <div className="ws-inline-source"><label>Source name<Input value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder="e.g. Acme salary or weekend tutoring" maxLength={60} /></label><div><Button size="sm" onClick={createSource} disabled={!sourceName.trim() || busy}>Save income source</Button><Button variant="ghost" size="sm" onClick={() => { setAddingSource(false); setSourceName(""); setError(""); }}>Cancel new source</Button></div></div>}</div>}
      <label>{type === "expense" && expenseStatus === "expected" ? "Planned payment method" : "Payment method"}<Select aria-label={type === "expense" && expenseStatus === "expected" ? "Planned payment method" : "Payment method"} name="payment_method" defaultValue={entry?.payment_method || "Cash"}>{paymentMethods.map(method => <option key={method}>{method}</option>)}</Select></label>
      <label>Notes <span className="field-optional">optional</span><textarea name="notes" defaultValue={entry?.notes} placeholder="Anything you’d like to remember…" maxLength={500} rows={2} /></label>{type === "income" && <PakistanTax compact entryDate={entryDate} />}
    </fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{entry ? "Save changes" : type === "expense" && expenseStatus === "expected" ? "Add expected expense" : type === "income" && incomeExpected ? "Add expected income" : `Add ${type}`}</Button></div></form>
  </DialogContent></Dialog>;
}
