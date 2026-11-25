"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ChartArea, ChartColumn, ChartNoAxesCombined, CircleHelp } from "lucide-react";
import { categoryTotals, money, monthLabel, monthSummary, shiftMonth, type Transaction } from "@/lib/ledger";
import "@/app/overview-charts.css";

const incomeColor = "#23846a";
const expenseColor = "#ca916c";
const colors = ["#247d64", "#75ac8b", "#d5ad76", "#7b9bb5", "#b18cac", "#b8c2a5"];
function axisMoney(paisa: number) {
  const amount = paisa / 100;
  return amount >= 1000000 ? `${(amount / 1000000).toLocaleString("en", { maximumFractionDigits: 1 })}m` : amount >= 1000 ? `${(amount / 1000).toLocaleString("en", { maximumFractionDigits: 1 })}k` : String(amount);
}
type TooltipRows = readonly { name?: string | number; value?: string | number; color?: string; payload?: { month?: string; name?: string; amount?: number } }[];
function TrendTooltip({ active, payload, label }: { active?: boolean; payload?: TooltipRows; label?: string | number }) {
  if (!active || !payload?.length) return null;
  const month = payload[0].payload?.month;
  return <div className="oc-tooltip"><strong>{month ? monthLabel(month) : label}</strong>{payload.map(row => <div key={String(row.name)}><span><i style={{ background: row.color }} />{row.name}</span><b>{money(Number(row.value), true)}</b></div>)}</div>;
}
function CategoryTooltip({ active, payload }: { active?: boolean; payload?: TooltipRows }) {
  if (!active || !payload?.length) return null;
  const row = payload[0];
  return <div className="oc-tooltip"><strong>{row.payload?.name || row.name}</strong><div><span>Paid expenses</span><b>{money(Number(row.value), true)}</b></div></div>;
}

