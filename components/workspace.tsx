"use client";

import Link from "next/link";
import { Calculator } from "lucide-react";
import PakistanTax, { PakistanTaxProvider } from "./pakistan-tax";
import TransactionList from "./transaction-list";
import ExpensePaymentDialog from "./expense-payment-dialog";
import PlanningWorkspace, { UpcomingIncome } from "./planning-workspace";
import ReminderCenter from "./reminder-center";
import { usePlanning } from "./use-planning";
import { buildReminders, visibleReminders, addDays, type Reminder } from "@/lib/planning";
import ExpectedExpenseSummary from "./expected-expense-summary";
import OverviewCharts from "./overview-charts";
import WorkspaceSidebar from "./workspace-sidebar";
import UdharWorkspace from "./udhar-workspace";
import { useUdhar } from "./use-udhar";
import { cashSummary, udharSummary } from "@/lib/udhar";
import { HandCoins } from "lucide-react";
import "@/app/udhar-integration.css";
import { useEffect, useMemo, useState, useRef, type FormEvent } from "react";
import { BookOpen, CalendarDays, Bell, Repeat2, ChartNoAxesCombined, Check, ChevronLeft, ChevronRight, CircleHelp, CreditCard, Download, FileText, FolderOpen, LayoutDashboard, Leaf, Lightbulb, ListFilter, LoaderCircle, LogOut, Minus, Pencil, Plus, RefreshCw, Search, Settings2, ShieldCheck, Sparkles, Tag, Trash2, TrendingUp, Wallet, X } from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./ui/dialog";
import EntryDialog, { Select } from "./entry-dialog";
import { createDemoId, categoryTotals, dateLabel, defaultCategories, demoEntries, money, monthLabel, monthSummary, palette, shiftMonth, today, validDate, validateEntry, isCashEntry, isExpectedExpense, normalizeEntry, pendingExpenses, expenseRemaining, expensePaid, transactionDate, type Category, type EntryInput, type EntryType, type Transaction } from "@/lib/ledger";
import { addCategory, fetchCategories, fetchEntries, removeEntry, saveEntry, recordExpensePayment, removeExpensePayment, type ExpensePaymentInput } from "@/lib/supabase";
import { goals, purposes, referralSources, type Profile } from "@/lib/profile";
import "@/app/workspace.css";

type View = "recurring" | "reminders" | "udhar" | "overview" | "transactions" | "categories" | "reports" | "insights" | "tax" | "settings";
type Props = { userId: string; email: string; profile: Profile; demo: boolean; onExit: () => Promise<void> | void; onProfileUpdate: (profile: Profile) => void };
const navigation = [
  { id: "overview", name: "Overview", icon: LayoutDashboard },
  { id: "transactions", name: "Transactions", icon: CreditCard },
  { id: "recurring", name: "Recurring & upcoming", icon: Repeat2 },
  { id: "reminders", name: "Reminders", icon: Bell },
  { id: "udhar", name: "Udhar", icon: HandCoins },
  { id: "categories", name: "Categories", icon: Tag },
  { id: "reports", name: "Monthly reports", icon: FileText },
  { id: "insights", name: "Your insights", icon: Lightbulb },
  { id: "tax", name: "Tax estimate", icon: Calculator },
  { id: "settings", name: "Settings", icon: Settings2 },
] as const;
const demoStorageKey = "hisabivo.demo.ledger.v1";
const errorText = (err: unknown) => err instanceof Error ? err.message : typeof err === "object" && err && "message" in err ? String(err.message) : "Something went wrong. Please try again.";

export default function Workspace(props: Props) {
  return <PakistanTaxProvider key={props.userId}><WorkspaceContent {...props} /></PakistanTaxProvider>;
}

