import test from "node:test";
import assert from "node:assert/strict";
import { estimatePakistanTax, individualSlabs, MAX_TAXABLE_PAISA, parseAnnualAmount, salarySlabs, taxYearForDate } from "../lib/pakistan-tax";

const calc = (salary: number, other = 0, year = 2027) => estimatePakistanTax({ taxYear: year, annualSalaryPaisa: Math.round(salary * 100), annualOtherPaisa: Math.round(other * 100), residentNormalRegimeConfirmed: true });
test("annual amounts accept zero and exact paisa without rounding receipts", () => {
  assert.equal(parseAnnualAmount("0"), 0); assert.equal(parseAnnualAmount("0.29"), 29); assert.equal(parseAnnualAmount("123456.78"), 12345678);
  assert.equal(parseAnnualAmount("1,326,500"), 132650000);
  assert.equal(parseAnnualAmount("۱۳۲۶۵۰۰"), 132650000);
  for (const value of ["-1", "NaN", "1e6", "1,00", "1.234"]) assert.throws(() => parseAnnualAmount(value));
});
test("salary slab boundaries are progressive and have correct fixed tax", () => {
  const expected = [0, 6000, 116000, 316000, 541000, 976000, 1424000];
  salarySlabs.slice(0, -1).forEach((slab, i) => {
    assert.equal(calc(slab.upper).annualTaxPaisa, expected[i] * 100);
    const next = salarySlabs[i + 1];
    assert.equal(calc(slab.upper + 1).annualTaxPaisa, expected[i] * 100 + next.ratePercent);
  });
  assert.equal(calc(10000000).annualTaxPaisa, 247400000);
});
test("ordinary individual slab boundaries have correct fixed tax", () => {
  const expected = [0, 90000, 170000, 650000, 1610000];
  individualSlabs.slice(0, -1).forEach((slab, i) => {
    assert.equal(calc(0, slab.upper).annualTaxPaisa, expected[i] * 100);
    assert.equal(calc(0, slab.upper + 1).annualTaxPaisa, expected[i] * 100 + individualSlabs[i + 1].ratePercent);
  });
  assert.equal(calc(0, 10000000).annualTaxPaisa, 359000000);
});
test("combined salary must strictly exceed75%, not equal it", () => {
  const at = calc(750000, 250000); assert.equal(at.slabType, "individual"); assert.equal(at.annualTaxPaisa, 6000000);
  const above = calc(750000.01, 249999.99); assert.equal(above.slabType, "salary"); assert.equal(above.annualTaxPaisa, 400000);
  assert.equal(calc(100000, 900000).slabType, "individual");
});
test("zero tax does not establish a filing exemption", () => {
  assert.equal(calc(0).annualTaxPaisa, 0); assert.equal(calc(600000).aboveFilingIncomeThreshold, false);
  assert.equal(calc(600000.01).aboveFilingIncomeThreshold, true);
  assert.ok(!("needNotFile" in calc(0)));
});
test("unsupported years and high-income cases cannot silently use current slabs", () => {
  assert.throws(() => calc(1000000, 0, 2026), /Only Tax Year 2027/);
  assert.throws(() => calc(10000000.01), /up to Rs 10,000,000/);
  assert.throws(() => estimatePakistanTax({ taxYear: 2027, annualSalaryPaisa: 1, annualOtherPaisa: 0, residentNormalRegimeConfirmed: false }), /Confirm/);
  assert.throws(() => estimatePakistanTax({ taxYear: 2027, annualSalaryPaisa: -1, annualOtherPaisa: 0, residentNormalRegimeConfirmed: true }));
  assert.equal(MAX_TAXABLE_PAISA, 1000000000);
});
test("Pakistan normal tax year boundaries follow July through June", () => {
  assert.equal(taxYearForDate("2026-06-30"), 2026); assert.equal(taxYearForDate("2026-07-01"), 2027); assert.equal(taxYearForDate("2027-06-30"), 2027); assert.equal(taxYearForDate("2027-07-01"), 2028); assert.equal(taxYearForDate("2026-02-30"), null);
});
