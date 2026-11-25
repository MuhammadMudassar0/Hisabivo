import { parsePkrAmount } from "./amount";

/** Pakistan TY2027 ordinary individual rates. Reviewed against FBR on 2026-11-24.
 * No ledger categories or receipts are used to infer taxability.
 */
export const SUPPORTED_TAX_YEAR = 2027;
export const TAX_YEAR_START = "2026-07-01";
export const TAX_YEAR_END = "2027-06-30";
export const TAX_VERIFIED_ON = "24 November 2026";
export const MAX_TAXABLE_PAISA = 1_000_000_000; // Rs 10m inclusive: high-income cases are deliberately unsupported.
export const TAX_SOURCES = {
  rateCard: "https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf",
  ordinance: "https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf",
  atl: "https://fbr.gov.pk/categ/check-active-taxpayer/51148/30859/71169",
  iris: "https://iris.fbr.gov.pk/",
} as const;
type Slab = { lower: number; upper: number; base: number; ratePercent: number };
export const salarySlabs: readonly Slab[] = [
  { lower: 0, upper: 600000, base: 0, ratePercent: 0 },
  { lower: 600000, upper: 1200000, base: 0, ratePercent: 1 },
  { lower: 1200000, upper: 2200000, base: 6000, ratePercent: 11 },
  { lower: 2200000, upper: 3200000, base: 116000, ratePercent: 20 },
  { lower: 3200000, upper: 4100000, base: 316000, ratePercent: 25 },
  { lower: 4100000, upper: 5600000, base: 541000, ratePercent: 29 },
  { lower: 5600000, upper: 7000000, base: 976000, ratePercent: 32 },
  { lower: 7000000, upper: Infinity, base: 1424000, ratePercent: 35 },
];
export const individualSlabs: readonly Slab[] = [
  { lower: 0, upper: 600000, base: 0, ratePercent: 0 },
  { lower: 600000, upper: 1200000, base: 0, ratePercent: 15 },
  { lower: 1200000, upper: 1600000, base: 90000, ratePercent: 20 },
  { lower: 1600000, upper: 3200000, base: 170000, ratePercent: 30 },
  { lower: 3200000, upper: 5600000, base: 650000, ratePercent: 40 },
  { lower: 5600000, upper: Infinity, base: 1610000, ratePercent: 45 },
];
export function parseAnnualAmount(value: string): number {
  return parsePkrAmount(value, { allowZero: true, allowEmpty: true });
}
export function taxYearForDate(date: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) return null;
  return Number(date.slice(0, 4)) + (Number(date.slice(5, 7)) >= 7 ? 1 : 0);
}
export type TaxEstimate = {
  taxYear: number; annualTaxablePaisa: number; annualTaxPaisa: number; monthlyTaxPaisa: number;
  salaryShare: number; slabType: "salary" | "individual"; marginalRatePercent: number;
  aboveFilingIncomeThreshold: boolean;
};
export function estimatePakistanTax(input: { taxYear: number; annualSalaryPaisa: number; annualOtherPaisa: number; residentNormalRegimeConfirmed: boolean }): TaxEstimate {
  if (input.taxYear !== SUPPORTED_TAX_YEAR) throw new Error("Only Tax Year 2027 rates are verified in this calculator.");
  if (!input.residentNormalRegimeConfirmed) throw new Error("Confirm that you are a resident individual with ordinary taxable income before estimating.");
  for (const amount of [input.annualSalaryPaisa, input.annualOtherPaisa]) if (!Number.isSafeInteger(amount) || amount < 0) throw new Error("Annual income must be a non-negative amount in whole paisa.");
  const total = input.annualSalaryPaisa + input.annualOtherPaisa;
  if (!Number.isSafeInteger(total) || total > MAX_TAXABLE_PAISA) throw new Error("This estimate supports annual taxable income up to Rs 10,000,000. Higher-income cases need a tax adviser’s review.");
  const salaried = total > 0 && input.annualSalaryPaisa * 4 > total * 3;
  const table = salaried ? salarySlabs : individualSlabs;
  const slab = table.find(s => total <= s.upper * 100)!;
  const annualTaxPaisa = Math.round(slab.base * 100 + (total - slab.lower * 100) * slab.ratePercent / 100);
  return {
    taxYear: SUPPORTED_TAX_YEAR, annualTaxablePaisa: total, annualTaxPaisa,
    monthlyTaxPaisa: Math.round(annualTaxPaisa / 12),
    salaryShare: total ? input.annualSalaryPaisa / total : 0,
    slabType: salaried ? "salary" : "individual", marginalRatePercent: slab.ratePercent,
    aboveFilingIncomeThreshold: total > 60000000,
  };
}
