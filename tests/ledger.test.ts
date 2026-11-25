import test from "node:test";
import assert from "node:assert/strict";
import { categoryTotals, monthSummary, parseAmount, validDate, validateEntry, type Transaction } from "../lib/ledger";
import { createMonthlyPdf } from "../lib/pdf";

const entry = (id: string, type: "income" | "expense", amount: number, date: string, category = "Other"): Transaction => ({ id, type, amount_paisa: amount, date, category, description: "Test record", payment_method: "Cash", notes: "", created_at: `${date}T12:00:00Z` });

test("PKR amounts are parsed as exact integer paisa", () => {
  assert.equal(parseAmount("0.29"), 29);
  assert.equal(parseAmount("100.1"), 10010);
  assert.equal(parseAmount("999999999.99"), 99999999999);
  for (const invalid of ["0", "-1", "2.123", "NaN", "1e3", "1000000000", "1,00", ""]) assert.throws(() => parseAmount(invalid));
});
test("the reported income amount and common Pakistan input formats stay exact", () => {
  for (const value of ["1326500", "1326500.00", "1,326,500", "13,26,500", "۱۳۲۶۵۰۰", "١٣٢٦٥٠٠", "\u200f۱۳۲۶۵۰۰\u200e", "۱٬۳۲۶٬۵۰۰٫۰۰"]) {
    assert.equal(parseAmount(value), 132650000, value);
  }
  assert.equal(parseAmount("1,326,500.29"), 132650029);
  assert.equal(parseAmount("99,99,99,999.99"), 99999999999);
  for (const invalid of ["1,32", "13,265,00", "1,326,500.001", "1.326.500", "1,000,000,000", "1,326,500usd", "1 326500"]) assert.throws(() => parseAmount(invalid), value => value instanceof Error);
});
test("monthly income, expenses, opening and closing balances stay separate", () => {
  const rows = [entry("a", "income", 10000, "2026-10-31"), entry("b", "expense", 1500, "2026-10-31"), entry("c", "income", 20000, "2026-11-01"), entry("d", "expense", 1234, "2026-11-30"), entry("e", "income", 99900, "2026-12-01")];
  const summary = monthSummary(rows, "2026-11");
  assert.deepEqual([summary.income, summary.expense, summary.net, summary.opening, summary.closing], [20000, 1234, 18766, 8500, 27266]);
  assert.equal(summary.rows.length, 2);
  assert.equal(monthSummary([], "2026-11").closing, 0);
});
test("category totals cannot mix income and expenses", () => {
  const rows = [entry("a", "expense", 200, "2026-11-01", "Fuel"), entry("b", "expense", 350, "2026-11-02", "Fuel"), entry("c", "income", 50000, "2026-11-02", "Salary")];
  assert.deepEqual(categoryTotals(rows), [{ name: "Fuel", amount: 550 }]);
});
test("invalid calendar dates and fractional paisa are rejected", () => {
  assert.equal(validDate("2026-02-30"), false);
  assert.equal(validDate("2024-02-29"), true);
  assert.equal(validDate("1899-12-31"), false);
  assert.throws(() => validateEntry({ ...entry("a", "expense", 1.5, "2026-11-01") }));
});
test("multiple named income sources sum to monthly received without expenses or other months", () => {
  const rows = [entry("a", "income", 10000000, "2026-11-01", "Acme salary"), entry("b", "income", 2500000, "2026-11-05", "Freelance"), entry("c", "income", 1500000, "2026-11-20", "Freelance"), entry("d", "income", 3000000, "2026-11-03", "Rental income"), entry("e", "expense", 700000, "2026-11-02", "Freelance"), entry("f", "income", 9000000, "2026-12-01", "Acme salary")];
  const summary = monthSummary(rows, "2026-11");
  const sources = categoryTotals(summary.rows, "income");
  assert.deepEqual(sources, [{ name: "Acme salary", amount: 10000000 }, { name: "Freelance", amount: 4000000 }, { name: "Rental income", amount: 3000000 }]);
  assert.equal(sources.reduce((sum, source) => sum + source.amount, 0), summary.income);
  assert.equal(summary.income, 17000000);
});
test("monthly PDF includes all transactions over multiple pages", () => {
  const rows = Array.from({ length: 90 }, (_, i) => ({ ...entry(String(i), "expense", 12500, "2026-11-15", "Fuel"), description: `Unique record ${i}`, notes: "Filled at local petrol station" }));
  const doc = createMonthlyPdf(rows, "2026-11", "test@example.com", false);
  assert.ok(doc.getNumberOfPages() > 2);
  const pdf = doc.output();
  assert.match(pdf, /Unique record 0/);
  assert.match(pdf, /Unique record 89/);
  assert.match(pdf, /Rs 11,250.00/);
  assert.ok(!pdf.includes("DEMO REPORT"));
  assert.match(pdf, /Hisabivo/);
});

test("months without transactions retain their carried balance", () => {
  const rows = [entry("a", "income", 9900, "2026-01-01"), entry("b", "expense", 10100, "2026-02-01")];
  const summary = monthSummary(rows, "2026-03");
  assert.deepEqual([summary.income, summary.expense, summary.net, summary.opening, summary.closing], [0, 0, 0, -200, -200]);
  assert.equal(summary.rows.length, 0);
});

test("paisa remain exact across many income and expense records", () => {
  const rows = Array.from({ length: 1000 }, (_, i) => entry(`income-${i}`, "income", parseAmount("0.29"), "2026-11-01"));
  rows.push(...Array.from({ length: 1000 }, (_, i) => entry(`expense-${i}`, "expense", parseAmount("0.19"), "2026-11-02")));
  const summary = monthSummary(rows, "2026-11");
  assert.deepEqual([summary.income, summary.expense, summary.closing], [29000, 19000, 10000]);
});

test("monthly PDF excludes other months and marks demo exports", () => {
  const rows = [entry("a", "income", 120000, "2026-10-01"), { ...entry("b", "expense", 45000, "2026-11-01"), description: "Selected month transaction" }, { ...entry("c", "expense", 80000, "2026-12-01"), description: "Excluded future transaction" }];
  const pdf = createMonthlyPdf(rows, "2026-11", "demo", true).output();
  assert.match(pdf, /Selected month transaction/);
  assert.doesNotMatch(pdf, /Excluded future transaction/);
  assert.match(pdf, /DEMO REPORT/);
  assert.match(pdf, /Rs 1,200.00/);
  assert.match(pdf, /Rs 750.00/);
});

test("empty monthly PDF still includes zero totals and statement details", () => {
  const doc = createMonthlyPdf([], "2026-11", "test@example.com", false);
  const pdf = doc.output();
  assert.equal(doc.getNumberOfPages(), 2);
  assert.match(pdf, /No transactions recorded for this month/);
  assert.match(pdf, /Rs 0.00/);
  assert.match(pdf, /November 2026/);
});
