import { supabase } from "./supabase";
export const purposes = [
  { id: "personal", name: "Personal finances", description: "Everyday expenses, family & savings" },
  { id: "freelance", name: "Freelance work", description: "Client payments & work expenses" },
  { id: "small_business", name: "Small business", description: "A shop, a service, or a new idea" },
  { id: "growing_business", name: "Growing business", description: "Track spending as your business grows" },
  { id: "large_business", name: "Larger business", description: "A dedicated income & expense log" },
] as const;
export const goals = [
  { id: "save_more", name: "Save more money", description: "Make more room for what matters" },
  { id: "understand_spending", name: "Understand my spending", description: "Know where the money actually goes" },
  { id: "grow_audience", name: "Grow my audience", description: "Build consistent marketing habits" },
  { id: "manage_cashflow", name: "Manage cash flow", description: "Keep income and costs in perspective" },
] as const;
export const referralSources = [
  { id: "search", name: "Google / web search" }, { id: "social_media", name: "Social media" }, { id: "friend", name: "A friend or colleague" }, { id: "youtube", name: "YouTube" }, { id: "other", name: "Somewhere else" },
] as const;
export type Profile = {
  user_id: string;
  display_name: string;
  purpose: typeof purposes[number]["id"];
  business_name: string;
  referral_source: typeof referralSources[number]["id"];
  referral_details: string;
  goals: string[];
  currency: "PKR";
};
export function validateProfile(profile: Profile): Profile {
  if (!profile || typeof profile.user_id !== "string" || !profile.user_id.trim()) throw new Error("Your account could not be identified. Please sign in again.");
  if (typeof profile.display_name !== "string" || !profile.display_name.trim() || profile.display_name.trim().length > 80) throw new Error("Enter a name with 1–80 characters.");
  if (!purposes.some(p => p.id === profile.purpose)) throw new Error("Choose how you’ll use Hisabivo.");
  if (!referralSources.some(s => s.id === profile.referral_source)) throw new Error("Choose where you heard about Hisabivo.");
  if (!Array.isArray(profile.goals) || profile.goals.length < 1 || profile.goals.length > 4 || profile.goals.some(g => !goals.some(option => option.id === g))) throw new Error("Choose at least one of the available goals.");
  if (typeof profile.business_name !== "string" || profile.business_name.trim().length > 100) throw new Error("Business name must be 100 characters or fewer.");
  if (typeof profile.referral_details !== "string" || profile.referral_details.trim().length > 200) throw new Error("Referral details must be 200 characters or fewer.");
  if (profile.currency !== "PKR") throw new Error("This ledger currently supports Pakistani rupees.");
  return { user_id: profile.user_id, display_name: profile.display_name.trim(), purpose: profile.purpose, business_name: profile.purpose === "personal" ? "" : profile.business_name.trim(), referral_source: profile.referral_source, referral_details: profile.referral_source === "other" ? profile.referral_details.trim() : "", goals: [...new Set(profile.goals)], currency: "PKR" };
}
export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase().from("ledger_profiles").select("*").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  if (data.user_id !== userId) throw new Error("Your profile could not be verified. Please sign in again.");
  return validateProfile(data as Profile);
}
export async function saveProfile(profile: Profile) {
  const input = validateProfile(profile);
  const { data, error } = await supabase().from("ledger_profiles").upsert(input, { onConflict: "user_id" }).select().single();
  if (error) throw error;
  if (!data || data.user_id !== input.user_id) throw new Error("Your saved profile could not be verified. Please try again.");
  return validateProfile(data as Profile);
}
