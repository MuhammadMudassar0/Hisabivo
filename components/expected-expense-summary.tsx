"use client";

import { CalendarClock, Check } from "lucide-react";
import { Button } from "./ui/button";
import { dateLabel, isExpectedExpense, expenseRemaining, monthEnd, money, monthLabel, today, type Transaction } from "@/lib/ledger";
import "@/app/expense-integration.css";

export default function ExpectedExpenseSummary({ entries, month, loading, canWrite, onMarkPaid }: { entries: Transaction[]; month: string; loading: boolean; canWrite: boolean; onMarkPaid: (entry: Transaction) => void }) {
  if (!loading && !entries.length) return null;
  const total = entries.reduce((sum, entry) => sum + expenseRemaining(entry,monthEnd(month)), 0);
  return <section className="expected-summary" aria-labelledby="expected-summary-heading"><div className="expected-summary-header"><span className="expected-summary-icon"><CalendarClock size={23} /></span><div><h2 id="expected-summary-heading">Expected expenses</h2><p>Unpaid through {monthLabel(month)}. Remaining amounts exclude installments already paid.</p></div><strong>{loading ? "—" : money(total, true)}</strong></div>{!loading && <ul>{entries.slice(0, 4).map(entry => <li key={entry.id}><div><strong>{entry.description}</strong><span>{entry.category} · Expected {dateLabel(entry.date)}{isExpectedExpense(entry) && entry.date < today() ? " · Overdue" : ""}</span></div><strong>{money(expenseRemaining(entry,monthEnd(month)), true)}</strong>{expenseRemaining(entry)>0 ? <Button variant="outline" size="sm" disabled={!canWrite} onClick={() => onMarkPaid(entry)}><Check />{entry.expense_status === "partial" ? "Record payment" : "Mark as paid"}</Button> : <span className="expected-paid-later">Paid after this month</span>}</li>)}</ul>}{entries.length > 4 && <p className="expected-summary-more">{entries.length - 4} more expected {entries.length - 4 === 1 ? "expense" : "expenses"}. Open Transactions to review the full list by month.</p>}</section>;
}