function WorkspaceContent({ userId, email, profile, demo, onExit }: Props) {
  const ledgerFetchVersion=useRef(0);
  const mutationLock=useRef(false);
  const [udharFocus,setUdharFocus]=useState<string|null>(null);
  const [view, setView] = useState<View>("overview");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceLoaded, setSidebarPreferenceLoaded] = useState(false);
  const [entries, setEntries] = useState<Transaction[]>([]);
  const [customCategories, setCustomCategories] = useState<Category[]>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [storageWarning, setStorageWarning] = useState("");
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ type: EntryType; entry?: Transaction } | null>(null);
  const [deleting, setDeleting] = useState<Transaction | null>(null);
  const [payingExpense, setPayingExpense] = useState<Transaction | null>(null);
  const [clearDemo, setClearDemo] = useState(false);
  const [categoryModal, setCategoryModal] = useState(false);
  const [categoryType, setCategoryType] = useState<EntryType>("expense");
  const [modalError, setModalError] = useState("");
  const [mutationBusy, setMutationBusy] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [exitBusy, setExitBusy] = useState(false);
  const udhar = useUdhar(userId, demo, setNotice);
  const planning=usePlanning(userId,demo,setEntries,async()=>{const version=++ledgerFetchVersion.current;try{const rows=await fetchEntries(userId);if(version===ledgerFetchVersion.current)setEntries(rows);}catch(e){setLoadError(errorText(e));setReady(false);throw e;}});
  const [reminderToday,setReminderToday]=useState(today());
  useEffect(()=>{const timer=window.setInterval(()=>setReminderToday(today()),60000);return()=>window.clearInterval(timer);},[]);
  const reminders=useMemo(()=>buildReminders(entries,udhar.loans,udhar.payments,planning.occurrences,reminderToday,7,planning.schedules),[entries,udhar.loans,udhar.payments,planning.occurrences,planning.schedules,reminderToday]);
  const activeReminderCount=visibleReminders(reminders,planning.states,reminderToday).length;
  const outstanding = useMemo(() => udharSummary(udhar.loans, udhar.payments), [udhar.loans, udhar.payments]);
  const categories = useMemo(() => [...defaultCategories, ...customCategories], [customCategories]);
  const summary = useMemo(() => cashSummary(entries, udhar.loans, udhar.payments, month), [entries, udhar.loans, udhar.payments, month]);
  const pending = useMemo(() => pendingExpenses(entries, month), [entries, month]);
  const totals = useMemo(() => categoryTotals(summary.cashRows), [summary.cashRows]);
  const purposeName = purposes.find(p => p.id === profile.purpose)?.name || "Personal finances";
  const firstName = profile.display_name.trim().split(" ")[0];
  const loading = !ready && !loadError;
  const canWrite = ready && !mutationBusy && !udhar.busy && !planning.busy && !planning.loading;

  useEffect(() => {
    try { setSidebarCollapsed(window.localStorage.getItem("hisabivo.sidebar.collapsed") === "true"); } catch { /* Sidebar preferences are optional. */ }
    setSidebarPreferenceLoaded(true);
  }, []);
  useEffect(() => {
    if (!sidebarPreferenceLoaded) return;
    try { window.localStorage.setItem("hisabivo.sidebar.collapsed", String(sidebarCollapsed)); } catch { /* Keep the session preference. */ }
  }, [sidebarCollapsed, sidebarPreferenceLoaded]);

  useEffect(() => {
    let cancelled = false;
    const version=ledgerFetchVersion.current;
    setReady(false); setLoadError(""); setEntries([]); setCustomCategories([]);
    if (demo) {
      try {
        const saved = window.localStorage.getItem(demoStorageKey);
        if (saved) {
          const stored = JSON.parse(saved);
          if (!Array.isArray(stored.entries) || !Array.isArray(stored.categories)) throw new Error("Invalid demo data");
          for (const entry of stored.entries) { validateEntry(entry); if (typeof entry.id !== "string" || typeof entry.created_at !== "string") throw new Error("Invalid demo data"); }
          for (const c of stored.categories) if (typeof c.id !== "string" || typeof c.name !== "string" || !c.name.trim() || c.name.length > 60 || !["income", "expense"].includes(c.type)) throw new Error("Invalid demo categories");
          setEntries(stored.entries); setCustomCategories(stored.categories);
        } else setEntries(demoEntries());
      } catch {
        setEntries(demoEntries()); setStorageWarning("The saved demo could not be loaded. Sample data is shown. Changes may only last for this visit.");
      }
      setReady(true);
    } else {
      Promise.all([fetchEntries(userId), fetchCategories(userId)]).then(([rows, cats]) => {
        if (!cancelled) { if(version===ledgerFetchVersion.current)setEntries(rows); setCustomCategories(cats); setReady(true); }
      }).catch(err => { if (!cancelled) setLoadError(errorText(err)); });
    }
    return () => { cancelled = true; };
  }, [demo, userId, retry]);

  useEffect(() => {
    if (!demo || !ready || storageWarning) return;
    try { window.localStorage.setItem(demoStorageKey, JSON.stringify({ entries, categories: customCategories })); }
    catch { setStorageWarning("Your browser could not save demo changes. They will only last for this visit."); }
  }, [demo, ready, entries, customCategories, storageWarning]);
  useEffect(() => { if (!notice) return; const timer = window.setTimeout(() => setNotice(""), 4500); return () => window.clearTimeout(timer); }, [notice]);

  function navigate(next: View) { setView(next); if(next!=="udhar")setUdharFocus(null); }
  async function handleSave(input: EntryInput, id?: string) {
    if (!ready) throw new Error("Wait for your ledger to finish loading.");
    const previousForSave=id?entries.find(e=>e.id===id):undefined;
    input = normalizeEntry(previousForSave?.payment_tracking ? {...input,payment_tracking:true,payments:previousForSave.payments} : input);
    validateEntry(input); setMutationBusy(true);
    try {
      const previous = id ? entries.find(e => e.id === id) : undefined;
      const saved = demo ? { ...input, id: id || createDemoId(), created_at: previous?.created_at || new Date().toISOString() } : await saveEntry(userId, input, id);
      setEntries(rows => id ? rows.map(e => e.id === id ? saved : e) : [...rows, saved]);
      if (transactionDate(saved).slice(0, 7) !== month) setMonth(transactionDate(saved).slice(0, 7));
      setNotice(id ? "Transaction updated." : `${input.type === "income" ? "Income" : isExpectedExpense(input) ? "Expected expense" : "Paid expense"} added to your ledger.`);
    } finally { setMutationBusy(false); }
  }
  async function handleRecordPayment(input:ExpensePaymentInput,requestId:string){
    if(!payingExpense||!ready||mutationLock.current)throw new Error("Wait for your records to finish saving.");
    const current=entries.find(e=>e.id===payingExpense.id);if(!current)throw new Error("This bill no longer exists.");
    if(!Number.isSafeInteger(input.amount_paisa)||input.amount_paisa<=0||input.amount_paisa>expenseRemaining(current))throw new Error("Enter an amount no greater than the remaining bill.");
    if(!validDate(input.date)||input.date>today())throw new Error("Choose an actual payment date, today or earlier.");
    mutationLock.current=true;setMutationBusy(true);
    try{
      let saved:Transaction;
      if(demo){const existing=current.payments?.find(p=>p.id===requestId);const payments=existing?current.payments!:[...(current.payments||[]),{...input,id:requestId,expense_id:current.id,created_at:new Date().toISOString()}];saved=normalizeEntry({...current,payment_tracking:true,payments});}
      else saved=await recordExpensePayment(userId,current.id,input,requestId);
      setEntries(rows=>rows.map(e=>e.id===saved.id?saved:e));setMonth(input.date.slice(0,7));setNotice("Payment recorded. Only this installment is included in spending.");
    }finally{mutationLock.current=false;setMutationBusy(false);}
  }
  async function handleRemovePayment(paymentId:string){
    if(!payingExpense||mutationLock.current)throw new Error("Wait for the current change to finish.");const current=entries.find(e=>e.id===payingExpense.id);if(!current)throw new Error("Bill unavailable.");
    mutationLock.current=true;setMutationBusy(true);try{const saved=demo?normalizeEntry({...current,payments:(current.payments||[]).filter(p=>p.id!==paymentId)}):await removeExpensePayment(userId,paymentId);setEntries(rows=>rows.map(e=>e.id===saved.id?saved:e));setNotice("Payment undone. The outstanding amount and cash totals are updated.");}finally{mutationLock.current=false;setMutationBusy(false);}
  }
  async function handleExpectedIncome(input:EntryInput){await planning.save({type:"income",description:input.description,category:input.category,amount_paisa:input.amount_paisa,payment_method:input.payment_method,notes:input.notes,frequency:"once",start_date:input.date,end_date:null,reminder_days:3,active:true});setNotice("Expected income added to Upcoming money. Your received totals have not changed.");}
  function openReminder(reminder:Reminder){if(reminder.kind==="bill"){const entry=entries.find(e=>e.id===reminder.targetId);if(entry)setPayingExpense(entry);}else if(reminder.kind==="income")navigate("recurring");else{setUdharFocus(reminder.targetId);setView("udhar");}}
  function openBill(id:string){const entry=entries.find(e=>e.id===id);if(entry)setPayingExpense(entry);else setNotice("This bill was removed. Refresh planning to update its history.");}
  async function confirmDelete() {
    if (!deleting || !canWrite) return;
    setMutationBusy(true); setModalError("");
    try {
      if (!demo) await removeEntry(userId, deleting.id);
      setEntries(rows => rows.filter(e => e.id !== deleting.id)); setDeleting(null); setNotice("Transaction deleted.");
    } catch (err) { setModalError(errorText(err)); }
    finally { setMutationBusy(false); }
  }
  async function persistCategory(rawName: string, type: EntryType): Promise<Category> {
    if (!canWrite) throw new Error("Wait for your ledger to finish loading.");
    const name = rawName.trim();
    if (!name || name.length > 60) throw new Error("Enter a name with 1–60 characters.");
    if (categories.some(c => c.type === type && c.name.toLowerCase() === name.toLowerCase())) throw new Error(type === "income" ? "This income source already exists." : "This category already exists.");
    setMutationBusy(true);
    try {
      const saved = demo ? { id: createDemoId(), name, type, custom: true } : await addCategory(userId, name, type);
      setCustomCategories(rows => [...rows, saved]);
      setNotice(type === "income" ? "Your income source is ready." : "Your new category is ready.");
      return saved;
    } finally { setMutationBusy(false); }
  }
  async function createCategory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return;
    const name = String(new FormData(event.currentTarget).get("name") || "");
    setModalError("");
    try { await persistCategory(name, categoryType); setCategoryModal(false); }
    catch (err) { setModalError(errorText(err)); }
  }
  async function exportPdf() {
    if (!ready) return; setExportBusy(true);
    try { const { downloadMonthlyPdf } = await import("@/lib/pdf"); downloadMonthlyPdf(entries, month, email, demo, udhar.ready ? { loans: udhar.loans, payments: udhar.payments } : undefined, planning.ready ? planning.occurrences : undefined); setNotice(udhar.ready ? "Your monthly PDF is ready, including Udhar movements." : "PDF ready. Udhar is unavailable, so this statement includes income and expenses only."); }
    catch (err) { setNotice(`Could not create your PDF: ${errorText(err)}`); }
    finally { setExportBusy(false); }
  }
  async function exit() {
    setExitBusy(true);
    try { await onExit(); }
    catch (err) { setNotice(errorText(err)); setExitBusy(false); }
  }
  const transactionTable = <TransactionList key={view === "overview" ? "recent" : "full"} entries={entries} month={month} compact={view === "overview"} loading={loading} canWrite={canWrite} onEdit={entry => setEditor({ type: entry.type, entry })} onDelete={entry => { setDeleting(entry); setModalError(""); }} onViewAll={() => navigate("transactions")} onMarkPaid={entry => setPayingExpense(entry)} />;

  return <div className="workspace" data-sidebar-collapsed={sidebarCollapsed}><a className="ws-skip" href="#workspace-main">Skip to content</a><WorkspaceSidebar items={navigation} activeView={view} onNavigate={next => { if (navigation.some(item => item.id === next)) navigate(next as View); }} profileName={profile.display_name} purposeName={purposeName} demo={demo} onExit={() => { void exit(); }} exitBusy={exitBusy} disabled={mutationBusy || udhar.busy || planning.busy} collapsed={sidebarCollapsed} onCollapsedChange={setSidebarCollapsed} /><div className="ws-body"><header className="ws-topbar"><div className="ws-breadcrumb">Your workspace <ChevronRight size={14} /><strong>{navigation.find(n => n.id === view)?.name}</strong></div><div className="ws-topbar-right"><span className="ws-currency">PKR <span>Pakistani rupee</span></span><Button variant="ghost" size="sm" aria-label={`Reminders, ${activeReminderCount} active`} onClick={()=>navigate("reminders")}><Bell size={17}/>{activeReminderCount}</Button><span className="ws-private"><ShieldCheck size={15} /> {demo ? "Demo mode" : "Private account"}</span></div></header>{demo && <div className="ws-demo-banner"><span><CircleHelp size={17} /><strong>You’re exploring the demo.</strong> Sample records and edits stay in this browser.</span><Link href="/signup/">Create your own account</Link></div>}{storageWarning && <p className="ws-storage-warning" role="alert">{storageWarning}</p>}{udhar.storageWarning && <p className="ws-storage-warning" role="alert">{udhar.storageWarning}</p>}<main id="workspace-main" className="ws-main"><div className="ws-page-heading"><div><div className="ws-eyebrow">{view === "overview" ? "A LITTLE CLARITY, EVERY DAY" : purposeName.toUpperCase()}</div><h1>{view === "overview" ? `Your money, at a glance${firstName ? ", " + firstName : ""}.` : view === "transactions" ? "Every rupee, recorded." : view === "recurring" ? "Plan what’s coming next." : view === "reminders" ? "A little notice. Less to remember." : view === "udhar" ? "A clearer picture of your Udhar." : view === "categories" ? "Your expenses. Your income sources." : view === "reports" ? "Your month. On paper." : view === "insights" ? "Make the numbers useful." : view === "tax" ? "Estimate your annual Pakistan tax." : "Make this space yours."}</h1><p>{view === "overview" ? "See what came in, what went out, and what’s left to work with." : view === "transactions" ? "Keep the details tidy. The bigger picture takes care of itself." : view === "recurring" ? "Recurring bills, expected income, and every receipt in one place." : view === "reminders" ? "Stay ahead of bills, expected income, and Udhar return dates." : view === "udhar" ? "What you’re owed. What you owe. Keep every repayment in view." : view === "categories" ? "Everyday life or business costs — keep them organised your way." : view === "reports" ? "A clear, downloadable statement for any month you choose." : view === "insights" ? "Practical ideas shaped by your goals and the records you keep." : view === "tax" ? "A planning estimate for your expected annual taxable income, across all ordinary sources." : "Your account, your goals, and your preferences."}</p></div><div className="ws-heading-actions">{["overview", "transactions"].includes(view) && <><Button variant="outline" onClick={() => setEditor({ type: "income" })} disabled={!canWrite}><Plus />Add income</Button><Button onClick={() => setEditor({ type: "expense" })} disabled={!canWrite}><Plus />Add expense</Button></>}{view === "categories" && <Button onClick={() => { setCategoryType("expense"); setCategoryModal(true); setModalError(""); }} disabled={!canWrite}><Plus />New category</Button>}</div></div>{loadError && view !== "tax" && view !== "udhar" && view !== "recurring" && view !== "reminders" ? <div className="ws-load-error" role="alert"><div><FolderOpen size={28} /><h2>We couldn’t load your ledger.</h2><p>{loadError}</p><p className="muted">Your records haven’t been changed. Try again when the connection is ready.</p></div><Button onClick={() => setRetry(v => v + 1)}><RefreshCw />Try again</Button></div> : <>{["overview", "transactions", "reports", "insights"].includes(view) && <div className="ws-period-row"><div className="ws-period-picker"><CalendarDays size={18} /><input aria-label="Choose reporting month" type="month" min="1900-01" max="9998-12" value={month} onChange={e => { if (/^\d{4}-(0[1-9]|1[0-2])$/.test(e.target.value) && e.target.value >= "1900-01" && e.target.value <= "9998-12") setMonth(e.target.value); }} /><div><button type="button" aria-label="Previous month" disabled={month <= "1900-01"} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft size={16} /></button><button type="button" aria-label="Next month" disabled={month >= "9998-12"} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight size={16} /></button></div></div><span>{loading ? <><LoaderCircle size={14} className="animate-spin" /> Loading your records</> : <><span className="ws-currency-note">All amounts in PKR</span><span className="ws-period-separator">·</span>{summary.rows.length} {summary.rows.length === 1 ? "transaction" : "transactions"}</>}</span>{view === "overview" && <Button variant="ghost" size="sm" onClick={exportPdf} disabled={!ready || exportBusy}>{exportBusy ? <LoaderCircle className="animate-spin" /> : <Download />}Export PDF</Button>}</div>}

      {view === "overview" && <><div className="ws-stats"><Stat title="Income received" value={summary.income} icon={Wallet} detail={`${summary.rows.filter(e => e.type === "income").length} income entries this month`} color="income" loading={loading} /><Stat title="Expenses paid" value={summary.expense} icon={CreditCard} detail={`${summary.cashRows.filter(e => e.type === "expense").length} expense payments this month`} color="expense" loading={loading} /><Stat title="Net this month" value={summary.net} icon={ChartNoAxesCombined} detail={summary.net >= 0 ? "Income minus expenses this month" : "Expenses are higher than income this month"} color="net" loading={loading} /></div><div className="ws-balance-strip"><span><span>Opening recorded cash</span><strong>{udhar.ready ? money(summary.opening) : "—"}</strong></span><p>{udhar.ready ? `Includes Udhar: ${money(summary.loanIn)} in · ${money(summary.loanOut)} out this month` : "Udhar records are unavailable. Open Udhar to finish setup or retry."}</p><span><span>Closing recorded cash</span><strong>{udhar.ready ? money(summary.closing) : "—"}</strong></span></div><ExpectedExpenseSummary entries={pending} month={month} loading={loading} canWrite={canWrite} onMarkPaid={setPayingExpense} /><UpcomingIncome planning={planning} compact onViewAll={()=>navigate("recurring")}/><ReminderCenter reminders={reminders} states={planning.states} scopeKey={userId} canWrite={planning.ready&&!planning.busy} onState={planning.reminder} onAction={openReminder} compact onViewAll={()=>navigate("reminders")} warning={planning.error||(!udhar.ready?"Udhar reminders are unavailable until Udhar records finish loading.":undefined)}/><OverviewCharts entries={entries} month={month} /><IncomeSources totals={categoryTotals(summary.cashRows, "income")} total={summary.income} onAdd={() => setEditor({ type: "income" })} ready={canWrite} /><section className="ws-udhar-overview"><div><span><HandCoins size={19} /> Udhar given · To receive</span><strong>{udhar.ready ? money(outstanding.toReceive) : "—"}</strong></div><div><span><HandCoins size={19} /> Udhar taken · To repay</span><strong>{udhar.ready ? money(outstanding.toPay) : "—"}</strong></div><Button variant="outline" onClick={() => navigate("udhar")}>Manage Udhar</Button></section>{transactionTable}<div className="ws-gentle-note"><Leaf size={19} /><p><strong>A little consistency goes a long way.</strong> Log the small things, too. They’re part of your picture.</p></div></>}
      {view === "recurring" && <PlanningWorkspace planning={planning} categories={categories} onBill={openBill}/>}
      {view === "reminders" && <ReminderCenter reminders={reminders} states={planning.states} scopeKey={userId} canWrite={planning.ready&&!planning.busy} onState={planning.reminder} onAction={openReminder} warning={planning.error||(!udhar.ready?"Udhar reminders are unavailable until Udhar records finish loading.":undefined)}/>}
      {view === "transactions" && transactionTable}
      {view === "categories" && <><div className="ws-category-intro"><Tag size={22} /><p><strong>Start with the essentials. Add your own.</strong><br />Categories make your monthly reports easier to understand. Your custom categories are private to your account.</p></div>{(["expense", "income"] as const).map(type => <section className="ws-category-section" key={type}><div className="ws-section-header"><div><h2>{type === "expense" ? "Expense categories" : "Income sources"}</h2><p>{categories.filter(c => c.type === type).length} ways to keep your records organised</p></div>{type === "income" && <Button variant="outline" size="sm" onClick={() => { setCategoryType("income"); setCategoryModal(true); setModalError(""); }} disabled={!canWrite}><Plus />New income source</Button>}<span className={`ws-type-label ${type}`}>{type === "expense" ? <Minus size={15} /> : <Plus size={15} />}{type === "expense" ? "Money out" : "Money in"}</span></div><div className="ws-category-grid">{categories.filter(c => c.type === type).map((c, i) => <div className="ws-category-item" key={c.id}><span className="ws-category-symbol" style={{ background: `${palette[i % palette.length]}15`, color: palette[i % palette.length] }}><Tag size={17} /></span><strong>{c.name}</strong>{c.custom && <span className="ws-custom-label">Custom</span>}</div>)}</div></section>)}</>}
      {view === "reports" && <Reports summary={summary} month={month} exportBusy={exportBusy} ready={ready} onExport={exportPdf} demo={demo} udharAvailable={udhar.ready} />}
      {view === "insights" && <Insights profile={profile} summary={summary} totals={totals} month={month} />}
      {view === "tax" && <PakistanTax />}
      {view === "udhar" && <UdharWorkspace key={udharFocus||"udhar"} initialLoanId={udharFocus} loans={udhar.loans} payments={udhar.payments} loading={udhar.loading} error={udhar.error} canWrite={udhar.ready && !udhar.busy && !mutationBusy} onRetry={udhar.retry} onSaveLoan={udhar.saveLoan} onDeleteLoan={udhar.removeLoan} onSavePayment={udhar.savePayment} onDeletePayment={udhar.removePayment} />}
      {view === "settings" && <div className="ws-settings-grid"><section className="ws-card"><div className="ws-section-header"><div><h2>Your profile</h2><p>A little context helps make this space useful.</p></div><div className="ws-avatar ws-large-avatar">{profile.display_name.slice(0, 1).toUpperCase()}</div></div><dl className="ws-profile-details"><div><dt>Name</dt><dd>{profile.display_name}</dd></div><div><dt>Email</dt><dd>{demo ? "Demo workspace · no account" : email}</dd></div><div><dt>Using Hisabivo for</dt><dd>{purposeName}</dd></div>{profile.business_name && <div><dt>Business name</dt><dd>{profile.business_name}</dd></div>}<div><dt>Heard about us through</dt><dd>{referralSources.find(s => s.id === profile.referral_source)?.name || "—"}{profile.referral_details ? ` · ${profile.referral_details}` : ""}</dd></div><div><dt>Currency</dt><dd>PKR — Pakistani rupee</dd></div></dl>{!demo && <Button asChild variant="outline"><Link href="/onboarding/?edit=1"><Pencil />Edit profile & goals</Link></Button>}</section><div className="ws-settings-stack"><section className="ws-card"><div className="ws-section-header"><div><h2>Your goals</h2><p>What you’d like to work toward.</p></div><TrendingUp size={20} /></div><div className="ws-goal-tags">{profile.goals.map(g => <span key={g}><Check size={15} />{goals.find(goal => goal.id === g)?.name || g}</span>)}</div></section><section className="ws-card ws-privacy-card"><ShieldCheck size={25} /><h2>{demo ? "Just a look around" : "Your records belong to you"}</h2><p>{demo ? "This workspace contains sample records and any demo changes you make in this browser. Nothing here is copied to your real account." : "Your income, expenses, categories and profile are available only to your signed-in account. PDF reports are generated on your device."}</p>{demo ? <Button variant="outline" onClick={() => { setClearDemo(true); setModalError(""); }}><Trash2 />Clear demo records</Button> : <Button variant="outline" onClick={exit} disabled={exitBusy || mutationBusy || udhar.busy}><LogOut />Sign out</Button>}</section></div></div>}
      </>}<footer className="ws-footer"><span>hisabivo<span>.</span> <span>A little clearer, every day.</span></span><span><ShieldCheck size={14} />{demo ? "Demo data · stored in this browser" : "Your private money space"}</span></footer></main></div>
      {notice && <div className="ws-toast" role="status"><Check size={18} /><span>{notice}</span><button type="button" aria-label="Dismiss notification" onClick={() => setNotice("")}><X size={16} /></button></div>}
      {payingExpense && entries.some(e=>e.id===payingExpense.id) && <ExpensePaymentDialog entry={entries.find(e=>e.id===payingExpense.id)!} onClose={()=>setPayingExpense(null)} onRecord={handleRecordPayment} onRemove={handleRemovePayment}/>}
      {editor && <EntryDialog key={editor.entry?.id || editor.type} entry={editor.entry} initialType={editor.type} categories={categories} onClose={() => setEditor(null)} onSave={handleSave} onAddCategory={persistCategory} onExpectedIncome={handleExpectedIncome} />}
      <Dialog open={Boolean(deleting)} onOpenChange={open => { if (!open && !mutationBusy) setDeleting(null); }}><DialogContent><div className="ws-delete-icon"><Trash2 size={22} /></div><DialogTitle className="dialog-title">Delete this transaction?</DialogTitle><DialogDescription className="dialog-description">{deleting?.description} · {deleting ? money(deleting.amount_paisa) : ""}. This will remove the entry and update your totals. It cannot be undone.</DialogDescription>{modalError && <p role="alert" className="error-message">{modalError}</p>}<div className="dialog-actions"><Button variant="outline" disabled={mutationBusy} onClick={() => setDeleting(null)}>Keep transaction</Button><Button variant="destructive" disabled={mutationBusy} onClick={confirmDelete}>{mutationBusy && <LoaderCircle className="animate-spin" />}Delete transaction</Button></div></DialogContent></Dialog>
      <Dialog open={categoryModal} onOpenChange={open => { if (!mutationBusy) setCategoryModal(open); }}><DialogContent><div className="modal-icon"><Tag size={22} /></div><DialogTitle className="dialog-title">{categoryType === "income" ? "A source of income of your own." : "A category of your own."}</DialogTitle><DialogDescription className="dialog-description">Make room for the things that matter to you.</DialogDescription><form onSubmit={createCategory} className="entry-form"><fieldset disabled={mutationBusy} className="form-fieldset"><label>{categoryType === "income" ? "Income source name" : "Category name"}<Input name="name" placeholder={categoryType === "income" ? "e.g. Acme salary or weekend tutoring" : "e.g. Weekend business"} maxLength={60} required autoFocus /></label><label>Used for<Select value={categoryType} onChange={e => setCategoryType(e.target.value as EntryType)}><option value="expense">Expenses</option><option value="income">Income</option></Select></label></fieldset>{modalError && <p role="alert" className="error-message">{modalError}</p>}<div className="dialog-actions"><Button variant="outline" disabled={mutationBusy} onClick={() => setCategoryModal(false)}>Cancel</Button><Button type="submit" disabled={mutationBusy}>{mutationBusy && <LoaderCircle className="animate-spin" />}{categoryType === "income" ? "Create income source" : "Create category"}</Button></div></form></DialogContent></Dialog>
      <Dialog open={clearDemo} onOpenChange={setClearDemo}><DialogContent><DialogTitle className="dialog-title">Clear the demo ledger?</DialogTitle><DialogDescription className="dialog-description">All sample transactions, demo edits, custom categories, recurring schedules, reminders, and Udhar records in this browser will be removed. Your real account is unaffected.</DialogDescription><div className="dialog-actions"><Button variant="outline" onClick={() => setClearDemo(false)}>Keep records</Button><Button variant="destructive" onClick={() => { setEntries([]); setCustomCategories([]); udhar.clearDemo(); planning.clearDemo(); setClearDemo(false); setNotice("Demo records cleared. Start with a blank ledger."); }}>Clear demo records</Button></div></DialogContent></Dialog>
    </div>;
}

