import test from "node:test";
import assert from "node:assert/strict";
import { createMonthlyPdf } from "../lib/pdf";
import type { Transaction } from "../lib/ledger";

const row = (id: string, type: "income" | "expense", amount: number, date: string, extra: Partial<Transaction> = {}): Transaction => ({ id, type, amount_paisa: amount * 100, date, description: id, category: type === "income" ? "Salary" : "Rent", payment_method: "Cash", notes: "", created_at: `${date}T12:00:00Z`, ...extra });
function pages(doc: ReturnType<typeof createMonthlyPdf>) {
  return (doc.internal as unknown as { pages: string[][] }).pages.slice(1).map(page => page.join("\n"));
}

test("PDF keeps expected bills separate from cash movements and paid spending", () => {
  const rows = [row("Salary received", "income", 10000, "2026-11-01"), row("Paid November expense", "expense", 1000, "2026-11-02"), row("Planned rent only", "expense", 5000, "2026-11-20", { expense_status: "expected", paid_date: null })];
  const doc = createMonthlyPdf(rows, "2026-11", "test@example.com", false);
  const content = pages(doc);
  const cash = content.find(page => page.includes("Transaction details"));
  const expected = content.find(page => page.includes("Expected expenses - unpaid at month end"));
  assert.ok(cash && expected);
  assert.match(cash, /Paid November expense/);
  assert.doesNotMatch(cash, /Planned rent only/);
  assert.match(expected, /Planned rent only/);
  assert.match(content[0], /Rs 9,000.00/);
  assert.match(content[0], /Rs 1,000.00/);
});

test("a November bill paid in December is counted once in December and pending in November", () => {
  const rows = [row("Salary received", "income", 10000, "2026-11-01"), row("Bill paid in December", "expense", 5000, "2026-11-20", { expense_status: "paid", paid_date: "2026-12-03" })];
  const november = pages(createMonthlyPdf(rows, "2026-11", "test@example.com", false));
  assert.match(november[0], /Rs 10,000.00/);
  assert.doesNotMatch(november.find(page => page.includes("Transaction details"))!, /Bill paid in December/);
  assert.match(november.find(page => page.includes("Expected expenses - unpaid at month end"))!, /Bill paid in December/);
  const december = pages(createMonthlyPdf(rows, "2026-12", "test@example.com", false));
  assert.match(december.find(page => page.includes("Transaction details"))!, /Bill paid in December/);
  assert.match(december.find(page => page.includes("Transaction details"))!, /3 Dec 2026/);
  assert.equal(december.filter(page => page.includes("Expected expenses - unpaid at month end")).length, 0);
  assert.match(december[0], /Rs 5,000.00/);
});
