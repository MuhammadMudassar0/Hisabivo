import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Category, EntryInput, Transaction, ExpensePayment } from "./ledger";
import { normalizeEntry, validDate, validateEntry } from "./ledger";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
export const isConnected = Boolean(url && key && !url.includes("your-project"));
let client: SupabaseClient | undefined;
export function supabase() {
  if (!isConnected) throw new Error("Supabase has not been configured yet.");
  if (!client) client = createClient(url!, key!);
  return client;
}
export async function fetchEntries(userId: string): Promise<Transaction[]> {
  const rows: Transaction[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase().from("ledger_transactions").select("*").eq("user_id", userId).order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data as Transaction[]);
    if (data.length < 1000) break;
  }
  const payments = await fetchExpensePayments(userId);
  return rows.map(entry => ({ ...entry, payments: payments.filter(p => p.expense_id === entry.id) }));
}
export async function fetchCategories(userId: string): Promise<Category[]> {
  const rows: Category[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase().from("ledger_categories").select("id, name, type").eq("user_id", userId).order("id").range(offset, offset + 999);
    if (error) throw error;
    rows.push(...data.map(c => ({ ...c, custom: true })) as Category[]);
    if (data.length < 1000) break;
  }
  return rows;
}
function missingExpectedColumns(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && ["PGRST204", "42703"].includes(String(error.code)) && "message" in error && /expense_status|paid_date/.test(String(error.message)));
}
const expectedMigrationError = () => new Error("Expected expenses need a database update. Run setup-expected-expenses.sql in your Supabase SQL Editor, then try again.");
export async function saveEntry(userId: string, entry: EntryInput, id?: string): Promise<Transaction> {
  entry = normalizeEntry(entry);
  validateEntry(entry);
  const { payments: _payments, payment_tracking, ...values } = entry;
  const { expense_status: _status, paid_date: _paidDate, ...legacy } = values;
  async function write(payload: EntryInput) {
    const query = id ? supabase().from("ledger_transactions").update(payload).eq("id", id).eq("user_id", userId) : supabase().from("ledger_transactions").insert({ ...payload, user_id: userId });
    return query.select().single();
  }
  // Income needs no expense metadata and remains compatible before the migration.
  let { data, error } = await write(entry.type === "income" ? legacy : payment_tracking ? { ...values, payment_tracking: true } : values);
  // When explicitly changing an existing expected expense into income, the new
  // schema's guard confirms support before we send the cleared paid metadata.
  if (id && entry.type === "income" && error?.code === "23514" && /Only expenses can be marked expected/.test(error.message)) {
    ({ data, error } = await write(entry));
  }
  if (missingExpectedColumns(error)) {
    if (entry.expense_status === "expected" || entry.paid_date !== entry.date) throw expectedMigrationError();
    // Only an entirely legacy schema can safely omit paid metadata. A partially
    // applied migration must not leave an existing expected bill unchanged.
    const probe = await supabase().from("ledger_transactions").select("id, expense_status").eq("user_id", userId).limit(1);
    if (!missingExpectedColumns(probe.error)) throw expectedMigrationError();
    ({ data, error } = await write(legacy));
  }
  if (error) throw error;
  return { ...data, payments: entry.payments || [] } as Transaction;
}
export async function markExpensePaid(userId: string, id: string, paidDate: string): Promise<Transaction> {
  if (!validDate(paidDate)) throw new Error("Choose a valid payment date from 1900 onward.");
  const { data, error } = await supabase().from("ledger_transactions").update({ expense_status: "paid", paid_date: paidDate })
    .eq("id", id).eq("user_id", userId).eq("type", "expense").eq("expense_status", "expected").select().single();
  if (missingExpectedColumns(error)) throw expectedMigrationError();
  if (error || !data) throw new Error("This expense may already have changed or could not be marked paid. Refresh and try again.");
  return data as Transaction;
}
export async function removeEntry(userId: string, id: string) {
  const { data, error } = await supabase().from("ledger_transactions").delete().eq("id", id).eq("user_id", userId).select("id").single();
  if (error || !data) throw error || new Error("Transaction could not be deleted. Refresh and try again.");
}
export async function addCategory(userId: string, name: string, type: "income" | "expense"): Promise<Category> {
  const { data, error } = await supabase().from("ledger_categories").insert({ user_id: userId, name, type }).select("id, name, type").single();
  if (error) throw error;
  return { ...data, custom: true } as Category;
}

export async function fetchExpensePayments(userId:string):Promise<ExpensePayment[]> {
 const rows:ExpensePayment[]=[];
 for(let offset=0;;offset+=1000){
  const {data,error}=await supabase().from("ledger_expense_payments").select("*").eq("user_id",userId).order("id").range(offset,offset+999);
  if(error){ if(["PGRST205","42P01"].includes(error.code)) return []; throw error; }
  rows.push(...data as ExpensePayment[]); if(data.length<1000)return rows;
 }
}
export type ExpensePaymentInput = Pick<ExpensePayment,"amount_paisa"|"date"|"payment_method"|"notes">;
export async function recordExpensePayment(userId:string,expenseId:string,input:ExpensePaymentInput,requestId:string):Promise<Transaction>{
 const {error}=await supabase().rpc("ledger_record_expense_payment",{p_expense:expenseId,p_amount:input.amount_paisa,p_date:input.date,p_method:input.payment_method,p_notes:input.notes,p_request:requestId});
 if(error) throw new Error(["PGRST202","PGRST205","42703"].includes(error.code)?"Run setup-planning.sql in the Supabase SQL Editor to enable installments and recurring entries.":error.message);
 return refreshExpense(userId,expenseId);
}
export async function removeExpensePayment(userId:string,paymentId:string):Promise<Transaction>{
 const {data,error}=await supabase().rpc("ledger_remove_expense_payment",{p_payment:paymentId});if(error)throw error;
 return refreshExpense(userId,String(data));
}
async function refreshExpense(userId:string,id:string):Promise<Transaction>{
 const {data,error}=await supabase().from("ledger_transactions").select("*").eq("user_id",userId).eq("id",id).single();if(error)throw error;
 const payments=await fetchExpensePayments(userId);return {...data,payments:payments.filter(p=>p.expense_id===id)} as Transaction;
}