function IncomeSources({ totals, total, onAdd, ready }: { totals: { name: string; amount: number }[]; total: number; onAdd: () => void; ready: boolean }) {
  return <section className="ws-card ws-income-sources" aria-labelledby="income-sources-heading"><div className="ws-section-header"><div><h2 id="income-sources-heading">Income by source</h2><p>Every source, together in your monthly picture.</p></div><Button variant="outline" size="sm" onClick={onAdd} disabled={!ready}><Plus />Record income</Button></div>{totals.length ? <><div className="ws-income-source-grid">{totals.map((source, i) => <div className="ws-income-source-row" key={source.name}><div><span><i style={{ background: palette[i % palette.length] }} />{source.name}</span><strong>{money(source.amount)}</strong></div><div className="ws-income-source-track" aria-hidden="true"><i style={{ width: `${source.amount / total * 100}%`, background: palette[i % palette.length] }} /></div></div>)}</div><div className="ws-income-source-total"><span>{totals.length} {totals.length === 1 ? "source" : "sources"} this month</span><strong>Total received {money(total)}</strong></div></> : <EmptyState title="One income source or several — all welcome" description="Record salary, client payments, rent, and any other income. Add your own named sources as you go." />}</section>;
}

function EmptyState({ title, description }: { title: string; description: string }) { return <div className="ws-empty"><span><BookOpen size={25} /></span><h3>{title}</h3><p>{description}</p></div>; }
function Stat({ title, value, icon: Icon, detail, color, loading }: { title: string; value: number; icon: typeof Wallet; detail: string; color: string; loading: boolean }) { return <section className={`ws-stat ws-stat-${color}`}><div><span>{title}</span><span className="ws-stat-icon"><Icon size={19} strokeWidth={1.7} /></span></div><strong>{loading ? <span className="ws-loading-number" /> : money(value)}</strong><p>{detail}</p></section>; }
function Reports({ summary, month, exportBusy, ready, onExport, demo, udharAvailable }: { summary: ReturnType<typeof monthSummary>; month: string; exportBusy: boolean; ready: boolean; onExport: () => void; demo: boolean; udharAvailable: boolean }) {
  return <div className="ws-report-layout"><section className="ws-report-preview"><div className="ws-report-paper"><div className="ws-report-paper-header"><div><BookOpen size={24} /><strong>hisabivo.</strong></div><span>MONTHLY STATEMENT</span></div><div className="ws-report-title"><span>{demo ? "DEMO REPORT" : "YOUR PRIVATE RECORDS"}</span><h2>{monthLabel(month)}</h2><p>Income, paid expenses & the details in between.</p></div><div className="ws-report-totals"><div><span>Income received</span><strong>{money(summary.income)}</strong></div><div><span>Expenses paid</span><strong>{money(summary.expense)}</strong></div><div><span>Net this month</span><strong>{money(summary.net)}</strong></div></div><div className="ws-report-balance"><span>{udharAvailable ? "Opening recorded cash" : "Opening income/expense balance"} <strong>{money(summary.opening)}</strong></span><span>{udharAvailable ? "Closing recorded cash" : "Closing income/expense balance"} <strong>{money(summary.closing)}</strong></span></div><h3>Paid spending breakdown</h3>{categoryTotals(summary.cashRows).slice(0, 5).map(c => <div className="ws-report-category" key={c.name}><span>{c.name}</span><strong>{money(c.amount)}</strong></div>)}{!summary.expense && <p className="muted">No paid expenses recorded this month.</p>}<div className="ws-report-paper-foot"><span>Currency: PKR</span><span>{summary.rows.length} income/expense entries</span></div></div><p className="ws-report-caption">A preview of your statement. {udharAvailable ? "The PDF includes income, expenses, and Udhar cash movements for this month." : "Udhar is unavailable. This report covers income and expenses only."}</p></section><section className="ws-card ws-report-download"><span className="ws-report-file-icon"><FileText size={31} /></span><span className="ws-eyebrow">THE WHOLE MONTH, TO KEEP</span><h2>Your records.<br />Ready when you are.</h2><p>Download a clear monthly statement to review, print, or share on your terms.</p><ul><li><Check size={17} /> Income and expense totals</li><li><Check size={17} /> Opening and closing balances</li><li><Check size={17} /> Category breakdowns</li><li><Check size={17} /> Transaction details and separate expected expenses</li>{udharAvailable && <li><Check size={17} /> Udhar movements and outstanding balances</li>}</ul><Button size="lg" onClick={onExport} disabled={!ready || exportBusy}>{exportBusy ? <LoaderCircle className="animate-spin" /> : <Download />}Download {monthLabel(month)} PDF</Button><span className="ws-report-local"><ShieldCheck size={14} />Generated on your device</span></section></div>;
}
function Insights({ profile, summary, totals, month }: { profile: Profile; summary: ReturnType<typeof monthSummary>; totals: { name: string; amount: number }[]; month: string }) {
  const tips: { title: string; description: string; label: string; icon: typeof Lightbulb }[] = [];
  if (totals[0]) tips.push({ title: `${totals[0].name} is your largest expense category.`, description: `${money(totals[0].amount)} went here in ${monthLabel(month)} — ${Math.round(totals[0].amount / summary.expense * 100)}% of your recorded spending. Review its entries to see which costs are essential and which are flexible.`, label: "FROM YOUR RECORDS", icon: ChartNoAxesCombined });
  else tips.push({ title: "Start with a few everyday entries.", description: "Record your income and a few expenses. As your ledger fills up, you’ll be able to see your largest spending categories and how much remains each month.", label: "A GOOD FIRST STEP", icon: BookOpen });
  if (profile.goals.includes("save_more")) tips.push({ title: summary.income > 0 && summary.net > 0 ? "Give your unspent income a clear purpose." : "Make a little room to save.", description: summary.income > 0 && summary.net > 0 ? `Your recorded income exceeds expenses by ${money(summary.net)} this month. Check upcoming costs before deciding what amount to set aside.` : "Review recurring subscriptions and flexible expenses first. A small, realistic savings target is easier to track consistently.", label: "YOUR GOAL · SAVE MORE", icon: Leaf });
  if (profile.goals.includes("grow_audience")) tips.push({ title: "Connect your marketing effort to real results.", description: "Record promotion costs under Advertising. Keep a simple weekly note of the content you published, enquiries received, and which channels brought them. Compare these before increasing your spending.", label: "YOUR GOAL · GROW YOUR AUDIENCE", icon: TrendingUp });
  if (profile.goals.includes("manage_cashflow") || profile.purpose !== "personal") tips.push({ title: "Keep business costs visible.", description: "Record client or sales payments when received, and keep business expenses in consistent categories. Review your monthly net alongside upcoming bills so a profitable-looking month doesn’t hide costs still to come.", label: "YOUR GOAL · CASH FLOW", icon: Wallet });
  if (profile.goals.includes("understand_spending")) tips.push({ title: "Check in at the same time each week.", description: "Review uncategorised or repeated expenses, add anything you missed, and download your monthly statement when you want a complete view. Consistent entries make the comparison more useful.", label: "YOUR GOAL · UNDERSTAND SPENDING", icon: CalendarDays });
  return <><div className="ws-insights-intro"><span><Sparkles size={24} /></span><div><h2>Built around your goals.</h2><p>These suggestions use your selected goals and recorded monthly totals. They’re a starting point for your own review.</p></div><span className="ws-insights-badge">Practical guidance</span></div><div className="ws-insight-grid">{tips.map(t => <section className="ws-card ws-insight-card" key={t.title}><div className="ws-insight-top"><span className="ws-eyebrow">{t.label}</span><t.icon size={22} /></div><h2>{t.title}</h2><p>{t.description}</p></section>)}</div><p className="ws-insights-footnote">Your ledger shows the records you enter; it doesn’t connect to your bank or account for unrecorded bills.</p></>;
}
