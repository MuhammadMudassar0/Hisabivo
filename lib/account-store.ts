import { supabase } from "./supabase";
import { validateAccount, validateTransfer, type Account, type AccountInput, type AccountTransfer, type TransferInput } from "./accounts";

function accountError(error: unknown): never {
  if (error && typeof error === "object" && "code" in error && ["PGRST205", "PGRST202", "42P01", "42703"].includes(String(error.code))) throw new Error("Accounts need a database update. Run setup-accounts.sql in Supabase, then try again.");
  throw error;
}
async function rows<T>(table: "ledger_accounts" | "ledger_account_transfers", ownerId: string): Promise<T[]> {
  const output: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase().from(table).select("*").eq("user_id", ownerId).order("id").range(offset, offset + 999);
    if (error) accountError(error);
    output.push(...data as T[]);
    if (data!.length < 1000) return output;
  }
}
export async function fetchAccounts(ownerId: string) {
  const [accounts, transfers] = await Promise.all([rows<Account>("ledger_accounts", ownerId), rows<AccountTransfer>("ledger_account_transfers", ownerId)]);
  return { accounts, transfers };
}
export async function saveAccount(ownerId: string, input: AccountInput, id?: string): Promise<Account> {
  validateAccount(input);
  const values = { name: input.name.trim(), kind: input.kind, opening_balance_paisa: input.opening_balance_paisa, opening_date: input.opening_date, archived: input.archived };
  const query = id ? supabase().from("ledger_accounts").update(values).eq("user_id", ownerId).eq("id", id) : supabase().from("ledger_accounts").insert({ ...values, user_id: ownerId });
  const { data, error } = await query.select().single();
  if (error) accountError(error);
  return data as Account;
}
export async function setAccountArchived(ownerId: string, id: string, archived: boolean): Promise<Account> {
  const { data, error } = await supabase().from("ledger_accounts").update({ archived }).eq("user_id", ownerId).eq("id", id).select().single();
  if (error) accountError(error);
  return data as Account;
}
export async function recordAccountTransfer(ownerId: string, input: TransferInput, requestId: string, accounts: Account[]): Promise<AccountTransfer> {
  validateTransfer(input, accounts);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("A valid transfer request identity is required.");
  const { data, error } = await supabase().rpc("ledger_record_account_transfer", { p_owner: ownerId, p_from: input.from_account_id, p_to: input.to_account_id, p_amount: input.amount_paisa, p_date: input.date, p_notes: input.notes.trim(), p_request: requestId });
  if (error) accountError(error);
  const { data: transfer, error: readError } = await supabase().from("ledger_account_transfers").select("*").eq("user_id", ownerId).eq("id", String(data)).single();
  if (readError) accountError(readError);
  return transfer as AccountTransfer;
}
