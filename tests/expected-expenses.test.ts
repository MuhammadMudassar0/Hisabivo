import test from "node:test";
import assert from "node:assert/strict";
import { categoryTotals, isCashEntry, isExpectedExpense, monthSummary, normalizeEntry, pendingExpenses, transactionDate, validateEntry, type Transaction } from "../lib/ledger";
import { cashSummary } from "../lib/udhar";

const expense: Transaction = { id: "bill", type: "expense", amount_paisa: 500000, category: "Rent", description: "November rent", date: "2026-11-05", payment_method: "Cash", notes: "", created_at: "2026-11-01T00:00:00Z" };
test("legacy expenses remain paid with their original date", () => {
  validateEntry(expense);
  assert.equal(isExpectedExpense(expense), false); assert.equal(isCashEntry(expense), true);
  assert.equal(transactionDate(expense), "2026-11-05");
  assert.equal(monthSummary([expense], "2026-11").expense, 500000);
  assert.equal(normalizeEntry(expense).paid_date, expense.date);
});
test("expected expenses appear in planning and never reduce actual cash or paid category totals", () => {
  const expected = normalizeEntry({ ...expense, expense_status: "expected" as const });
  const summary = monthSummary([expected], "2026-11");
  assert.equal(summary.expected, 500000); assert.equal(summary.expectedRows.length, 1);
  assert.equal(summary.expense, 0); assert.equal(summary.income, 0); assert.equal(summary.closing, 0);
  assert.equal(cashSummary([expected], [], [], "2026-12").opening, 0);
  assert.deepEqual(categoryTotals([expected]), []);
  assert.equal(pendingExpenses([expected], "2026-12").length, 1);
});
test("a November bill paid in December counts once in December while November remains historically pending", () => {
  const paid = normalizeEntry({ ...expense, expense_status: "paid" as const, paid_date: "2026-12-03" });
  const november = monthSummary([paid], "2026-11"), december = monthSummary([paid], "2026-12");
  assert.equal(november.expense, 0); assert.equal(november.closing, 0);
  assert.equal(pendingExpenses([paid], "2026-11").length, 1);
  assert.equal(december.expense, 500000); assert.equal(december.closing, -500000);
  assert.equal(pendingExpenses([paid], "2026-12").length, 0);
  assert.equal(monthSummary([paid], "2027-01").opening, -500000);
  assert.equal(november.expense + december.expense, expense.amount_paisa);
  assert.equal(transactionDate(paid), "2026-12-03");
});
test("expected backlog excludes future bills and includes unpaid older bills", () => {
  const rows = [{ ...expense, expense_status: "expected" as const }, { ...expense, id: "old", date: "2026-10-20", expense_status: "expected" as const }, { ...expense, id: "future", date: "2026-12-01", expense_status: "expected" as const }];
  assert.deepEqual(pendingExpenses(rows, "2026-11").map(e => e.id), ["old", "bill"]);
  assert.equal(monthSummary(rows, "2026-11").expected, expense.amount_paisa);
});
test("validation rejects inconsistent payment metadata and normalization clears stale toggles", () => {
  assert.throws(() => validateEntry({ ...expense, type: "income", expense_status: "expected" }));
  assert.throws(() => validateEntry({ ...expense, type: "income", paid_date: "2026-11-05" }));
  assert.throws(() => validateEntry({ ...expense, expense_status: "expected", paid_date: "2026-11-05" }));
  assert.throws(() => validateEntry({ ...expense, expense_status: "paid", paid_date: "2026-02-30" }));
  assert.throws(() => normalizeEntry({ ...expense, expense_status: "unknown" as "paid" }));
  assert.equal(normalizeEntry({ ...expense, expense_status: "expected", paid_date: "2026-11-05" }).paid_date, null);
  assert.throws(() => normalizeEntry({ ...expense, type: "income", expense_status: "expected" }));
  const income = normalizeEntry({ ...expense, type: "income", expense_status: "paid", paid_date: "2026-11-05" });
  validateEntry(income); assert.equal(income.expense_status, "paid"); assert.equal(income.paid_date, null);
  // An early payment belongs to its actual payment month, regardless of planned date.
  const early = { ...expense, expense_status: "paid" as const, paid_date: "2026-10-31" };
  validateEntry(early); assert.equal(monthSummary([early], "2026-10").expense, expense.amount_paisa);
});

test("storage preserves legacy income/paid writes, refuses to drop expected metadata, and marks a bill paid only once", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://expected-tests.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "test-publishable-key";
  const oldFetch = globalThis.fetch;
  let modern = false;
  let row = { ...expense, expense_status: "expected" as "expected" | "paid", paid_date: null as string | null };
  const requests: { method: string; body: Record<string, unknown> | null; url: URL }[] = [];
  globalThis.fetch = async (url, init) => {
    const target = new URL(String(url));
    const method = init?.method || "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    requests.push({ method, body, url: target });
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    if (!modern && body && ("expense_status" in body || "paid_date" in body)) return json({ code: "PGRST204", message: "Could not find expense_status in the schema cache" }, 400);
    if (!modern && target.searchParams.get("select")?.includes("expense_status")) return json({ code: "42703", message: "column ledger_transactions.expense_status does not exist" }, 400);
    if (method === "PATCH" && target.searchParams.get("expense_status") === "eq.expected") {
      assert.equal(target.searchParams.get("user_id"), "eq.owner"); assert.equal(target.searchParams.get("type"), "eq.expense");
      if (row.expense_status !== "expected") return json({ code: "PGRST116", message: "No rows" }, 406);
      row = { ...row, ...body }; return json(row);
    }
    return json({ ...expense, ...body });
  };
  try {
    const { markExpensePaid, saveEntry } = await import("../lib/supabase");
    await saveEntry("owner", { ...expense, type: "income" });
    assert.equal("expense_status" in requests.at(-1)!.body!, false);
    assert.equal("paid_date" in requests.at(-1)!.body!, false);
    await saveEntry("owner", expense);
    assert.equal("expense_status" in requests.at(-1)!.body!, false);
    const before = requests.length;
    await assert.rejects(() => saveEntry("owner", { ...expense, expense_status: "expected" }), /setup-expected-expenses.sql/);
    assert.equal(requests.length, before + 1, "Expected bills must not retry as paid legacy records");
    await assert.rejects(() => saveEntry("owner", { ...expense, expense_status: "paid", paid_date: "2026-12-03" }), /setup-expected-expenses.sql/);
    await assert.rejects(() => markExpensePaid("owner", "bill", "2026-12-03"), /setup-expected-expenses.sql/);
    modern = true;
    const saved = await markExpensePaid("owner", "bill", "2026-12-03");
    assert.equal(saved.id, "bill"); assert.equal(saved.paid_date, "2026-12-03");
    await assert.rejects(() => markExpensePaid("owner", "bill", "2026-12-04"), /already have changed/);
    assert.equal(row.paid_date, "2026-12-03");
  } finally { globalThis.fetch = oldFetch; }
});
