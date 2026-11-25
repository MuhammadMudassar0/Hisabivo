import test from "node:test";
import assert from "node:assert/strict";
import { cashSummary, loanPaid, loanRemaining, loanStatus, udharSummary, validateLoan, validatePayment, type UdharInput, type UdharLoan, type UdharPayment } from "../lib/udhar";
import type { Transaction } from "../lib/ledger";

const loan = (id: string, direction: "given" | "taken", amount_paisa: number, date = "2026-11-01"): UdharLoan => ({ id, direction, amount_paisa, date, person: "Ali", due_date: "2026-11-30", payment_method: "Cash", notes: "", created_at: `${date}T12:00:00Z` });
const payment = (id: string, loan_id: string, amount_paisa: number, date = "2026-11-10"): UdharPayment => ({ id, loan_id, amount_paisa, date, payment_method: "Cash", notes: "", created_at: `${date}T12:00:00Z` });
const entry = (id: string, type: "income" | "expense", amount_paisa: number, date: string): Transaction => ({ id, type, amount_paisa, date, category: "Other", description: "Test", payment_method: "Cash", notes: "", created_at: `${date}T12:00:00Z` });

test("given and taken outstanding balances stay separate across partial and complete repayments", () => {
  const loans = [loan("given", "given", 100000), loan("taken", "taken", 50000)];
  const payments = [payment("a", "given", 25000), payment("b", "given", 5000), payment("c", "taken", 50000)];
  assert.equal(loanPaid("given", payments), 30000);
  assert.equal(loanRemaining(loans[0], payments), 70000);
  assert.deepEqual(udharSummary(loans, payments), { toReceive: 70000, toPay: 0 });
  assert.equal(loanStatus(loans[0], payments, "2026-11-30"), "open");
  assert.equal(loanStatus(loans[0], payments, "2026-12-01"), "overdue");
  assert.equal(loanStatus(loans[1], payments, "2026-12-01"), "settled");
});
test("loan inputs reject bad dates, invalid principal and due dates before the loan", () => {
  validateLoan(loan("a", "given", 1));
  const bad: Partial<UdharInput>[] = [{ amount_paisa: 0 }, { amount_paisa: -1 }, { amount_paisa: 1.5 }, { amount_paisa: 100000000000 }, { date: "2026-02-30" }, { due_date: "2026-10-31" }, { person: " " }, { person: "a".repeat(101) }, { notes: "a".repeat(501) }, { direction: "income" as "given" }];
  for (const invalid of bad) assert.throws(() => validateLoan({ ...loan("a", "given", 10000), ...invalid }));
  validateLoan({ ...loan("a", "taken", 10000), due_date: null });
});
test("repayments cannot precede the loan, exceed its remaining principal, or target another loan", () => {
  const principal = loan("a", "given", 10000);
  const paid = [payment("p", "a", 9999), payment("other", "b", 999999)];
  validatePayment(payment("new", "a", 1), principal, paid);
  assert.throws(() => validatePayment(payment("new", "a", 2), principal, paid), /more than/);
  assert.throws(() => validatePayment(payment("new", "a", 1, "2026-10-31"), principal, paid), /before/);
  assert.throws(() => validatePayment(payment("new", "b", 1), principal, paid), /correct loan/);
  assert.throws(() => validatePayment(payment("new", "a", 0), principal, paid));
});
test("loan cash movements adjust balances without becoming income or expenses", () => {
  const loans = [loan("given-before", "given", 100000, "2026-10-01"), loan("taken-before", "taken", 200000, "2026-10-02"), loan("given-now", "given", 30000), loan("taken-now", "taken", 40000), { ...loan("future", "taken", 999999, "2026-12-01"), due_date: null }];
  const payments = [payment("old-in", "given-before", 10000, "2026-10-10"), payment("old-out", "taken-before", 20000, "2026-10-11"), payment("in", "given-before", 25000), payment("out", "taken-before", 15000), payment("future", "taken-now", 5000, "2026-12-02")];
  const entries = [entry("salary-old", "income", 500000, "2026-10-01"), entry("expense-old", "expense", 100000, "2026-10-02"), entry("salary", "income", 100000, "2026-11-01"), entry("expense", "expense", 20000, "2026-11-02"), entry("future", "income", 999999, "2026-12-01")];
  const result = cashSummary(entries, loans, payments, "2026-11");
  assert.equal(result.income, 100000); assert.equal(result.expense, 20000); assert.equal(result.net, 80000);
  assert.equal(result.opening, 490000);
  assert.equal(result.loanIn, 65000); assert.equal(result.loanOut, 45000); assert.equal(result.loanNet, 20000);
  assert.equal(result.cashNet, 100000); assert.equal(result.closing, 590000); assert.equal(result.rows.length, 2);
});
test("deleting a repayment restores outstanding principal and removes its cash movement", () => {
  const principal = loan("a", "given", 10000);
  assert.equal(loanRemaining(principal, [payment("p", "a", 4000)]), 6000);
  assert.equal(loanRemaining(principal, []), 10000);
  assert.equal(cashSummary([], [principal], [], "2026-11").closing, -10000);
  assert.deepEqual(udharSummary([], []), { toReceive: 0, toPay: 0 });
});