export default function OverviewCharts({ entries, month }: { entries: Transaction[]; month: string }) {
  const id = useId().replace(/:/g, "");
  const [chartType, setChartType] = useState<"area" | "bar">("area");
  const [activeCategory, setActiveCategory] = useState<number | null>(null);
  useEffect(() => { setActiveCategory(null); }, [month]);
  const trend = useMemo(() => Array.from({ length: 6 }, (_, index) => {
    const key = shiftMonth(month, index - 5);
    const summary = monthSummary(entries, key);
    return { month: key, label: new Date(`${key}-01T12:00:00`).toLocaleDateString("en-GB", { month: "short" }), income: summary.income, expense: summary.expense };
  }), [entries, month]);
  const current = useMemo(() => monthSummary(entries, month), [entries, month]);
  const categories = useMemo(() => {
    const totals = categoryTotals(current.cashRows);
    return totals.length > 5 ? [...totals.slice(0, 5), { name: "Other categories", amount: totals.slice(5).reduce((sum, row) => sum + row.amount, 0) }] : totals;
  }, [current.cashRows]);
  const selected = activeCategory === null ? undefined : categories[activeCategory];
  const hasTrend = trend.some(row => row.income > 0 || row.expense > 0);
  const axisProps = { axisLine: false, tickLine: false, tick: { fontSize: 12, fill: "#8a9c8f" }, minTickGap: 10 };
  const chartContents = <>
    <CartesianGrid vertical={false} stroke="#e8eee6" strokeDasharray="4 5" />
    <XAxis {...axisProps} dataKey="label" tickMargin={13} height={38} />
    <YAxis {...axisProps} tickFormatter={axisMoney} width={49} tickMargin={8} domain={[0, "auto"]} />
    <Tooltip content={<TrendTooltip />} cursor={chartType === "area" ? { stroke: "#b2c8b6", strokeDasharray: "4 4" } : { fill: "#eff5eb" }} />
  </>;

  return <div className="overview-charts">
    <section className="oc-panel oc-trend"><header className="oc-panel-header"><div><span className="oc-kicker">THE BIGGER PICTURE</span><h2>Money in, money out.</h2><p>Your last six months, with a little perspective.</p></div><div className="oc-chart-switch" role="group" aria-label="Chart display"><button type="button" aria-label="Show area trend" aria-pressed={chartType === "area"} onClick={() => setChartType("area")} title="Area trend"><ChartArea size={17} /></button><button type="button" aria-label="Show comparison bars" aria-pressed={chartType === "bar"} onClick={() => setChartType("bar")} title="Comparison bars"><ChartColumn size={17} /></button></div></header>
      <div className="oc-trend-summary"><div><span><i style={{ background: incomeColor }} />Income received</span><strong>{money(current.income)}</strong></div><div><span><i style={{ background: expenseColor }} />Paid expenses</span><strong>{money(current.expense)}</strong></div><span className="oc-current-month">{monthLabel(month)}</span></div>
      {hasTrend ? <figure className="oc-trend-figure" aria-label="Six-month income and paid expense trend"><figcaption className="sr-only">{trend.map(row => `${monthLabel(row.month)}: income ${money(row.income)}, paid expenses ${money(row.expense)}`).join(". ")}</figcaption><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={260}>{chartType === "area" ? <AreaChart data={trend} margin={{ top: 15, right: 15, left: 0, bottom: 0 }} accessibilityLayer><defs><linearGradient id={`${id}-income`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={incomeColor} stopOpacity={.22} /><stop offset="95%" stopColor={incomeColor} stopOpacity={0} /></linearGradient><linearGradient id={`${id}-expense`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={expenseColor} stopOpacity={.15} /><stop offset="95%" stopColor={expenseColor} stopOpacity={0} /></linearGradient></defs>{chartContents}<Area type="monotone" dataKey="income" name="Income received" stroke={incomeColor} strokeWidth={2.5} fill={`url(#${id}-income)`} dot={{ r: 3, fill: "#fff", stroke: incomeColor, strokeWidth: 2 }} activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }} isAnimationActive={false} /><Area type="monotone" dataKey="expense" name="Paid expenses" stroke={expenseColor} strokeWidth={2.5} fill={`url(#${id}-expense)`} dot={{ r: 3, fill: "#fff", stroke: expenseColor, strokeWidth: 2 }} activeDot={{ r: 5, stroke: "white", strokeWidth: 3 }} isAnimationActive={false} /></AreaChart> : <BarChart data={trend} margin={{ top: 15, right: 15, left: 0, bottom: 0 }} barGap={5} accessibilityLayer>{chartContents}<Bar dataKey="income" name="Income received" fill={incomeColor} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} /><Bar dataKey="expense" name="Paid expenses" fill={expenseColor} radius={[4, 4, 0, 0]} maxBarSize={26} isAnimationActive={false} /></BarChart>}</ResponsiveContainer></figure> : <div className="oc-empty oc-trend-empty"><ChartNoAxesCombined size={32} /><h3>Your story starts with an entry.</h3><p>Record income or a paid expense to see your real trend here.</p></div>}
      <footer className="oc-trend-footer"><span><CircleHelp size={14} />Expected expenses are excluded.</span><details><summary>View monthly values</summary><div><table><caption className="sr-only">Six months of recorded totals in PKR</caption><thead><tr><th>Month</th><th>Income</th><th>Paid expenses</th></tr></thead><tbody>{trend.map(row => <tr key={row.month}><th scope="row">{monthLabel(row.month)}</th><td>{money(row.income)}</td><td>{money(row.expense)}</td></tr>)}</tbody></table></div></details></footer>
    </section>
    <section className="oc-panel oc-categories"><header className="oc-panel-header"><div><span className="oc-kicker">WHERE IT WENT</span><h2>Everyday spending, unpacked.</h2><p>Paid expenses by category this month.</p></div></header>{current.expense > 0 && categories.length ? <><div className="oc-donut-wrap"><figure className="oc-donut-figure" aria-label="Paid expense category breakdown"><figcaption className="sr-only">{categories.map(category => `${category.name}: ${money(category.amount)}, ${(category.amount / current.expense * 100).toFixed(1)} percent`).join(". ")}</figcaption><ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={220}><PieChart accessibilityLayer><Pie data={categories} dataKey="amount" nameKey="name" cx="50%" cy="50%" innerRadius={76} outerRadius={99} paddingAngle={categories.length > 1 ? 4 : 0} cornerRadius={5} stroke="none" startAngle={90} endAngle={-270} isAnimationActive={false} onMouseEnter={(_, index) => setActiveCategory(index)} onMouseLeave={() => setActiveCategory(null)}>{categories.map((category, index) => <Cell key={category.name} fill={colors[index % colors.length]} fillOpacity={activeCategory === null || activeCategory === index ? 1 : .38} />)}</Pie><Tooltip content={<CategoryTooltip />} /></PieChart></ResponsiveContainer></figure><div className="oc-donut-centre"><span>{selected?.name || "Total paid"}</span><strong data-long={money(selected?.amount ?? current.expense).length > 14 || undefined}>{money(selected?.amount ?? current.expense)}</strong><small>{selected ? `${(selected.amount / current.expense * 100).toFixed(1)}% of spending` : `${categoryTotals(current.cashRows).length} ${categoryTotals(current.cashRows).length === 1 ? "category" : "categories"}`}</small></div></div><div className="oc-category-legend">{categories.map((category, index) => <button type="button" key={category.name} onMouseEnter={() => setActiveCategory(index)} onMouseLeave={() => setActiveCategory(null)} onFocus={() => setActiveCategory(index)} onBlur={() => setActiveCategory(null)} onClick={() => setActiveCategory(current => current === index ? null : index)} aria-label={`Inspect ${category.name}: ${money(category.amount)}, ${(category.amount / current.expense * 100).toFixed(1)} percent`} aria-pressed={activeCategory === index}><span><i style={{ background: colors[index % colors.length] }} />{category.name}</span><strong>{money(category.amount)}<small>{(category.amount / current.expense * 100).toFixed(1)}%</small></strong></button>)}</div></> : <div className="oc-empty oc-category-empty"><div className="oc-empty-ring" aria-hidden="true" /><h3>No paid expenses yet.</h3><p>Your categories will take shape as you record what you spend.</p></div>}</section>
  </div>;
}
