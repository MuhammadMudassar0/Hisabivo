"use client";

import { useRef, useState, type FormEvent } from "react";
import { Check, CalendarDays, LoaderCircle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { dateLabel, isExpectedExpense, money, today, validDate, type Transaction } from "@/lib/ledger";
import "@/app/expense-status.css";

export default function MarkExpensePaidDialog({ entry, onClose, onConfirm }: { entry: Transaction; onClose: () => void; onConfirm: (paidDate: string) => Promise<void> }) {
  const [paidDate, setPaidDate] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending.current) return; setError("");
    if (!isExpectedExpense(entry)) { setError("This expense is already marked as paid. Refresh your records to see its latest status."); return; }
    if (!validDate(paidDate)) { setError("Choose a valid paid date from 1900 onward."); return; }
    pending.current = true; setBusy(true);
    try { await onConfirm(paidDate); onClose(); }
    catch (err) { setError(err && typeof err === "object" && "message" in err ? String(err.message) : "We couldn’t mark this expense as paid. Please try again."); }
    finally { pending.current = false; setBusy(false); }
  }
  return <Dialog open onOpenChange={open => { if (!open && !pending.current) onClose(); }}><DialogContent className="es-mark-dialog" onEscapeKeyDown={event => { if (pending.current) event.preventDefault(); }} onPointerDownOutside={event => { if (pending.current) event.preventDefault(); }}>
    <span className="es-mark-icon"><Check size={24} /></span><DialogTitle className="dialog-title">Mark this expense as paid?</DialogTitle><DialogDescription className="dialog-description">The expense will count as money spent in the month of its paid date.</DialogDescription><div className="es-mark-summary"><span>{entry.category}</span><strong>{entry.description}</strong><b>{money(entry.amount_paisa, true)}</b><span><CalendarDays size={15} />Expected {dateLabel(entry.date)}</span></div>
    <form onSubmit={submit}><fieldset disabled={busy}><label>Paid on<Input type="date" name="paid_date" value={paidDate} onChange={event => setPaidDate(event.target.value)} min="1900-01-01" max="9999-12-31" required autoFocus /></label><p className="es-mark-hint">Choose the day you actually paid, including a past date if needed. This updates the same expense.</p></fieldset>{error && <p className="error-message" role="alert">{error}</p>}<div className="dialog-actions"><Button variant="outline" disabled={busy} onClick={onClose}>Keep expected</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="animate-spin" />}Mark as paid</Button></div></form>
  </DialogContent></Dialog>;
}
