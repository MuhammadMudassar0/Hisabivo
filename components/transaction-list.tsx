"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BookOpen, Check, ChevronDown, List, PanelTop, CircleMinus, CirclePlus, Clock3, LoaderCircle, Pencil, Search, SlidersHorizontal, Trash2, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
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
  onMarkPaid?: (entry: Transaction) => void;
};
type TypeFilter = "all" | "income" | "expense" | "expected";

export default function TransactionList({ entries, month, compact = false, loading = false, canWrite, onEdit, onDelete, onViewAll, onMarkPaid }: Props) {
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
  const actions = (entry: Transaction) => <div className="tl-actions">
    {entry.type === "expense" && expenseRemaining(entry)>0 && onMarkPaid && <Button variant="outline" size="sm" className="tl-mark-paid" disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onMarkPaid(entry); }}><Check size={14} />{entry.expense_status === "partial" ? "Record payment" : "Mark as paid"}</Button>}
    {entry.payment_tracking && onMarkPaid && <Button variant="outline" size="sm" disabled={!canWrite || loading} onClick={() => onMarkPaid(entry)}>Payments</Button>}
    <Button variant="ghost" size="icon" aria-label={`Edit ${entry.description}`} disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onEdit(entry); }}><Pencil size={16} /></Button>
    <Button variant="ghost" size="icon" className="tl-delete" aria-label={`Delete ${entry.description}`} disabled={!canWrite || loading} onClick={() => { if (canWrite && !loading) onDelete(entry); }}><Trash2 size={16} /></Button>
  </div>;

  return <section className={`tl-list${compact ? " tl-compact" : ""}`} aria-labelledby={`${id}-heading`} aria-busy={loading} data-scroll-mode={!compact && tableScroll ? "table" : "page"}>
    <div className="tl-header"><div><span className="tl-kicker">INCOME & EXPENSES</span><h2 id={`${id}-heading`}>{compact ? "Recent transactions" : "Every entry, clearly recorded."}</h2><p>{monthLabel(month)} · Your loans are tracked separately in Udhar.</p></div><div className="tl-list-controls">{!compact && <Button variant="outline" size="sm" className="tl-scroll-toggle" aria-pressed={tableScroll} onClick={toggleTableScroll}>{tableScroll?<List size={15}/>:<PanelTop size={15}/>}{tableScroll?"Use page scroll":"Scroll inside table"}</Button>}{compact && onViewAll && <Button variant="outline" size="sm" className="tl-view-all" onClick={onViewAll}>View all</Button>}</div></div>
    <div className="tl-month-totals" aria-label="Totals for the whole selected month">
      <div className="tl-total-income"><span><CirclePlus size={17} />Money received</span><strong>{loading ? "—" : money(summary.income)}</strong></div>
      <div className="tl-total-expense"><span><CircleMinus size={17} />Money spent</span><strong>{loading ? "—" : money(summary.expense)}</strong></div>
      <div className="tl-total-net"><span>Net this month</span><strong>{loading ? "—" : money(summary.net)}</strong></div>
      <div className="tl-total-expected"><span><Clock3 size={17} />Expected expenses</span><strong>{loading ? "—" : money(summary.expected)}</strong></div>
    </div>
    <div className="tl-toolbar"><div className="tl-type-filters" role="group" aria-label="Filter transactions by type">
      {([{ id: "all", label: "All", count: summary.rows.length }, { id: "income", label: "Income", count: incomeCount }, { id: "expense", label: "Expenses", count: expenseCount }, { id: "expected", label: "Expected", count: expectedCount }] as const).map(filter => <button type="button" key={filter.id} aria-pressed={type === filter.id} aria-label={`${filter.label} transactions`} data-type={filter.id} className={type === filter.id ? "is-active" : ""} onClick={() => { setType(filter.id); setPaymentStatus("all"); }} disabled={loading}>{filter.id === "income" ? <CirclePlus size={15} /> : filter.id === "expense" ? <CircleMinus size={15} /> : filter.id === "expected" ? <Clock3 size={15} /> : <SlidersHorizontal size={15} />}<span>{filter.label}</span><span className="tl-filter-count" aria-hidden="true">{loading ? "—" : filter.count}</span></button>)}
    </div><span className="tl-totals-note">Expected costs stay outside spent and net totals.</span></div>
    {!compact && <div className="tl-search-filters"><div className="tl-search"><Search size={18} aria-hidden="true" /><Input aria-label="Search transactions" placeholder="Search description, source, notes…" value={query} onChange={event => setQuery(event.target.value)} disabled={loading} />{query && <button type="button" aria-label="Clear transaction search" onClick={() => setQuery("")}><X size={15} /></button>}</div><div className="tl-select"><select aria-label="Filter by category or income source" value={category} onChange={event => setCategory(event.target.value)} disabled={loading}><option value="all">All sources & categories</option>{categories.map(name => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={16} aria-hidden="true" /></div><div className="tl-select tl-status-select"><select aria-label="Filter by payment status" value={paymentStatus} onChange={event => { setPaymentStatus(event.target.value); setType("all"); }} disabled={loading}><option value="all">All payment statuses</option><option value="paid">Paid expenses</option><option value="expected">Expected expenses</option><option value="partial">Partially paid</option></select><ChevronDown size={16} aria-hidden="true" /></div>{hasFilters && <Button variant="ghost" size="sm" className="tl-clear" onClick={clearFilters}><X size={14} />Clear filters</Button>}</div>}
    {loading ? <div className="tl-empty" role="status"><LoaderCircle size={27} className="animate-spin" /><h3>Loading your transactions…</h3><p>Gathering the details for this month.</p></div> : !rows.length ? <div className="tl-empty"><span><BookOpen size={25} /></span><h3>{hasFilters ? "No matching transactions" : "A fresh page for this month"}</h3><p>{hasFilters ? "Try a different type, source, or search term." : "Add income or an expense to begin. Both will be easy to tell apart here."}</p>{hasFilters && <Button variant="outline" size="sm" onClick={clearFilters}>Show all transactions</Button>}</div> : <>
      <div className="tl-desktop" ref={tableRef} role="region" aria-label="Transaction table" tabIndex={!compact && tableScroll ? 0 : undefined}><table className="tl-table"><caption className="sr-only">Income, paid expenses, and expected expenses for {monthLabel(month)}. Plus amounts are income; minus amounts are paid expenses. Planned amounts have not been paid. Loans are not included.</caption><thead><tr><th scope="col">Description</th><th scope="col">Type / status</th><th scope="col">Source / category</th><th scope="col">Date</th><th scope="col" className="tl-amount-heading">Amount</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead><tbody>{rows.map(entry => <tr key={entry.id} className={`tl-row tl-row-${entry.type}${isExpectedExpense(entry) ? " tl-row-expected" : ""}`}><td><div className="tl-description"><span className={`tl-entry-symbol ${entry.type}${isExpectedExpense(entry) ? " expected" : ""}`} aria-hidden="true">{entry.type === "income" ? <CirclePlus size={19} /> : isExpectedExpense(entry) ? <Clock3 size={19} /> : <CircleMinus size={19} />}</span><div><strong>{entry.description}</strong>{entry.notes && <p title={entry.notes}>{entry.notes}</p>}</div></div></td><td><div className="tl-type-status"><TypeBadge type={entry.type} /><PaymentBadge entry={entry} /></div></td><td><div className="tl-source"><span>{entry.category}</span><small>{isExpectedExpense(entry) ? "Planned: " : ""}{entry.payment_method}</small></div></td><td className="tl-date"><DateCell entry={entry} /></td><td className={`tl-amount ${entry.type}${isExpectedExpense(entry) ? " tl-amount-expected" : ""}`}><Amount entry={entry} month={month} /></td><td>{actions(entry)}</td></tr>)}</tbody></table></div>
      <ul className="tl-mobile" aria-label="Monthly transaction records">{rows.map(entry => <li key={entry.id} className={`tl-mobile-card tl-mobile-${entry.type}${isExpectedExpense(entry) ? " tl-mobile-expected" : ""}`}><div className="tl-mobile-top"><div className="tl-mobile-badges"><TypeBadge type={entry.type} /><PaymentBadge entry={entry} /></div><DateCell entry={entry} /></div><div className="tl-mobile-main"><strong>{entry.description}</strong><span className={`tl-amount ${entry.type}${isExpectedExpense(entry) ? " tl-amount-expected" : ""}`}><Amount entry={entry} month={month} /></span></div><dl className="tl-mobile-details"><div><dt>{entry.type === "income" ? "Income source" : "Category"}</dt><dd>{entry.category}</dd></div><div><dt>{isExpectedExpense(entry) ? "Planned method" : "Payment method"}</dt><dd>{entry.payment_method}</dd></div></dl>{entry.notes && <p className="tl-mobile-notes">{entry.notes}</p>}<div className="tl-mobile-bottom"><span>{entry.type === "income" ? "Money in" : isExpectedExpense(entry) ? "Awaiting payment" : "Money out · paid"}</span>{actions(entry)}</div></li>)}</ul>
      <div className="tl-footer"><span aria-live="polite">{compact && filtered.length>rows.length ? `Showing ${rows.length} of ` : ""}{filtered.length} {hasFilters ? "matching " : ""}{filtered.length === 1 ? "entry" : "entries"}{!compact && <span className="tl-scroll-hint"> · All records for this month</span>}</span></div>
    </>}
  </section>;
}

function TypeBadge({ type }: { type: Transaction["type"] }) { return <span className={`tl-type-badge ${type}`}>{type === "income" ? <CirclePlus size={14} aria-hidden="true" /> : <CircleMinus size={14} aria-hidden="true" />}{type === "income" ? "Income" : "Expense"}</span>; }

function PaymentBadge({ entry }: { entry: Transaction }) {
  if (entry.type !== "expense") return null;
  const expected = isExpectedExpense(entry);
  return <span className={`es-status-badge ${expected ? "expected" : entry.expense_status === "partial" ? "partial" : "paid"}`}>{expected ? <Clock3 /> : <Check />}{expected ? "Expected" : entry.expense_status === "partial" ? "Partially paid" : "Paid"}</span>;
}
function Amount({ entry,month }: { entry: Transaction;month:string }) {
  const expected = isExpectedExpense(entry);
  if(entry.payment_tracking)return <><small className="tl-planned-label">Bill total</small><span>{money(entry.amount_paisa,true)}</span><small>{money((entry.payments||[]).filter(p=>p.date.slice(0,7)===month).reduce((s,p)=>s+p.amount_paisa,0),true)} paid this month</small><small>{money(expensePaid(entry),true)} paid overall · {money(expenseRemaining(entry),true)} left</small></>;
  return <>{expected && <small className="tl-planned-label">Planned</small>}<span>{entry.type === "income" ? "+" : expected ? "" : "−"}{money(entry.amount_paisa, true)}</span></>;
}
function DateCell({ entry }: { entry: Transaction }) {
  const date = transactionDate(entry);
  return <span className="tl-date-stack"><time dateTime={date}>{dateLabel(date)}</time>{entry.type === "expense" && !isExpectedExpense(entry) && entry.paid_date && entry.paid_date !== entry.date && <small>Planned {dateLabel(entry.date)}</small>}</span>;
}
