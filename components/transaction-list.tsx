"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpen, Paperclip, Check, ChevronDown, List, PanelTop, CircleMinus, CirclePlus, Clock3, LoaderCircle, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useLocale } from "./locale-provider";
import { displayCategory, displayDate, displayMonth, displayPaymentMethod } from "@/lib/urdu-labels";
import { dateLabel, isExpectedExpense, expenseRemaining, expensePaid, money, monthLabel, monthSummary, transactionDate, type Transaction } from "@/lib/ledger";
import "@/app/transaction-list.css";
import "@/app/expense-status.css";

type Props = {
  entries: Transaction[];
  month: string;
  compact?: boolean;
  loading?: boolean;
  canWrite: boolean;
  onEdit: (entry: Transaction) => void;
  onDelete: (entry: Transaction) => void;
  onViewAll?: () => void;
  onReceipts?:(entry:Transaction)=>void;
  onMarkPaid?: (entry: Transaction) => void;
};
type TypeFilter = "all" | "income" | "expense" | "expected";

export default function TransactionList({ entries, month, compact = false, loading = false, canWrite, onEdit, onDelete, onViewAll, onMarkPaid,onReceipts }: Props) {
  const { t, locale } = useLocale();
  const id = useId();
  const [tableScroll, setTableScroll] = useState(false);
  const tableRef=useRef<HTMLDivElement>(null);
  const [type, setType] = useState<TypeFilter>("all");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [paymentStatus, setPaymentStatus] = useState("all");
  const summary = useMemo(() => monthSummary(entries, month), [entries, month]);
  const incomeCount = summary.rows.filter(entry => entry.type === "income").length;
  const expenseCount = summary.rows.length - incomeCount;
  const expectedCount = summary.rows.filter(isExpectedExpense).length;
  const categories = [...new Set(summary.rows.map(entry => entry.category))].sort((a, b) => a.localeCompare(b));
  const search = query.trim().toLocaleLowerCase();
  const filtered = summary.rows.filter(entry => (type === "all" || (type === "expected" ? isExpectedExpense(entry) : entry.type === type))
    && (category === "all" || entry.category === category)
    && (paymentStatus === "all" || (entry.type === "expense" && (paymentStatus === "expected" ? isExpectedExpense(entry) : paymentStatus === "partial" ? entry.expense_status === "partial" : entry.expense_status !== "partial" && !isExpectedExpense(entry))))
    && `${entry.description} ${entry.category} ${entry.payment_method} ${entry.notes}`.toLocaleLowerCase().includes(search));
  const rows = compact ? filtered.slice(0,5) : filtered;
  const hasFilters = type !== "all" || Boolean(query) || category !== "all" || paymentStatus !== "all";

  useEffect(() => { setType("all"); setQuery(""); setCategory("all"); setPaymentStatus("all"); }, [month]);

  useEffect(()=>{try{setTableScroll(localStorage.getItem("hisabivo.transaction-scroll")==="table");}catch{/* Page scrolling is the default. */}},[]);
  useEffect(()=>{if(tableRef.current)tableRef.current.scrollTop=0;},[month,type,query,category,paymentStatus,tableScroll]);
  function toggleTableScroll(){const next=!tableScroll;setTableScroll(next);try{localStorage.setItem("hisabivo.transaction-scroll",next?"table":"page");}catch{/* Keep the preference for this visit. */}}
  function clearFilters() { setType("all"); setQuery(""); setCategory("all"); setPaymentStatus("all"); }
  const actions = (entry: Transaction) => <div className="tl-actions">{onReceipts&&<Button variant="ghost" size="icon" disabled={loading} aria-label={t(`Receipts for ${entry.description}`, `${entry.description} کی رسیدیں`)} onClick={()=>onReceipts(entry)}><Paperclip size={16}/></Button>}
    {entry.type === "expense" && expenseRemaining(entry)>0 && onMarkPaid && <Button variant="outline" size="sm" className="tl-mark-paid" disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onMarkPaid(entry); }}><Check size={14} />{entry.expense_status === "partial" ? t("Record payment", "ادائیگی درج کریں") : t("Mark as paid", "ادا شدہ نشان لگائیں")}</Button>}
    {entry.payment_tracking && onMarkPaid && <Button variant="outline" size="sm" disabled={loading} onClick={() => onMarkPaid(entry)}>{t("Payments", "ادائیگیاں")}</Button>}
    <Button variant="ghost" size="icon" aria-label={t(`Edit ${entry.description}`, `${entry.description} میں تبدیلی`)} disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onEdit(entry); }}><Pencil size={16} /></Button>
    <Button variant="ghost" size="icon" className="tl-delete" aria-label={t(`Delete ${entry.description}`, `${entry.description} حذف کریں`)} disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onDelete(entry); }}><Trash2 size={16} /></Button>
  </div>;

  return <section className={`tl-list${compact ? " tl-compact" : ""}`} aria-labelledby={`${id}-heading`} aria-busy={loading} data-scroll-mode={!compact && tableScroll ? "table" : "page"}>
    <div className="tl-header"><div><span className="tl-kicker">{t("INCOME & EXPENSES", "آمدنی اور اخراجات")}</span><h2 id={`${id}-heading`}>{compact ? t("Recent transactions", "حالیہ اندراجات") : t("Every entry, clearly recorded.", "ہر اندراج واضح انداز میں۔")}</h2><p>{displayMonth(month, locale)}{t(" · Your loans are tracked separately in Udhar.", " · ادھار کا حساب الگ رکھا جاتا ہے۔")}</p></div><div className="tl-list-controls">{!compact && <Button variant="outline" size="sm" className="tl-scroll-toggle" aria-pressed={tableScroll} onClick={toggleTableScroll}>{tableScroll?<List size={15}/>:<PanelTop size={15}/>}{tableScroll?t("Use page scroll", "پورا صفحہ اسکرول کریں"):t("Scroll inside table", "جدول کے اندر اسکرول کریں")}</Button>}{compact && onViewAll && <Button variant="outline" size="sm" className="tl-view-all" onClick={onViewAll}>{t("View all", "سب دیکھیں")}</Button>}</div></div>
    <div className="tl-month-totals" aria-label={t("Totals for the whole selected month", "منتخب ماہ کی کل رقم")}>
      <div className="tl-total-income"><span><CirclePlus size={17} />{t("Money received", "موصولہ رقم")}</span><strong>{loading ? "—" : money(summary.income)}</strong></div>
      <div className="tl-total-expense"><span><CircleMinus size={17} />{t("Money spent", "ادا شدہ خرچ")}</span><strong>{loading ? "—" : money(summary.expense)}</strong></div>
      <div className="tl-total-net"><span>{t("Net this month", "اس ماہ کی بچت")}</span><strong>{loading ? "—" : money(summary.net)}</strong></div>
      <div className="tl-total-expected"><span><Clock3 size={17} />{t("Expected expenses", "متوقع اخراجات")}</span><strong>{loading ? "—" : money(summary.expected)}</strong></div>
    </div>
    <div className="tl-toolbar"><div className="tl-type-filters" role="group" aria-label={t("Filter transactions by type", "اندراج کی قسم کا فلٹر")}>
      {([{ id: "all", label: t("All", "تمام"), count: summary.rows.length }, { id: "income", label: t("Income", "آمدنی"), count: incomeCount }, { id: "expense", label: t("Expenses", "اخراجات"), count: expenseCount }, { id: "expected", label: t("Expected", "متوقع"), count: expectedCount }] as const).map(filter => <button type="button" key={filter.id} aria-pressed={type === filter.id} aria-label={t(`${filter.label} transactions`, `${filter.label} کے اندراجات`)} data-type={filter.id} className={type === filter.id ? "is-active" : ""} onClick={() => { setType(filter.id); setPaymentStatus("all"); }} disabled={loading}>{filter.id === "income" ? <CirclePlus size={15} /> : filter.id === "expense" ? <CircleMinus size={15} /> : filter.id === "expected" ? <Clock3 size={15} /> : <SlidersHorizontal size={15} />}<span>{filter.label}</span><span className="tl-filter-count" aria-hidden="true">{loading ? "—" : filter.count}</span></button>)}
    </div><span className="tl-totals-note">{t("Expected costs stay outside spent and net totals.", "متوقع اخراجات ادا شدہ خرچ اور بچت میں شامل نہیں۔")}</span></div>
    {!compact && <div className="tl-search-filters"><div className="tl-search"><Search size={18} aria-hidden="true" /><Input aria-label={t("Search transactions", "اندراجات تلاش کریں")} placeholder={t("Search description, source, notes…", "تفصیل، ذریعہ یا یادداشت تلاش کریں…")} value={query} onChange={event => setQuery(event.target.value)} disabled={loading} />{query && <button type="button" aria-label={t("Clear transaction search", "تلاش صاف کریں")} onClick={() => setQuery("")}><X size={15} /></button>}</div><div className="tl-select"><select aria-label={t("Filter by category or income source", "زمرے یا آمدنی کے ذریعے کا فلٹر")} value={category} onChange={event => setCategory(event.target.value)} disabled={loading}><option value="all">{t("All sources & categories", "تمام ذرائع اور زمرے")}</option>{categories.map(name => <option key={name} value={name}>{displayCategory(name, locale)}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div><div className="tl-select tl-status-select"><select aria-label={t("Filter by payment status", "ادائیگی کی حالت کا فلٹر")} value={paymentStatus} onChange={event => { setPaymentStatus(event.target.value); setType("all"); }} disabled={loading}><option value="all">{t("All payment statuses", "ادائیگی کی تمام حالتیں")}</option><option value="paid">{t("Paid expenses", "ادا شدہ اخراجات")}</option><option value="expected">{t("Expected expenses", "متوقع اخراجات")}</option><option value="partial">{t("Partially paid", "جزوی ادائیگی")}</option></select><ChevronDown size={16} aria-hidden="true" /></div>{hasFilters && <Button variant="ghost" size="sm" className="tl-clear" onClick={clearFilters}><X size={14} />{t("Clear filters", "فلٹر ہٹائیں")}</Button>}</div>}
    {loading ? <div className="tl-empty" role="status"><LoaderCircle size={27} className="animate-spin" /><h3>{t("Loading your transactions…", "آپ کے اندراجات لوڈ ہو رہے ہیں…")}</h3><p>{t("Gathering the details for this month.", "اس ماہ کی تفصیلات جمع ہو رہی ہیں۔")}</p></div> : !rows.length ? <div className="tl-empty"><span><BookOpen size={25} /></span><h3>{hasFilters ? t("No matching transactions", "کوئی ملتا جلتا اندراج نہیں") : t("A fresh page for this month", "اس ماہ کا نیا حساب")}</h3><p>{hasFilters ? t("Try a different type, source, or search term.", "قسم، ذریعہ یا تلاش کے الفاظ بدل کر دیکھیں۔") : t("Add income or an expense to begin. Both will be easy to tell apart here.", "شروع کرنے کے لیے آمدنی یا خرچ درج کریں۔ یہاں دونوں واضح نظر آئیں گے۔")}</p>{hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>{t("Show all transactions", "تمام اندراجات دکھائیں")}</Button>}</div> : <>
      <div className="tl-desktop" ref={tableRef} role="region" aria-label={t("Transaction table", "اندراجات کا جدول")} tabIndex={!compact && tableScroll ? 0 : undefined}><table className="tl-table"><caption className="sr-only">Income, paid expenses, and expected expenses for {displayMonth(month, locale)}. Plus amounts are income; minus amounts are paid expenses. Planned amounts have not been paid. Loans are not included.</caption><thead><tr><th scope="col">{t("Description", "تفصیل")}</th><th scope="col">{t("Type / status", "قسم / حالت")}</th><th scope="col">{t("Source / category", "ذریعہ / زمرہ")}</th><th scope="col">{t("Date", "تاریخ")}</th><th scope="col" className="tl-amount-heading">{t("Amount", "رقم")}</th><th scope="col"><span className="sr-only">{t("Actions", "اختیارات")}</span></th></tr></thead><tbody>{rows.map(entry => <tr key={entry.id} className={`tl-row tl-row-${entry.type}${isExpectedExpense(entry) ? " tl-row-expected" : ""}`}><td><div className="tl-description"><span className={`tl-entry-symbol ${entry.type}${isExpectedExpense(entry) ? " expected" : ""}`} aria-hidden="true">{entry.type === "income" ? <CirclePlus size={19} /> : isExpectedExpense(entry) ? <Clock3 size={19} /> : <CircleMinus size={19} />}</span><div><strong>{entry.description}</strong>{entry.notes && <p title={entry.notes}>{entry.notes}</p>}</div></div></td><td><div className="tl-type-status"><TypeBadge type={entry.type} /><PaymentBadge entry={entry} /></div></td><td><div className="tl-source"><span>{displayCategory(entry.category, locale)}</span><small>{isExpectedExpense(entry) ? t("Planned: ", "متوقع: ") : ""}{displayPaymentMethod(entry.payment_method, locale)}</small></div></td><td className="tl-date"><DateCell entry={entry} /></td><td className={`tl-amount ${entry.type}${isExpectedExpense(entry) ? " tl-amount-expected" : ""}`}><Amount entry={entry} month={month} /></td><td>{actions(entry)}</td></tr>)}</tbody></table></div>
      <ul className="tl-mobile" aria-label={t("Monthly transaction records", "ماہانہ اندراجات")}>{rows.map(entry => <li key={entry.id} className={`tl-mobile-card tl-mobile-${entry.type}${isExpectedExpense(entry) ? " tl-mobile-expected" : ""}`}><div className="tl-mobile-top"><div className="tl-mobile-badges"><TypeBadge type={entry.type} /><PaymentBadge entry={entry} /></div><DateCell entry={entry} /></div><div className="tl-mobile-main"><strong>{entry.description}</strong><span className={`tl-amount ${entry.type}${isExpectedExpense(entry) ? " tl-amount-expected" : ""}`}><Amount entry={entry} month={month} /></span></div><dl className="tl-mobile-details"><div><dt>{entry.type === "income" ? t("Income source", "آمدنی کا ذریعہ") : t("Category", "زمرہ")}</dt><dd>{displayCategory(entry.category, locale)}</dd></div><div><dt>{isExpectedExpense(entry) ? t("Planned method", "متوقع طریقہ") : t("Payment method", "طریقۂ ادائیگی")}</dt><dd>{displayPaymentMethod(entry.payment_method, locale)}</dd></div></dl>{entry.notes && <p className="tl-mobile-notes">{entry.notes}</p>}<div className="tl-mobile-bottom"><span>{entry.type === "income" ? t("Money in", "موصولہ رقم") : isExpectedExpense(entry) ? t("Awaiting payment", "ادائیگی باقی ہے") : t("Money out · paid", "ادا شدہ خرچ")}</span>{actions(entry)}</div></li>)}</ul>
      <div className="tl-footer"><span aria-live="polite">{compact && filtered.length>rows.length ? t(`Showing ${rows.length} of `, `${rows.length} دکھائے گئے، کل `) : ""}{filtered.length} {hasFilters ? t("matching ", "ملتے جلتے ") : ""}{filtered.length === 1 ? t("entry", "اندراج") : t("entries", "اندراجات")}{!compact && <span className="tl-scroll-hint">{t(" · All records for this month", " · اس ماہ کے تمام اندراجات")}</span>}</span></div>
    </>}
  </section>;
}

function TypeBadge({ type }: { type: Transaction["type"] }) { const {t}=useLocale(); return <span className={`tl-type-badge ${type}`}>{type === "income" ? <CirclePlus size={14} aria-hidden="true" /> : <CircleMinus size={14} aria-hidden="true" />}{type === "income" ? t("Income", "آمدنی") : t("Expense", "خرچ")}</span>; }

function PaymentBadge({ entry }: { entry: Transaction }) {
  const {t}=useLocale();
  if (entry.type !== "expense") return null;
  const expected = isExpectedExpense(entry);
  return <span className={`es-status-badge ${expected ? "expected" : entry.expense_status === "partial" ? "partial" : "paid"}`}>{expected ? <Clock3 /> : <Check />}{expected ? t("Expected", "متوقع") : entry.expense_status === "partial" ? t("Partially paid", "جزوی ادائیگی") : t("Paid", "ادا شدہ")}</span>;
}
function Amount({ entry,month }: { entry: Transaction;month:string }) {
  const {t}=useLocale();
  const expected = isExpectedExpense(entry);
  if(entry.payment_tracking)return <><small className="tl-planned-label">{t("Bill total", "بل کی کل رقم")}</small><span>{money(entry.amount_paisa,true)}</span><small>{money((entry.payments||[]).filter(p=>p.date.slice(0,7)===month).reduce((s,p)=>s+p.amount_paisa,0),true)}{t(" paid this month", " اس ماہ ادا شدہ")}</small><small>{money(expensePaid(entry),true)}{t(" paid overall · ", " کل ادا شدہ · ")}{money(expenseRemaining(entry),true)}{t(" left", " باقی")}</small></>;
  return <>{expected && <small className="tl-planned-label">{t("Planned", "متوقع")}</small>}<span>{entry.type === "income" ? "+" : expected ? "" : "−"}{money(entry.amount_paisa, true)}</span></>;
}
function DateCell({ entry }: { entry: Transaction }) {
  const {t,locale}=useLocale();
  const date = transactionDate(entry);
  return <span className="tl-date-stack"><time dateTime={date}>{displayDate(date, locale)}</time>{entry.type === "expense" && !isExpectedExpense(entry) && entry.paid_date && entry.paid_date !== entry.date && <small>{t("Planned", "متوقع")} {displayDate(entry.date, locale)}</small>}</span>;
}
