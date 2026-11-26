import { validDate, today, isExpectedExpense, type ExpensePayment, type Transaction } from "./ledger";
import type { UdharLoan, UdharPayment } from "./udhar";

export const accountKinds = ["cash", "bank", "easypaisa", "jazzcash"] as const;
export type Account = { id: string; user_id?: string; name: string; kind: typeof accountKinds[number]; opening_balance_paisa: number; opening_date: string; archived: boolean; created_at: string };
export type AccountInput = Omit<Account, "id" | "user_id" | "created_at">;
export type AccountTransfer = { id: string; user_id?: string; from_account_id: string; to_account_id: string; amount_paisa: number; date: string; notes: string; request_id: string; created_at: string };
export type TransferInput = Pick<AccountTransfer, "from_account_id" | "to_account_id" | "amount_paisa" | "date" | "notes">;
export type AccountRef = { account_id?: string | null };
export type AccountTransaction = Transaction & AccountRef & { payments?: (ExpensePayment & AccountRef)[] };
export type AccountLoan = UdharLoan & AccountRef;
export type AccountLoanPayment = UdharPayment & AccountRef;
export type CashMovement = { id: string; source_id: string; account_id: string | null; date: string; signed_paisa: number; kind: "income" | "expense" | "udhar" | "transfer"; description: string };
export const UNASSIGNED_ACCOUNT = "__unassigned__";
const maxPaisa = 99_999_999_999;

