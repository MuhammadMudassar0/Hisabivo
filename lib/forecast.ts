import { expenseRemaining, validDate, type Transaction } from "./ledger";
import { addDays, scheduledDate, type Occurrence, type Schedule } from "./planning";
import { loanRemaining } from "./udhar";
import { accountCashMovements, totalRecordedCash, type Account, type AccountLoan, type AccountLoanPayment, type AccountTransaction, type AccountTransfer } from "./accounts";

export type ForecastHorizon = 7 | 30 | 90;
export type ForecastItem = { id: string; date: string; original_date: string; description: string; amount_paisa: number; direction: "pay" | "receive"; kind: "bill" | "udhar" | "recurring" | "receipt" };
export type ForecastDay = { date: string; due_paisa: number; possible_receipts_paisa: number; conservative_paisa: number; with_receipts_paisa: number };
export type ForecastInput = { accounts: Account[]; transfers: AccountTransfer[]; entries: AccountTransaction[]; loans: AccountLoan[]; payments: AccountLoanPayment[]; schedules?: Schedule[]; occurrences?: Occurrence[]; asOf: string; days: ForecastHorizon };

function upcomingDates(schedule: Schedule, after: string, until: string) {
  if (!schedule.active) return [];
  const from = schedule.start_date;
  const months = (Number(after.slice(0, 4)) - Number(from.slice(0, 4))) * 12 + Number(after.slice(5, 7)) - Number(from.slice(5, 7));
  const days = Math.floor((Date.parse(`${after}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86400000);
  let index = schedule.frequency === "once" ? 0 : schedule.frequency === "weekly" ? Math.max(0, Math.floor(days / 7) - 1) : schedule.frequency === "monthly" ? Math.max(0, months - 1) : Math.max(0, Math.floor(months / 12) - 1);
  const output: string[] = [];
  for (let count = 0; count < 400; count++, index++) {
    const date = scheduledDate(schedule, index);
    if (!date || date > until || schedule.end_date && date > schedule.end_date) break;
    if (date > after) output.push(date);
    if (schedule.frequency === "once") break;
  }
  return output;
}
/** Planning view only: expected receipts never enter conservative/current cash. */
export function buildCashForecast(input: ForecastInput) {
  if (!validDate(input.asOf) || ![7, 30, 90].includes(input.days)) throw new Error("Choose a valid start date and a 7, 30 or 90 day forecast.");
  const until = addDays(input.asOf, input.days);
  if (!validDate(until)) throw new Error("The forecast would exceed the supported calendar range.");
  const movements = accountCashMovements(input.entries, input.loans, input.payments, input.transfers);
  const currentPaisa = totalRecordedCash(input.accounts, movements, input.asOf);
  const items: ForecastItem[] = [];
  const seen = new Set<string>();
  const entryIds = new Set(input.entries.filter(entry => !entry.deleted_at).map(entry => entry.id));
  function add(item: Omit<ForecastItem, "original_date">) {
    if (item.amount_paisa <= 0 || item.date > until || seen.has(item.id)) return;
    seen.add(item.id); items.push({ ...item, original_date: item.date, date: item.date < input.asOf ? input.asOf : item.date });
  }
  for (const entry of input.entries) {
    if (entry.deleted_at) continue;
    if (entry.type === "expense") add({ id: `bill:${entry.id}`, date: entry.date, description: entry.description, amount_paisa: expenseRemaining(entry, input.asOf), direction: "pay", kind: "bill" });
    else if (entry.date > input.asOf) add({ id: `receipt:${entry.id}`, date: entry.date, description: entry.description, amount_paisa: entry.amount_paisa, direction: "receive", kind: "receipt" });
  }
  const paymentsAsOf = input.payments.filter(payment => !payment.deleted_at && payment.date <= input.asOf);
  let undatedLoans = 0;
  for (const loan of input.loans) {
    if (loan.deleted_at) continue;
    if (loan.date > input.asOf) continue;
    const amount = loanRemaining(loan, paymentsAsOf);
    if (!loan.due_date && amount > 0) { undatedLoans++; continue; }
    if (loan.due_date) add({ id: `udhar:${loan.id}`, date: loan.due_date, description: `${loan.direction === "given" ? "Udhar recovery from" : "Udhar repayment to"} ${loan.person}`, amount_paisa: amount, direction: loan.direction === "given" ? "receive" : "pay", kind: "udhar" });
  }
  const occurrences = input.occurrences || [];
  for (const occurrence of occurrences) {
    // Created/deleted or skipped instances are explicit decisions, never regenerated.
    if (occurrence.status !== "expected" || occurrence.transaction_id && entryIds.has(occurrence.transaction_id)) continue;
    add({ id: `occurrence:${occurrence.id}`, date: occurrence.scheduled_date, description: occurrence.description, amount_paisa: occurrence.amount_paisa, direction: occurrence.type === "income" ? "receive" : "pay", kind: "recurring" });
  }
  const occurrenceKeys = new Set(occurrences.map(occurrence => `${occurrence.schedule_id}:${occurrence.scheduled_date}`));
  for (const schedule of input.schedules || []) for (const date of upcomingDates(schedule, input.asOf, until)) {
    if (occurrenceKeys.has(`${schedule.id}:${date}`)) continue;
    add({ id: `schedule:${schedule.id}:${date}`, date, description: schedule.description, amount_paisa: schedule.amount_paisa, direction: schedule.type === "income" ? "receive" : "pay", kind: "recurring" });
  }
  items.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let conservative = currentPaisa, projected = currentPaisa, minPaisa = currentPaisa, firstShortfallDate: string | null = currentPaisa < 0 ? input.asOf : null;
  const days: ForecastDay[] = [];
  for (let offset = 0; offset <= input.days; offset++) {
    const date = addDays(input.asOf, offset), due = items.filter(item => item.date === date && item.direction === "pay").reduce((sum, item) => sum + item.amount_paisa, 0), receipts = items.filter(item => item.date === date && item.direction === "receive").reduce((sum, item) => sum + item.amount_paisa, 0);
    conservative -= due; projected += receipts - due; minPaisa = Math.min(minPaisa, conservative);
    if (!firstShortfallDate && conservative < 0) firstShortfallDate = date;
    days.push({ date, due_paisa: due, possible_receipts_paisa: receipts, conservative_paisa: conservative, with_receipts_paisa: projected });
  }
  return { asOf: input.asOf, until, days, items, currentPaisa, duePaisa: items.filter(item => item.direction === "pay").reduce((sum, item) => sum + item.amount_paisa, 0), possibleReceiptsPaisa: items.filter(item => item.direction === "receive").reduce((sum, item) => sum + item.amount_paisa, 0), endingPaisa: conservative, endingWithReceiptsPaisa: projected, minPaisa, firstShortfallDate, shortfallPaisa: Math.max(0, -minPaisa), undatedLoans };
}
