"use client";

import { createContext, useContext, useId, useMemo, useState, type ReactNode } from "react";
import { BadgeInfo, Calculator, ChevronDown, ExternalLink, ShieldCheck } from "lucide-react";
import { Input } from "./ui/input";
import { money, today } from "@/lib/ledger";
import { estimatePakistanTax, parseAnnualAmount, SUPPORTED_TAX_YEAR, TAX_SOURCES, TAX_VERIFIED_ON, taxYearForDate } from "@/lib/pakistan-tax";
import "@/app/pakistan-tax.css";

type Scenario = { salary: string; other: string; confirmed: boolean };
type ScenarioState = { scenario: Scenario; setScenario: React.Dispatch<React.SetStateAction<Scenario>> };
const TaxContext = createContext<ScenarioState | null>(null);
export function PakistanTaxProvider({ children }: { children: ReactNode }) {
  const [scenario, setScenario] = useState<Scenario>({ salary: "", other: "", confirmed: false });
  return <TaxContext.Provider value={{ scenario, setScenario }}>{children}</TaxContext.Provider>;
}

export default function PakistanTax({ compact = false, entryDate }: { compact?: boolean; entryDate?: string }) {
  const shared = useContext(TaxContext);
  const [localScenario, setLocalScenario] = useState<Scenario>({ salary: "", other: "", confirmed: false });
  const { scenario, setScenario } = shared || { scenario: localScenario, setScenario: setLocalScenario };
  const [explicitYear, setExplicitYear] = useState<string | null>(null);
  const id = useId();
  const contextDate = entryDate === undefined ? today() : entryDate;
  const dateYear = taxYearForDate(contextDate);
  const mismatchedYear = dateYear !== SUPPORTED_TAX_YEAR;
  const allowedYear = !mismatchedYear || explicitYear === contextDate;
  const hasAnnualAmounts = Boolean(scenario.salary.trim() || scenario.other.trim());
  const calculation = useMemo(() => {
    if (!scenario.confirmed || !allowedYear || !hasAnnualAmounts) return { estimate: null, error: "" };
    try {
      return { estimate: estimatePakistanTax({ taxYear: SUPPORTED_TAX_YEAR, annualSalaryPaisa: parseAnnualAmount(scenario.salary), annualOtherPaisa: parseAnnualAmount(scenario.other), residentNormalRegimeConfirmed: scenario.confirmed }), error: "" };
    } catch (error) { return { estimate: null, error: error instanceof Error ? error.message : "Check your annual income amounts." }; }
  }, [scenario, allowedYear, hasAnnualAmounts]);
  const content = <div className="pk-tax-body" onKeyDown={event => {
    // Scenario inputs are embedded in the income form but must never record income.
    if (compact && event.key === "Enter" && event.target instanceof HTMLInputElement) event.preventDefault();
  }}>
    {!compact && <div className="pk-tax-intro"><span className="pk-tax-icon"><Calculator size={24} /></span><div><span className="pk-tax-eyebrow">PAKISTAN · ANNUAL INCOME TAX</span><h2>A little clarity for tax time.</h2><p>Plan around your expected taxable income from all sources, with an estimate you can review.</p></div></div>}
    <div className="pk-tax-year"><span><strong>Tax Year 2027</strong><span>1 July 2026 – 30 June 2027</span></span><span>PKR · Individual</span></div>
    <p className="pk-tax-explanation">Enter your <strong>expected annual taxable amounts</strong>, including all jobs and ordinary income sources. These figures are separate from your ledger. Income-source names do not determine taxability, and personal expenses do not reduce taxable salary here.</p>
    {mismatchedYear && <div className="pk-tax-year-warning" role="status"><BadgeInfo size={18} /><div><strong>{dateYear ? `This date belongs to Tax Year ${dateYear}.` : "Choose a valid date for this entry."}</strong><p>Verified rates are available only for TY2027. They won’t be applied automatically to this entry’s year.</p><label className="pk-tax-checkbox"><input type="checkbox" checked={explicitYear === contextDate} onChange={event => setExplicitYear(event.target.checked ? contextDate : null)} /><span>Explore a separate TY2027 scenario instead.</span></label></div></div>}
    <div className="pk-tax-inputs"><label htmlFor={`${id}-salary`}>Annual taxable salary <span>From all jobs combined</span><Input id={`${id}-salary`} type="text" inputMode="decimal" placeholder="0.00" maxLength={32} value={scenario.salary} onChange={event => setScenario(current => ({ ...current, salary: event.target.value }))} /></label><label htmlFor={`${id}-other`}>Other annual taxable income <span>Ordinary individual income only</span><Input id={`${id}-other`} type="text" inputMode="decimal" placeholder="0.00" maxLength={32} value={scenario.other} onChange={event => setScenario(current => ({ ...current, other: event.target.value }))} /></label></div>
    <label className="pk-tax-checkbox pk-tax-confirm"><input type="checkbox" checked={scenario.confirmed} onChange={event => setScenario(current => ({ ...current, confirmed: event.target.checked }))} /><span>I’m a Pakistan resident individual, and these amounts fall under the ordinary tax regime described below.</span></label>
    <p className="pk-tax-scope">For individuals with annual taxable income up to Rs 10 million. Excludes companies/AOPs, non-residents, pensions, dividends, rent, capital gains, export income, and final/minimum or other special tax regimes. Those cases need a separate review.</p>
    {calculation.error && <p className="pk-tax-error" role="alert">{calculation.error}</p>}
    {calculation.estimate ? <div className="pk-tax-results" aria-live="polite"><div className="pk-tax-result-main"><span>Estimated annual income tax</span><strong>{money(calculation.estimate.annualTaxPaisa, true)}</strong><small>Before withholding, tax credits, super tax and other adjustments.</small></div><dl><div><dt>Average monthly tax (annual ÷ 12)</dt><dd>{money(calculation.estimate.monthlyTaxPaisa, true)}</dd></div><div><dt>Total annual taxable income</dt><dd>{money(calculation.estimate.annualTaxablePaisa, true)}</dd></div><div><dt>Slab used</dt><dd>{calculation.estimate.slabType === "salary" ? "Salary" : "Non-salaried individual"}</dd></div></dl><p className="pk-tax-slab-note">Salary slabs apply only when salary is <strong>more than 75%</strong> of total taxable income. At exactly 75%, ordinary individual slabs apply. Displayed tax is rounded to the nearest paisa; this is a planning estimate, not an assessment or payment due.</p></div> : !calculation.error && <div className="pk-tax-waiting"><ShieldCheck size={19} /><p>{allowedYear ? !hasAnnualAmounts ? "Enter at least one expected annual taxable amount to see an estimate. Type 0 if you expect no taxable income; an empty second field counts as zero." : "Confirm the scope above to see your estimate. Your figures stay in this session and aren’t saved to the database." : "Select the supported TY2027 scenario above before viewing an estimate."}</p></div>}
    <div className="pk-tax-filing"><h3>When do I need to file?</h3>{calculation.estimate?.aboveFilingIncomeThreshold ? <p><strong>Your scenario exceeds Rs 600,000 in annual taxable income.</strong> A return is required under section 114’s income threshold. Review your full situation and file through FBR.</p> : <p><strong>Rs 600,000 is not a universal exemption from filing.</strong> Even with no tax in this estimate, other section 114 conditions can require a return.</p>}<p>Having an NTN, certain property or a vehicle above 1000cc, professional registration, prior tax assessments, losses or special-regime income can create separate obligations. Your actual income and circumstances determine the requirement.</p><p><strong>Registration and active-filer status are different.</strong> Check the FBR Active Taxpayer List (ATL); Hisabivo does not verify your status or file returns.</p><div className="pk-tax-links"><a href={TAX_SOURCES.atl} target="_blank" rel="noopener noreferrer">Check ATL status<ExternalLink size={13} /></a><a href={TAX_SOURCES.iris} target="_blank" rel="noopener noreferrer">Open FBR IRIS<ExternalLink size={13} /></a></div></div>
    <div className="pk-tax-sources"><span>Verified {TAX_VERIFIED_ON} · Finance Act 2026</span><div><a href={TAX_SOURCES.rateCard} target="_blank" rel="noopener noreferrer">FBR TY2027 rate card<ExternalLink size={12} /></a><a href={TAX_SOURCES.ordinance} target="_blank" rel="noopener noreferrer">Ordinance: section 114 & First Schedule<ExternalLink size={12} /></a></div><p>General planning guidance. Confirm taxability, reliefs and filing requirements with a qualified tax adviser. Figures are shared only within your current workspace session.</p></div>
  </div>;
  return compact ? <details className="pk-tax pk-tax-compact"><summary><span><Calculator size={18} />Estimate my annual Pakistan tax</span><ChevronDown size={17} /></summary>{content}</details> : <section className="pk-tax pk-tax-full">{content}</section>;
}