export function validateAccount(input: AccountInput, asOf = today()) {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 60) throw new Error("Enter an account name with 1–60 characters.");
  if (!accountKinds.includes(input.kind)) throw new Error("Choose Cash, Bank, Easypaisa or JazzCash.");
  if (!Number.isSafeInteger(input.opening_balance_paisa) || Math.abs(input.opening_balance_paisa) > maxPaisa) throw new Error("Enter a valid starting balance, including zero or a negative overdraft.");
  if (!validDate(input.opening_date) || input.opening_date > asOf) throw new Error("The starting balance date must be today or earlier.");
  if (typeof input.archived !== "boolean") throw new Error("Choose a valid account status.");
}
export function validateTransfer(input: TransferInput, accounts: Account[], asOf = today()) {
  if (!Number.isSafeInteger(input.amount_paisa) || input.amount_paisa <= 0 || input.amount_paisa > maxPaisa) throw new Error("Enter a positive transfer amount up to Rs 999,999,999.99.");
  if (!validDate(input.date) || input.date > asOf) throw new Error("Record a transfer on its actual date, today or earlier.");
  if (typeof input.notes !== "string" || input.notes.length > 500) throw new Error("Transfer notes must be 500 characters or fewer.");
  const from = accounts.find(account => account.id === input.from_account_id);
  const to = accounts.find(account => account.id === input.to_account_id);
  if (!from || !to || from.id === to.id || from.archived || to.archived) throw new Error("Choose two different active accounts in this workspace.");
  if (from.user_id && to.user_id && from.user_id !== to.user_id) throw new Error("Both accounts must belong to the same owner.");
  if (input.date < from.opening_date || input.date < to.opening_date) throw new Error("The transfer date cannot be before either account’s starting balance date.");
}
export function sameTransfer(transfer: AccountTransfer, input: TransferInput) {
  return transfer.from_account_id === input.from_account_id && transfer.to_account_id === input.to_account_id && transfer.amount_paisa === input.amount_paisa && transfer.date === input.date && transfer.notes === input.notes.trim();
}
/** Explicit assignments only. Installments use the payment account, never the bill's method/account. */
export function accountCashMovements(entries: AccountTransaction[], loans: AccountLoan[] = [], payments: AccountLoanPayment[] = [], transfers: AccountTransfer[] = []): CashMovement[] {
  const output: CashMovement[] = [];
  const seen = new Set<string>();
  function add(movement: CashMovement) { if (!seen.has(movement.id)) { seen.add(movement.id); output.push(movement); } }
  for (const entry of entries) {
    if (entry.deleted_at) continue;
    if (entry.type === "income") add({ id: `income:${entry.id}`, source_id: entry.id, account_id: entry.account_id || null, date: entry.date, signed_paisa: entry.amount_paisa, kind: "income", description: entry.description });
    else if (entry.payment_tracking) for (const payment of entry.payments || []) {
      if (payment.advance_id) continue; // The original paid Payroll advance already records the cash movement.
      add({ id: `expense-payment:${payment.id}`, source_id: entry.id, account_id: payment.account_id || null, date: payment.date, signed_paisa: -payment.amount_paisa, kind: "expense", description: entry.description });
    }
    else if (!isExpectedExpense(entry)) add({ id: `expense:${entry.id}`, source_id: entry.id, account_id: entry.account_id || null, date: entry.paid_date || entry.date, signed_paisa: -entry.amount_paisa, kind: "expense", description: entry.description });
  }
  const byLoan = new Map(loans.filter(loan => !loan.deleted_at).map(loan => [loan.id, loan]));
  for (const loan of loans.filter(loan => !loan.deleted_at)) add({ id: `loan:${loan.id}`, source_id: loan.id, account_id: loan.account_id || null, date: loan.date, signed_paisa: loan.direction === "taken" ? loan.amount_paisa : -loan.amount_paisa, kind: "udhar", description: `${loan.direction === "taken" ? "Udhar taken from" : "Udhar given to"} ${loan.person}` });
  for (const payment of payments) {
    if (payment.deleted_at) continue;
    const loan = byLoan.get(payment.loan_id);
    if (loan) add({ id: `loan-payment:${payment.id}`, source_id: loan.id, account_id: payment.account_id || null, date: payment.date, signed_paisa: loan.direction === "given" ? payment.amount_paisa : -payment.amount_paisa, kind: "udhar", description: `${loan.direction === "given" ? "Recovered from" : "Repaid to"} ${loan.person}` });
  }
  for (const transfer of transfers) {
    add({ id: `transfer:${transfer.id}:out`, source_id: transfer.id, account_id: transfer.from_account_id, date: transfer.date, signed_paisa: -transfer.amount_paisa, kind: "transfer", description: transfer.notes || "Account transfer" });
    add({ id: `transfer:${transfer.id}:in`, source_id: transfer.id, account_id: transfer.to_account_id, date: transfer.date, signed_paisa: transfer.amount_paisa, kind: "transfer", description: transfer.notes || "Account transfer" });
  }
  return output.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
export function accountBalances(accounts: Account[], movements: CashMovement[], asOf = today()) {
  const balances = new Map(accounts.map(account => [account.id, account.opening_date <= asOf ? account.opening_balance_paisa : 0]));
  balances.set(UNASSIGNED_ACCOUNT, 0);
  const byId = new Map(accounts.map(account => [account.id, account]));
  for (const movement of movements) {
    if (movement.date > asOf) continue;
    const account = movement.account_id ? byId.get(movement.account_id) : undefined;
    // Starting balances are snapshots at the beginning of opening_date; earlier assigned history is excluded.
    if (account && movement.date < account.opening_date) continue;
    const key = account?.id || UNASSIGNED_ACCOUNT;
    balances.set(key, (balances.get(key) || 0) + movement.signed_paisa);
  }
  return balances;
}
export function totalRecordedCash(accounts: Account[], movements: CashMovement[], asOf = today()) {
  return [...accountBalances(accounts, movements, asOf).values()].reduce((sum, amount) => sum + amount, 0);
}
export function accountPeriodSummary(accounts: Account[], movements: CashMovement[], start: string, end: string) {
  if (!validDate(start) || !validDate(end) || end < start) throw new Error("Choose a valid account reporting period.");
  const opening = accounts.filter(account => account.opening_date < start).reduce((sum, account) => sum + account.opening_balance_paisa, 0);
  const startingAdjustments = accounts.filter(account => account.opening_date >= start && account.opening_date <= end).reduce((sum, account) => sum + account.opening_balance_paisa, 0);
  const byId = new Map(accounts.map(account => [account.id, account]));
  const eligible = movements.filter(movement => { const account = movement.account_id ? byId.get(movement.account_id) : undefined; return !account || movement.date >= account.opening_date; });
  const before = eligible.filter(movement => movement.date < start).reduce((sum, movement) => sum + movement.signed_paisa, 0);
  const inPeriod = eligible.filter(movement => movement.date >= start && movement.date <= end);
  const movementNet = inPeriod.reduce((sum, movement) => sum + movement.signed_paisa, 0);
  return { opening: opening + before, startingAdjustments, movementNet, closing: opening + before + startingAdjustments + movementNet };
}
