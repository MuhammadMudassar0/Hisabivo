"use client";
import { useRef, useState, type FormEvent } from "react";
import { Check, ChevronDown, Clock3, LoaderCircle, Minus, Plus } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import PakistanTax from "./pakistan-tax";
import { useLocale } from "./locale-provider";
import { displayCategory, displayPaymentMethod } from "@/lib/urdu-labels";
import AccountSelect from "./account-select";
import type { Account } from "@/lib/accounts";
import { isExpectedExpense, expensePaid, parseAmount, paymentMethods, today, validateEntry, type Category, type EntryInput, type EntryType, type Transaction } from "@/lib/ledger";
import "@/app/expense-status.css";

export function Select({ children, className = "", ...props }: React.ComponentProps<"select">) {
  return <div className={`select-wrap ${className}`}><select {...props}>{children}</select><ChevronDown size={16} /></div>;
}
export default function EntryDialog({ entry, initialType, categories, onClose, onSave, onAddCategory, onExpectedIncome, accounts = [], draft }: { accounts?: Account[]; draft?: Partial<EntryInput>; entry?: Transaction; initialType: EntryType; categories: Category[]; onClose: () => void; onSave: (input: EntryInput, id?: string) => Promise<void>; onAddCategory?: (name: string, type: EntryType) => Promise<Category>; onExpectedIncome?: (input:EntryInput)=>Promise<void> }) {
  const { t, locale } = useLocale();
  const seed = entry ? undefined : draft;
  const [accountId, setAccountId] = useState(entry?.account_id || "");
  const [type, setType] = useState<EntryType>(entry?.type || initialType);
  const [incomeExpected,setIncomeExpected]=useState(false);
  const tracked=Boolean(entry?.payment_tracking);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [entryDate, setEntryDate] = useState(entry?.date || seed?.date || today());
  const [expenseStatus, setExpenseStatus] = useState<"paid" | "expected" | "partial">(entry?.expense_status || "paid");
  const [paidDate, setPaidDate] = useState(entry?.paid_date || (entry && isExpectedExpense(entry) ? today() : entry?.date || today()));
  const hasScheduledDate = Boolean(entry?.type === "expense" && (isExpectedExpense(entry) || (entry.paid_date && entry.paid_date !== entry.date)));
  const pending = useRef(false);
  const [selectedCategory, setSelectedCategory] = useState(entry?.category || seed?.category || categories.find(c => c.type === initialType)?.name || "");
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
  const missingCategory = !options.some(category => category.name === selectedCategory) ? selectedCategory : "";
  function changeDate(next: string) { setEntryDate(next); if (!hasScheduledDate) setPaidDate(next); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return; setError("");
    if (addingSource) { setError("Save your new income source or cancel it before recording the income."); return; }
    const form = new FormData(event.currentTarget);
    try {
      const input: EntryInput = { account_id: type === "income" && incomeExpected ? null : accountId || null, payment_tracking:entry?.payment_tracking,payments:entry?.payments,type, amount_paisa: parseAmount(String(form.get("amount"))), description: String(form.get("description")).trim(), category: String(form.get("category")), date: String(form.get("date")), payment_method: String(form.get("payment_method")) as EntryInput["payment_method"], notes: String(form.get("notes")).trim(), expense_status: type === "expense" ? expenseStatus : "paid", paid_date: type === "expense" && expenseStatus === "paid" ? (hasScheduledDate ? paidDate : entryDate) : null };
      if(tracked && input.amount_paisa<expensePaid(entry!))throw new Error("The total cannot be less than payments already recorded.");
      validateEntry(input); pending.current = true; setBusy(true); if(type === "income" && incomeExpected && onExpectedIncome)await onExpectedIncome(input);else await onSave(input, entry?.id); onClose();
    } catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "Could not save this transaction. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}>
    <div className="modal-icon"><Plus size={22} /></div><DialogTitle className="dialog-title">{entry ? t("Edit transaction", "اندراج میں تبدیلی") : t("A little entry. A clearer picture.", "ایک چھوٹا اندراج، واضح حساب۔")}</DialogTitle><DialogDescription className="dialog-description">{entry ? t("Update the details in your ledger.", "اپنے حساب کے اندراج کی تفصیل بدلیں۔") : t("Log your income, a paid expense, or a cost you’re expecting.", "آمدنی، ادا شدہ خرچ یا آنے والا خرچ درج کریں۔")}</DialogDescription>
    <form onSubmit={submit} className="entry-form"><fieldset disabled={busy} className="form-fieldset">
      <div className="type-toggle"><button type="button" aria-pressed={type === "expense"} className={type === "expense" ? "active expense" : ""} onClick={() => chooseType("expense")}><Minus size={16} />{t("Expense", "خرچ")}</button><button type="button" aria-pressed={type === "income"} className={type === "income" ? "active income" : ""} disabled={tracked} onClick={() => chooseType("income")}><Plus size={16} />{t("Income", "آمدنی")}</button></div>
      {type === "expense" && !tracked && <div className="es-form-status"><span>{t("Payment status", "ادائیگی کی حالت")}</span><div role="group" aria-label={t("Expense payment status", "خرچ کی ادائیگی کی حالت")}><button type="button" aria-pressed={expenseStatus === "paid"} className={expenseStatus === "paid" ? "es-selected es-paid-choice" : ""} onClick={() => setExpenseStatus("paid")}><Check size={17} /><span>{t("Paid", "ادا شدہ")}<small>{t("Already spent", "رقم ادا ہو چکی")}</small></span></button><button type="button" aria-pressed={expenseStatus === "expected"} className={expenseStatus === "expected" ? "es-selected es-expected-choice" : ""} onClick={() => setExpenseStatus("expected")}><Clock3 size={17} /><span>{t("Expected", "متوقع")}<small>{t("Not paid yet", "ابھی ادا نہیں کیا")}</small></span></button></div><p>{expenseStatus === "expected" ? t("Keep this planned cost in view, then record full or partial payments. Only money actually paid counts as spending.", "اس متوقع خرچ کو محفوظ رکھیں، پھر مکمل یا جزوی ادائیگی درج کریں۔ صرف ادا شدہ رقم خرچ میں شمار ہو گی۔") : t("This expense counts as money spent on its paid date.", "یہ خرچ ادائیگی کی تاریخ پر شمار ہو گا۔")}</p></div>}
      {tracked && <p className="plan-note">{t("Payment history controls this bill’s status. Use Payments to record or undo installments.", "اس بل کی حالت ادائیگیوں کے ریکارڈ سے طے ہوتی ہے۔ قسط درج یا واپس کرنے کے لیے ادائیگیاں کھولیں۔")}</p>}
      {type === "income" && !entry && onExpectedIncome && <div className="es-form-status"><span>{t("Income status", "آمدنی کی حالت")}</span><div role="group" aria-label={t("Income receipt status", "آمدنی کی وصولی کی حالت")}><button type="button" aria-pressed={!incomeExpected} onClick={()=>setIncomeExpected(false)} className={!incomeExpected?"es-selected":""}><Check/><span>{t("Received", "موصول شدہ")}<small>{t("Money already in", "رقم مل چکی")}</small></span></button><button type="button" aria-pressed={incomeExpected} onClick={()=>setIncomeExpected(true)} className={incomeExpected?"es-selected":""}><Clock3/><span>{t("Expected", "متوقع")}<small>{t("Receive later", "بعد میں ملے گی")}</small></span></button></div><p>{t("Expected income stays outside cash and received totals until you confirm receipt.", "جب تک وصولی کی تصدیق نہ کریں، متوقع آمدنی نقد رقم اور موصولہ آمدنی میں شمار نہیں ہوتی۔")}</p></div>}
      <label>{t("Amount", "رقم")} <span className="field-optional">PKR</span><div className="amount-input"><span>Rs</span><Input name="amount" type="text" inputMode="decimal" placeholder="0.00" defaultValue={entry ? (entry.amount_paisa / 100).toFixed(2) : seed?.amount_paisa !== undefined ? (seed.amount_paisa / 100).toFixed(2) : ""} required maxLength={32} autoFocus /></div></label>
      <label>{t("Description", "تفصیل")}<Input name="description" placeholder={type === "expense" ? t("e.g. Bike fuel on the way to work", "مثلاً کام جاتے وقت موٹر سائیکل کا ایندھن") : t("e.g. Monthly salary", "مثلاً ماہانہ تنخواہ")} defaultValue={entry?.description || seed?.description} maxLength={100} required /></label>
      <div className="form-row"><label>{type === "income" ? t("Income source", "آمدنی کا ذریعہ") : t("Category", "زمرہ")}<Select aria-label={type === "income" ? t("Income source", "آمدنی کا ذریعہ") : t("Category", "زمرہ")} name="category" value={selectedCategory} onChange={event => setSelectedCategory(event.target.value)} required>{missingCategory && <option value={missingCategory}>{displayCategory(missingCategory, locale)}</option>}{options.map(category => <option key={category.id} value={category.name}>{displayCategory(category.name, locale)}</option>)}</Select></label><label>{type === "income" ? incomeExpected ? t("Expected receipt date", "رقم ملنے کی متوقع تاریخ") : t("Date", "تاریخ") : tracked ? t("Expected date", "متوقع تاریخ") : expenseStatus === "expected" ? t("Expected date", "متوقع تاریخ") : hasScheduledDate ? t("Original expected date", "اصل متوقع تاریخ") : t("Paid on", "ادائیگی کی تاریخ")}<Input name="date" type="date" value={entryDate} onChange={event => changeDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label></div>
      {type === "expense" && expenseStatus === "paid" && hasScheduledDate && !tracked && <label>{t("Paid on", "ادائیگی کی تاریخ")}<Input name="paid_date" type="date" value={paidDate} onChange={event => setPaidDate(event.target.value)} min="1900-01-01" max="9999-12-31" required /></label>}
      {type === "income" && <div className="ws-income-source-help"><p>{t("Salary, freelance work, rent, or something else — log income from as many sources as you need.", "تنخواہ، فری لانس کام، کرایہ یا دیگر ذرائع سے حاصل ہونے والی آمدنی درج کریں۔")}</p>{onAddCategory && !addingSource && <Button variant="ghost" size="sm" onClick={() => { setAddingSource(true); setError(""); }}><Plus />{t("New income source", "آمدنی کا نیا ذریعہ")}</Button>}{addingSource && <div className="ws-inline-source"><label>{t("Source name", "ذریعے کا نام")}<Input value={sourceName} onChange={event => setSourceName(event.target.value)} placeholder={t("e.g. Acme salary or weekend tutoring", "مثلاً کمپنی کی تنخواہ یا ٹیوشن کی آمدنی")} maxLength={60} /></label><div><Button size="sm" onClick={createSource} disabled={!sourceName.trim() || busy}>{t("Save income source", "ذریعہ محفوظ کریں")}</Button><Button variant="ghost" size="sm" onClick={() => { setAddingSource(false); setSourceName(""); setError(""); }}>{t("Cancel new source", "نیا ذریعہ منسوخ کریں")}</Button></div></div>}</div>}
      <label>{type === "expense" && expenseStatus === "expected" ? t("Planned payment method", "متوقع طریقۂ ادائیگی") : t("Payment method", "طریقۂ ادائیگی")}<Select aria-label={type === "expense" && expenseStatus === "expected" ? t("Planned payment method", "متوقع طریقۂ ادائیگی") : t("Payment method", "طریقۂ ادائیگی")} name="payment_method" defaultValue={entry?.payment_method || seed?.payment_method || "Cash"}>{paymentMethods.map(method => <option key={method} value={method}>{displayPaymentMethod(method, locale)}</option>)}</Select></label>
      {!(type === "income" && incomeExpected) && <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} label={type === "expense" && expenseStatus === "expected" ? t("Planned money account", "متوقع رقم کا اکاؤنٹ") : t("Money account", "رقم کا اکاؤنٹ")} />}
      <label>{t("Notes", "یادداشت")} <span className="field-optional">{t("optional", "اختیاری")}</span><textarea name="notes" defaultValue={entry?.notes || seed?.notes} placeholder={t("Anything you’d like to remember…", "کوئی بات جو آپ یاد رکھنا چاہتے ہیں…")} maxLength={500} rows={2} /></label>{type === "income" && <PakistanTax compact entryDate={entryDate} />}
    </fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" onClick={onClose} disabled={busy}>{t("Cancel", "منسوخ کریں")}</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}{entry ? t("Save changes", "تبدیلیاں محفوظ کریں") : type === "expense" && expenseStatus === "expected" ? t("Add expected expense", "متوقع خرچ درج کریں") : type === "income" && incomeExpected ? t("Add expected income", "متوقع آمدنی درج کریں") : type === "income" ? t("Add income", "آمدنی درج کریں") : t("Add expense", "خرچ درج کریں")}</Button></div></form>
  </DialogContent></Dialog>;
}
