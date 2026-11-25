import { monthSummary, paymentMethods, today, validDate, type PaymentMethod, type Transaction } from "./ledger";

export type UdharLoan = {
  id: string; user_id?: string; direction: "given" | "taken"; person: string; amount_paisa: number;
  date: string; due_date: string | null; payment_method: PaymentMethod; notes: string; created_at: string;
};
export type UdharPayment = {
  id: string; user_id?: string; loan_id: string; amount_paisa: number; date: string;
  payment_method: PaymentMethod; notes: string; created_at: string;
};
export type UdharInput = Omit<UdharLoan, "id" | "user_id" | "created_at">;
export type UdharPaymentInput = Omit<UdharPayment, "id" | "user_id" | "created_at">;
const maximumPaisa = 99_999_999_999;

function validateMovement(input: { amount_paisa: number; date: string; payment_method: PaymentMethod; notes: string }) {
  if (!Number.isSafeInteger(input.amount_paisa) || input.amount_paisa <= 0 || input.amount_paisa > maximumPaisa) throw new Error("Enter a positive amount up to Rs 999,999,999.99.");
  if (typeof input.date !== "string" || !validDate(input.date)) throw new Error("Choose a valid date from 1900 onward.");
  if (!paymentMethods.includes(input.payment_method)) throw new Error("Choose a payment method.");
  if (typeof input.notes !== "string" || input.notes.length > 500) throw new Error("Notes must be 500 characters or fewer.");
}
export function validateLoan(input: UdharInput) {
  validateMovement(input);
  if (!["given", "taken"].includes(input.direction)) throw new Error("Choose money given or money taken.");
  if (typeof input.person !== "string" || !input.person.trim() || input.person.length > 100) throw new Error("Enter a person or business name with 1–100 characters.");
  if (input.due_date !== null && (typeof input.due_date !== "string" || !validDate(input.due_date) || input.due_date < input.date)) throw new Error("The due date must be on or after the loan date.");
}
export function loanPaid(loanId: string, payments: UdharPayment[]) {
  return payments.filter(p => p.loan_id === loanId).reduce((sum, p) => sum + p.amount_paisa, 0);
}
export function loanRemaining(loan: UdharLoan, payments: UdharPayment[]) {
  return Math.max(0, loan.amount_paisa - loanPaid(loan.id, payments));
}
export function validatePayment(input: UdharPaymentInput, loan: UdharLoan, payments: UdharPayment[]) {
  validateMovement(input);
  if (!input.loan_id || input.loan_id !== loan.id) throw new Error("Choose the correct loan for this repayment.");
  if (input.date < loan.date) throw new Error("A repayment cannot be dated before the loan.");
  if (input.amount_paisa > loanRemaining(loan, payments)) throw new Error("This repayment is more than the remaining loan balance.");
}
export function loanStatus(loan: UdharLoan, payments: UdharPayment[], asOf = today()): "settled" | "overdue" | "open" {
  if (loanRemaining(loan, payments) === 0) return "settled";
  return loan.due_date && loan.due_date < asOf ? "overdue" : "open";
}
export function udharSummary(loans: UdharLoan[], payments: UdharPayment[]) {
  return loans.reduce((summary, loan) => {
    summary[loan.direction === "given" ? "toReceive" : "toPay"] += loanRemaining(loan, payments);
    return summary;
  }, { toReceive: 0, toPay: 0 });
}
export function cashSummary(entries: Transaction[], loans: UdharLoan[], payments: UdharPayment[], month: string) {
  const summary = monthSummary(entries, month);
  const byId = new Map(loans.map(loan => [loan.id, loan]));
  const movements: { date: string; amount: number }[] = loans.map(loan => ({ date: loan.date, amount: loan.direction === "taken" ? loan.amount_paisa : -loan.amount_paisa }));
  payments.forEach(payment => {
    const loan = byId.get(payment.loan_id);
    // An orphan cannot establish an incoming/outgoing direction. The database FK prevents it.
    if (loan) movements.push({ date: payment.date, amount: loan.direction === "given" ? payment.amount_paisa : -payment.amount_paisa });
  });
  const inMonth = movements.filter(m => m.date.slice(0, 7) === month);
  const loanIn = inMonth.filter(m => m.amount > 0).reduce((sum, m) => sum + m.amount, 0);
  const loanOut = inMonth.filter(m => m.amount < 0).reduce((sum, m) => sum - m.amount, 0);
  const loanNet = loanIn - loanOut;
  const opening = summary.opening + movements.filter(m => m.date < `${month}-01`).reduce((sum, m) => sum + m.amount, 0);
  const cashNet = summary.net + loanNet;
  return { ...summary, opening, closing: opening + cashNet, loanIn, loanOut, loanNet, cashNet };
}
