import test from "node:test";
import assert from "node:assert/strict";
import { createMonthlyPdf } from "../lib/pdf";
import type { Transaction } from "../lib/ledger";
import type { UdharLoan, UdharPayment } from "../lib/udhar";

test("monthly statement reconciles Udhar cash and shows outstanding as of month end", () => {
  const entries: Transaction[] = [
    { id: "salary", type: "income", amount_paisa: 200000, category: "Salary", description: "Monthly salary", date: "2026-11-01", payment_method: "Cash", notes: "", created_at: "2026-11-01T12:00:00Z" },
    { id: "food", type: "expense", amount_paisa: 20000, category: "Groceries", description: "Food", date: "2026-11-02", payment_method: "Cash", notes: "", created_at: "2026-11-02T12:00:00Z" },
  ];
  const loans: UdharLoan[] = [
    { id: "given", direction: "given", person: "Ali", amount_paisa: 100000, date: "2026-11-03", due_date: "2026-12-30", payment_method: "Cash", notes: "Lent for essentials", created_at: "2026-11-03T12:00:00Z" },
    { id: "taken", direction: "taken", person: "Sara", amount_paisa: 50000, date: "2026-11-04", due_date: null, payment_method: "Cash", notes: "", created_at: "2026-11-04T12:00:00Z" },
  ];
  const payments: UdharPayment[] = [
    { id: "received", loan_id: "given", amount_paisa: 30000, date: "2026-11-10", payment_method: "Cash", notes: "November repayment", created_at: "2026-11-10T12:00:00Z" },
    { id: "paid", loan_id: "taken", amount_paisa: 10000, date: "2026-11-11", payment_method: "Cash", notes: "", created_at: "2026-11-11T12:00:00Z" },
    { id: "future", loan_id: "given", amount_paisa: 60000, date: "2026-12-01", payment_method: "Cash", notes: "FUTURE REPAYMENT MUST NOT APPEAR", created_at: "2026-12-01T12:00:00Z" },
  ];
  const doc = createMonthlyPdf(entries, "2026-11", "test@example.com", false, { loans, payments });
  const pdf = doc.output();
  assert.match(pdf, /Cash movement details/);
  assert.match(pdf, /Ali - Udhar given/);
  assert.match(pdf, /Sara - Udhar taken/);
  assert.match(pdf, /November repayment/);
  assert.match(pdf, /Rs 1,500.00/); // Income 2000 - expenses 200 - lent 1000 + borrowed 500 + received 300 - repaid 100.
  assert.match(pdf, /To receive: Rs 700.00/);
  assert.match(pdf, /To repay: Rs 400.00/);
  assert.doesNotMatch(pdf, /FUTURE REPAYMENT MUST NOT APPEAR/);
  assert.ok(doc.getNumberOfPages() >= 3);
});
