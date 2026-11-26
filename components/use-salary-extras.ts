"use client";

import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";
import { expenseRemaining, normalizeEntry, today, validDate, validateEntry, type Transaction, type ExpensePayment } from "@/lib/ledger";
import type { Employee } from "@/lib/salaries";
import { advanceUnused, applyAdvance, fetchSalaryExtras, grantAdvance, salarySnapshot, validateSalaryAdvance, type AdvanceInput, type SalaryAdvance, type SalaryStatement } from "@/lib/salary-extras";

const key = "hisabivo.demo.salary-extras.v1";
export type SalaryBill = { employeeId: string; entry: Transaction };
const message = (error: unknown) => error && typeof error === "object" && "message" in error ? String(error.message) : "Salary advances and statements could not be loaded.";

export function useSalaryExtras(ownerId: string, demo: boolean, employees: Employee[], entries: Transaction[], onDemoEntriesUpdater: Dispatch<SetStateAction<Transaction[]>>, onReload: () => Promise<void> | void, readOnly = false) {
  const [advances, setAdvances] = useState<SalaryAdvance[]>([]);
  const [statements, setStatements] = useState<SalaryStatement[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const advancesRef = useRef(advances), statementsRef = useRef(statements), entriesRef = useRef(entries), employeesRef = useRef(employees), readyRef = useRef(ready), lock = useRef(false);
  entriesRef.current = entries; employeesRef.current = employees; readyRef.current = ready;
  function install(data: { advances: SalaryAdvance[]; statements: SalaryStatement[] }) { advancesRef.current = data.advances; statementsRef.current = data.statements; setAdvances(data.advances); setStatements(data.statements); }
  useEffect(() => {
    let active = true; setReady(false); setError("");
    (async () => {
      try {
        const stored = demo ? JSON.parse(localStorage.getItem(key) || '{"advances":[],"statements":[]}') : await fetchSalaryExtras(ownerId);
        if (!Array.isArray(stored.advances) || !Array.isArray(stored.statements) || stored.advances.some((row: SalaryAdvance) => !row.id || !row.employee_id || !row.transaction_id || !Number.isSafeInteger(row.amount_paisa) || row.amount_paisa <= 0 || !validDate(row.date)) || stored.statements.some((row: SalaryStatement) => !row.id || !row.expense_id || !row.employee_id || !Number.isSafeInteger(row.net_paisa) || row.net_paisa <= 0)) throw new Error("Saved salary extras could not be opened. Restore a valid backup or clear the demo records.");
        if (active) { install(stored); setReady(true); }
      } catch (err) { if (active) setError(message(err)); }
    })(); return () => { active = false; };
  }, [ownerId, demo, attempt]);
  useEffect(() => { if (demo && ready) try { localStorage.setItem(key, JSON.stringify({ advances, statements })); } catch { setError("Your browser could not save salary advance metadata. Changes remain available for this visit."); } }, [advances, statements, demo, ready]);

  const captureStatements = useCallback((bills: SalaryBill[]) => {
    if (!demo || !readyRef.current) return;
    const known = new Set(statementsRef.current.map(row => row.expense_id));
    const fresh = bills.filter(bill => !known.has(bill.entry.id) && bill.entry.type === "expense" && bill.entry.category === "Payroll" && !bill.entry.deleted_at && employeesRef.current.some(employee => employee.id === bill.employeeId)).map(bill => { known.add(bill.entry.id); return salarySnapshot(bill.entry, bill.employeeId); });
    if (!fresh.length) return;
    const next = [...statementsRef.current, ...fresh]; statementsRef.current = next; setStatements(next);
  }, [demo]);
  async function mutate(action: () => Promise<void>) {
    if (readOnly) throw new Error("This workspace is read-only.");
    if (!readyRef.current) throw new Error("Complete the salary extras setup and wait for the records to load.");
    if (lock.current) throw new Error("Wait for the current salary change to finish.");
    lock.current = true; setBusy(true);
    try { await action(); }
    finally { lock.current = false; setBusy(false); }
  }
  async function refresh() { await onReload(); install(await fetchSalaryExtras(ownerId)); }
  async function grant(input: AdvanceInput, requestId: string) {
    const employee = employeesRef.current.find(row => row.id === input.employee_id); validateSalaryAdvance(input, employee);
    await mutate(async () => {
      if (!demo) { await grantAdvance(input, requestId); await refresh(); return; }
      const prior = advancesRef.current.find(row => row.id === requestId);
      if (prior) {
        const transaction = entriesRef.current.find(entry => entry.id === prior.transaction_id);
        if (prior.employee_id !== input.employee_id || prior.amount_paisa !== input.amount_paisa || prior.date !== input.date || prior.notes !== input.notes || transaction?.payment_method !== input.payment_method || (transaction?.account_id || null) !== (input.account_id || null)) throw new Error("This request was already used for a different salary advance.");
        return;
      }
      const transaction = normalizeEntry<Transaction>({ id: `salary-advance:${requestId}`, user_id: ownerId, type: "expense", amount_paisa: input.amount_paisa, category: "Payroll", description: `Salary advance — ${employee!.name}`.slice(0, 100), date: input.date, paid_date: input.date, expense_status: "paid", payment_method: input.payment_method, account_id: input.account_id || null, notes: input.notes, created_at: new Date().toISOString() });
      validateEntry(transaction);
      const row: SalaryAdvance = { id: requestId, user_id: ownerId, employee_id: input.employee_id, transaction_id: transaction.id, amount_paisa: input.amount_paisa, date: input.date, notes: input.notes, created_at: transaction.created_at };
      const nextEntries = [...entriesRef.current, transaction]; entriesRef.current = nextEntries; onDemoEntriesUpdater(nextEntries);
      const next = [...advancesRef.current, row]; advancesRef.current = next; setAdvances(next);
    });
  }
  async function apply(advanceId: string, billId: string, amount: number, date: string, requestId: string) {
    await mutate(async () => {
      const advance = advancesRef.current.find(row => row.id === advanceId);
      const bill = entriesRef.current.find(row => row.id === billId && !row.deleted_at);
      const snapshot = statementsRef.current.find(row => row.expense_id === billId);
      if (!advance || !bill || bill.type !== "expense" || snapshot?.employee_id !== advance.employee_id) throw new Error("Choose a salary bill for the same employee as this advance.");
      const prior = entriesRef.current.flatMap(entry => entry.payments || []).find(payment => payment.id === requestId);
      if (prior) { if (prior.advance_id === advanceId && prior.expense_id === billId && prior.amount_paisa === amount && prior.date === date) return; throw new Error("This request belongs to a different advance application."); }
      if (!Number.isSafeInteger(amount) || amount <= 0 || amount > advanceUnused(advance, entriesRef.current) || amount > expenseRemaining(bill)) throw new Error("The credit must fit both the unused advance and the remaining salary bill.");
      if (!validDate(date) || date > today() || date < advance.date) throw new Error("Use the actual application date, today or earlier and on or after the advance.");
      const cashTransaction = entriesRef.current.find(entry => entry.id === advance.transaction_id && !entry.deleted_at);
      if (!cashTransaction) throw new Error("Restore the original salary advance transaction before applying it.");
      if (!demo) { await applyAdvance(advanceId, billId, amount, date, requestId); await refresh(); return; }
      const payment: ExpensePayment = { id: requestId, user_id: ownerId, expense_id: billId, amount_paisa: amount, date, payment_method: "Cash", account_id: null, advance_id: advanceId, notes: "Applied from salary advance", created_at: new Date().toISOString() };
      const updated = normalizeEntry({ ...bill, payment_tracking: true, payments: [...(bill.payments || []), payment] }); validateEntry(updated);
      const nextEntries = entriesRef.current.map(entry => entry.id === billId ? updated : entry); entriesRef.current = nextEntries; onDemoEntriesUpdater(nextEntries);
    });
  }
  function clearDemo() { if (!demo || lock.current) return; install({ advances: [], statements: [] }); setReady(true); setError(""); try { localStorage.removeItem(key); } catch { setError("Salary extras were cleared for this visit, but browser storage could not be changed."); } }
  return { advances, statements, ready, error, busy, grant, apply, clearDemo, captureStatements, retry: () => setAttempt(value => value + 1) };
}
