import { supabase } from "./supabase";
import { validateLoan, validatePayment, type UdharInput, type UdharLoan, type UdharPayment, type UdharPaymentInput } from "./udhar";

async function allRows<T>(table: "ledger_loans" | "ledger_loan_payments", userId: string, loanId?: string): Promise<T[]> {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    let query = supabase().from(table).select("*").eq("user_id", userId);
    if (loanId) query = query.eq("loan_id", loanId);
    const { data, error } = await query.order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data as T[]);
    if (data.length < 1000) return rows;
  }
}
export async function fetchUdhar(userId: string): Promise<{ loans: UdharLoan[]; payments: UdharPayment[] }> {
  const [loans, payments] = await Promise.all([allRows<UdharLoan>("ledger_loans", userId), allRows<UdharPayment>("ledger_loan_payments", userId)]);
  return { loans, payments };
}
export async function saveUdharLoan(userId: string, input: UdharInput, id?: string): Promise<UdharLoan> {
  validateLoan(input);
  const values: UdharInput = { direction: input.direction, person: input.person.trim(), amount_paisa: input.amount_paisa, date: input.date, due_date: input.due_date, payment_method: input.payment_method, notes: input.notes.trim() };
  const query = id ? supabase().from("ledger_loans").update(values).eq("id", id).eq("user_id", userId) : supabase().from("ledger_loans").insert({ ...values, user_id: userId });
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data as UdharLoan;
}
export async function deleteUdharLoan(userId: string, id: string) {
  const { data, error } = await supabase().from("ledger_loans").delete().eq("id", id).eq("user_id", userId).select("id").single();
  if (error || !data) throw error || new Error("This loan could not be deleted. Refresh and try again.");
}
export async function saveUdharPayment(userId: string, input: UdharPaymentInput): Promise<UdharPayment> {
  const [{ data: loan, error: loanError }, payments] = await Promise.all([
    supabase().from("ledger_loans").select("*").eq("id", input.loan_id).eq("user_id", userId).single(),
    allRows<UdharPayment>("ledger_loan_payments", userId, input.loan_id),
  ]);
  if (loanError) throw loanError;
  validatePayment(input, loan as UdharLoan, payments as UdharPayment[]);
  // The database repeats this check while locking the parent loan, including concurrent requests.
  const { data, error } = await supabase().from("ledger_loan_payments").insert({ user_id: userId, loan_id: input.loan_id, amount_paisa: input.amount_paisa, date: input.date, payment_method: input.payment_method, notes: input.notes.trim() }).select().single();
  if (error) throw error;
  return data as UdharPayment;
}
export async function deleteUdharPayment(userId: string, id: string) {
  const { data, error } = await supabase().from("ledger_loan_payments").delete().eq("id", id).eq("user_id", userId).select("id").single();
  if (error || !data) throw error || new Error("This repayment could not be deleted. Refresh and try again.");
}
