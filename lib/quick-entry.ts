import { parseAmount, paymentMethods, today, type EntryInput, type EntryType, type PaymentMethod } from "./ledger";
import { supabase } from "./supabase";

export type QuickTemplate = { id: string; user_id?: string; workspace_id?: string; name: string; type: EntryType; amount_paisa: number | null; description: string; category: string; payment_method: PaymentMethod; created_at?: string };
export type DraftIntent = { kind: EntryType | "ambiguous" | "udhar_given" | "udhar_taken"; person?: string; requiresConfirmation: true; source: "template" | "roman_urdu" };
export type DraftPreview = { draft: Partial<EntryInput>; intent: DraftIntent; warnings: string[] };

export const starterTemplates: QuickTemplate[] = [
  { id: "starter-fuel", name: "Bike fuel", type: "expense", amount_paisa: null, description: "Bike fuel", category: "Fuel", payment_method: "Cash" },
  { id: "starter-groceries", name: "Weekly groceries", type: "expense", amount_paisa: null, description: "Weekly groceries", category: "Groceries", payment_method: "Cash" },
  { id: "starter-client", name: "Client payment received", type: "income", amount_paisa: null, description: "Client payment received", category: "Freelance", payment_method: "Bank transfer" },
];
export function templateDraft(template: QuickTemplate): DraftPreview {
  return { draft: { type: template.type, ...(template.amount_paisa ? { amount_paisa: template.amount_paisa } : {}), description: template.description, category: template.category, payment_method: template.payment_method, date: today(), notes: "", expense_status: "paid", paid_date: template.type === "expense" ? today() : null }, intent: { kind: template.type, source: "template", requiresConfirmation: true }, warnings: ["Review the amount, date, and payment status before saving."] };
}

/** A deterministic preview, never an instruction to save a financial record. */
export function parseQuickEntry(text: string): DraftPreview {
  const normalized = text.trim().replace(/[\u0660-\u0669\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - (digit.charCodeAt(0) >= 0x06f0 ? 0x06f0 : 0x0660))).replace(/\u066c/g, ",").replace(/\u066b/g, ".");
  if (!normalized || normalized.length > 500) throw new Error("Write a short entry of 1–500 characters.");
  const lower = normalized.toLocaleLowerCase();
  const amountMatches = [...lower.matchAll(/(?:^|\s)(\d[\d,]*(?:\.\d{1,2})?)(?:\s*(hazar|hazaar|thousand|lakh|lac|crore|k))?(?=\s|$|[.!?])/g)];
  const warnings: string[] = [];
  let amount: number | undefined;
  if (amountMatches.length === 1) {
    const base = parseAmount(amountMatches[0][1]);
    const multiplier = ({ hazar: 1000, hazaar: 1000, thousand: 1000, k: 1000, lakh: 100000, lac: 100000, crore: 10000000 } as Record<string, number>)[amountMatches[0][2]] || 1;
    amount = base * multiplier;
    if (!Number.isSafeInteger(amount) || amount > 99999999999) throw new Error("That amount is larger than the supported limit.");
  } else warnings.push(amountMatches.length ? "More than one number was found. Confirm which amount you mean." : "Add the amount in the review form.");
  const personMatch = normalized.match(/^([A-Za-z\u0600-\u06ff][A-Za-z\u0600-\u06ff .'-]{0,70}?)\s+(?:ko|se)\s/i);
  const person = personMatch?.[1].trim();
  const ambiguous = /\b(advance|udhar|udhaar|loan|borrow|lent|qarz|karz)\b|ادھار|قرض|ایڈوانس/.test(lower);
  const income = /\b(received|salary|aayi|aya|mila|mili|wasool|income)\b|تنخواہ|وصول/.test(lower);
  const expense = /\b(fuel|petrol|grocer(?:y|ies)|rashan|kharch|kharcha|medicine|dawai|bijli|bill|spent|diya|diye)\b|پیٹرول|خرچ|راشن|دوا|بل/.test(lower);
  const kind = ambiguous || (income && expense) || (!income && !expense) ? "ambiguous" : income ? "income" : "expense";
  let category: string | undefined;
  if (!ambiguous && kind === "expense") category = /\b(fuel|petrol)\b|پیٹرول/.test(lower) ? "Fuel" : /\b(grocer(?:y|ies)|rashan)\b|راشن/.test(lower) ? "Groceries" : /\b(medicine|dawai)\b|دوا/.test(lower) ? "Medicine" : /\b(bijli)\b|بجلی/.test(lower) ? "Electricity" : undefined;
  if (!ambiguous && kind === "income" && /\bsalary\b|تنخواہ/.test(lower)) category = "Salary";
  if (kind === "ambiguous") warnings.push("Choose what this means: income, an expense, or udhar. An advance can be any of these, so no type has been assumed.");
  warnings.push("Confirm the person, date, amount, and type before saving. This preview does not record money.");
  return { draft: { ...(kind !== "ambiguous" ? { type: kind } : {}), ...(amount !== undefined ? { amount_paisa: amount } : {}), ...(category ? { category } : {}), description: text.trim().slice(0, 100), date: today(), payment_method: "Cash", notes: person ? `Person: ${person}` : "" }, intent: { kind, ...(person ? { person } : {}), requiresConfirmation: true, source: "roman_urdu" }, warnings };
}

export async function listQuickTemplates(ownerId: string, workspaceId: string): Promise<QuickTemplate[]> {
  const { data, error } = await supabase().from("ledger_templates").select("*").eq("user_id", ownerId).eq("workspace_id", workspaceId).order("created_at");
  if (error) throw error;
  return data as QuickTemplate[];
}
export async function saveQuickTemplate(ownerId: string, workspaceId: string, input: Omit<QuickTemplate, "id" | "user_id" | "workspace_id" | "created_at">): Promise<QuickTemplate> {
  if (!input.name.trim() || input.name.length > 60 || !input.description.trim() || input.description.length > 100 || !input.category.trim() || input.category.length > 60 || !["income", "expense"].includes(input.type) || !paymentMethods.includes(input.payment_method)) throw new Error("Check the template name, type, description, category, and payment method.");
  if (input.amount_paisa !== null && (!Number.isSafeInteger(input.amount_paisa) || input.amount_paisa <= 0 || input.amount_paisa > 99999999999)) throw new Error("Enter a valid template amount or leave it blank.");
  const { data, error } = await supabase().from("ledger_templates").insert({ ...input, user_id: ownerId, workspace_id: workspaceId }).select().single();
  if (error) throw error;
  return data as QuickTemplate;
}
export async function deleteQuickTemplate(ownerId: string, workspaceId: string, id: string) {
  const { error } = await supabase().from("ledger_templates").delete().eq("id", id).eq("user_id", ownerId).eq("workspace_id", workspaceId);
  if (error) throw error;
}
