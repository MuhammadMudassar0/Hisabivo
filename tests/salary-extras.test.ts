import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { advanceUnused, salarySnapshot } from "../lib/salary-extras";
import { expenseCashRows, expensePaid, today, type Transaction } from "../lib/ledger";
import type { Employee } from "../lib/salaries";
const require = createRequire(import.meta.url);
const bill: Transaction = { id: "original-bill", type: "expense", category: "Payroll", description: "Salary — علی", amount_paisa: 5500000, date: today(), payment_method: "Cash", notes: "Base PKR 50000.00 | Allowances PKR 6000.00 | Manual deductions PKR 1000.00\nOriginal note", created_at: new Date().toISOString(), expense_status: "expected", paid_date: null };
const employee: Employee = { id: "employee", name: "علی", role: "Support", base_paisa: 9000000, allowance_paisa: 200000, deduction_paisa: 0, joining_date: "2020-01-01", notes: "", schedule_id: "schedule", archived_at: null, created_at: new Date().toISOString() };

test("salary statements parse only exact original figures with matching arithmetic", () => {
  const snapshot = salarySnapshot(bill, employee.id);
  assert.equal(snapshot.base_paisa, 5000000);
  assert.equal(snapshot.allowance_paisa, 600000);
  assert.equal(snapshot.deduction_paisa, 100000);
  assert.equal(snapshot.name_snapshot, "علی");
  assert.notEqual(snapshot.base_paisa, employee.base_paisa);
  assert.equal(salarySnapshot({ ...bill, amount_paisa: 5600000 }, employee.id).base_paisa, null);
  assert.equal(salarySnapshot({ ...bill, notes: "Current base is 90000" }, employee.id).base_paisa, null);
  assert.equal(salarySnapshot({ ...bill, notes: "Untrusted prefix " + bill.notes }, employee.id).base_paisa, null);
});

test("demo advances count cash once, apply credit once, and preserve original period snapshots", async () => {
  const { JSDOM } = require("jsdom");
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  for (const key of ["window", "document", "navigator", "HTMLElement", "Node", "localStorage"]) Object.defineProperty(globalThis, key, { configurable: true, value: key === "window" ? dom.window : dom.window[key] });
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  const React = require("react");
  const { renderHook, act, waitFor, cleanup } = require("@testing-library/react");
  const { useSalaryExtras } = require("../components/use-salary-extras");
  const mounted = renderHook(() => {
    const [entries, setEntries] = React.useState([bill]);
    const extras = useSalaryExtras("demo", true, [employee], entries, setEntries, async () => {});
    return { entries, extras };
  });
  try {
    await waitFor(() => assert.equal(mounted.result.current.extras.ready, true));
    act(() => mounted.result.current.extras.captureStatements([{ employeeId: employee.id, entry: bill }]));
    const input = { employee_id: employee.id, amount_paisa: 1000000, date: today(), payment_method: "Cash", account_id: null, notes: "Early salary payment" };
    const grantId = "a1111111-1111-4111-a111-111111111111";
    await act(async () => { await mounted.result.current.extras.grant(input, grantId); });
    assert.equal(mounted.result.current.entries.length, 2);
    assert.equal(expenseCashRows(mounted.result.current.entries).reduce((sum, row) => sum + row.amount_paisa, 0), 1000000);
    await act(async () => { await mounted.result.current.extras.grant(input, grantId); });
    assert.equal(mounted.result.current.entries.length, 2);
    const paymentId = "b2222222-2222-4222-b222-222222222222";
    await act(async () => { await mounted.result.current.extras.apply(grantId, bill.id, 500000, today(), paymentId); });
    const updated = mounted.result.current.entries.find((entry: Transaction) => entry.id === bill.id);
    assert.equal(expensePaid(updated), 500000);
    assert.equal(updated.payments.length, 1);
    assert.equal(updated.payments[0].advance_id, grantId);
    assert.equal(expenseCashRows(mounted.result.current.entries).reduce((sum, row) => sum + row.amount_paisa, 0), 1000000);
    assert.equal(advanceUnused(mounted.result.current.extras.advances[0], mounted.result.current.entries), 500000);
    await act(async () => { await mounted.result.current.extras.apply(grantId, bill.id, 500000, today(), paymentId); });
    assert.equal(mounted.result.current.entries.find((entry: Transaction) => entry.id === bill.id).payments.length, 1);
    await act(async () => { await assert.rejects(() => mounted.result.current.extras.apply(grantId, bill.id, 600000, today(), "c3333333-3333-4333-a333-333333333333"), /unused advance/); });
    assert.equal(mounted.result.current.extras.statements[0].base_paisa, 5000000);
    act(() => mounted.result.current.extras.captureStatements([{ employeeId: employee.id, entry: { ...bill, notes: "Base PKR 90000.00 | Allowances PKR 0.00 | Manual deductions PKR 0.00", amount_paisa: 9000000 } }]));
    assert.equal(mounted.result.current.extras.statements[0].base_paisa, 5000000);
    await waitFor(() => assert.equal(JSON.parse(dom.window.localStorage.getItem("hisabivo.demo.salary-extras.v1")).statements[0].base_paisa, 5000000));
  } finally { cleanup(); dom.window.close(); }
});
