import test from "node:test";
import assert from "node:assert/strict";
import { validateProfile, type Profile } from "../lib/profile";

const valid: Profile = { user_id: "a1111111-1111-4111-a111-111111111111", display_name: "Samira", purpose: "small_business", business_name: "Studio", referral_source: "other", referral_details: "Local workshop", goals: ["save_more", "grow_audience"], currency: "PKR" };
test("onboarding rejects incomplete and tampered profile values", () => {
  const invalid: Partial<Profile>[] = [{ display_name: " " }, { display_name: "a".repeat(81) }, { goals: [] }, { goals: ["not-a-goal"] }, { goals: [null as unknown as string] }, { purpose: "unknown" as Profile["purpose"] }, { referral_source: "unknown" as Profile["referral_source"] }, { currency: "USD" as "PKR" }];
  for (const changes of invalid) assert.throws(() => validateProfile({ ...valid, ...changes }));
});
test("profile updates trim answers and discard answers no longer relevant", () => {
  const result = validateProfile({ ...valid, display_name: " Samira ", purpose: "personal", referral_source: "friend", goals: ["save_more", "save_more"] });
  assert.equal(result.display_name, "Samira");
  assert.equal(result.business_name, "");
  assert.equal(result.referral_details, "");
  assert.deepEqual(result.goals, ["save_more"]);
  assert.equal(result.user_id, valid.user_id);
});
