import Link from "next/link";
import {
  BarChart3, Bike, BookOpen, BriefcaseBusiness, ChartNoAxesCombined,
  Check, ChevronDown, CircleHelp, Coffee, FileDown, Heart, LayoutDashboard,
  Leaf, ListFilter, LockKeyhole, Menu, Plus, ReceiptText, ShieldCheck,
  ShoppingBasket, Sparkles, Store, Tags, Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSiteOrigin } from "@/lib/seo";
import "@/app/landing.css";

function Brand({ light = false }: { light?: boolean }) {
  return <span className={`lp-brand${light ? " lp-brand-light" : ""}`}><span className="lp-brand-symbol"><BookOpen size={22} strokeWidth={1.8} /></span>hisabivo<span className="lp-brand-dot">.</span></span>;
}

function ProductPreview() {
  const bars = [{ month: "Jun", income: 48, expense: 30 }, { month: "Jul", income: 61, expense: 39 }, { month: "Aug", income: 55, expense: 31 }, { month: "Sep", income: 73, expense: 45 }, { month: "Oct", income: 67, expense: 37 }, { month: "Nov", income: 89, expense: 34 }];
  return <div className="lp-product-scene" aria-label="An illustrative preview of the Hisabivo dashboard with sample financial data">
    <div className="lp-scene-orbit lp-scene-orbit-one" /><div className="lp-scene-orbit lp-scene-orbit-two" />
    <div className="lp-product-window">
      <div className="lp-window-top"><div className="lp-window-dots"><i /><i /><i /></div><span>your money, at a glance</span><LockKeyhole size={13} /></div>
      <div className="lp-preview-app"><aside className="lp-preview-rail" aria-hidden="true"><BookOpen size={22} /><span className="lp-rail-active"><LayoutDashboard size={18} /></span><ReceiptText size={18} /><Tags size={18} /><FileDown size={18} /><div className="lp-rail-avatar">A</div></aside>
        <div className="lp-preview-content"><div className="lp-preview-heading"><div><span className="lp-preview-overline">A LITTLE CLARITY, EVERY DAY</span><h3>Your money overview</h3></div><span className="lp-preview-month">November <ChevronDown size={12} /></span></div>
          <div className="lp-preview-stats"><div><span>Income received</span><strong>Rs 175,000</strong><small><span className="lp-dot lp-dot-green" /> Money in</small></div><div><span>Total expenses</span><strong>Rs 66,400</strong><small><span className="lp-dot lp-dot-amber" /> Money out</small></div></div>
          <div className="lp-preview-balance"><div><span>Left after expenses</span><strong>Rs 108,600<span>.00</span></strong></div><span className="lp-balance-icon"><Wallet size={22} /></span></div>
          <div className="lp-preview-chart"><div className="lp-chart-heading"><strong>The bigger picture</strong><div><span><i className="lp-dot lp-dot-green" /> Income</span><span><i className="lp-dot lp-dot-mint" /> Expenses</span></div></div><div className="lp-chart-bars">{bars.map(b => <div key={b.month} className={b.month === "Nov" ? "lp-chart-month lp-current-month" : "lp-chart-month"}><div className="lp-chart-pair"><i style={{ height: `${b.income}%` }} /><i style={{ height: `${b.expense}%` }} /></div><span>{b.month}</span></div>)}</div></div>
          <div className="lp-preview-transactions"><strong>The everyday details</strong><div><span className="lp-transaction-icon"><ShoppingBasket size={15} /></span><span>Weekly groceries<small>Groceries · Today</small></span><b>− Rs 4,200</b></div><div><span className="lp-transaction-icon lp-transaction-icon-blue"><Bike size={15} /></span><span>Bike fuel<small>Fuel · Yesterday</small></span><b>− Rs 3,200</b></div></div>
        </div>
      </div>
    </div>
    <div className="lp-report-float"><span><FileDown size={21} /></span><div><strong>A month. All together.</strong><small>Your monthly PDF, ready to keep.</small></div><span className="lp-float-check"><Check size={15} /></span></div>
    <span className="lp-sample-label">Illustrative preview · sample data</span>
  </div>;
}

const features = [
  { Icon: ReceiptText, title: "The little things add up.", body: "Log fuel, groceries, medicine, school supplies, and everything in between. Add a date, payment method, and a note to remember it by.", tag: "DAILY EXPENSES" },
  { Icon: Wallet, title: "Know what comes in.", body: "Salary, a freelance payment, or a day of sales. Keep your income in one place and see exactly how it compares with your spending.", tag: "INCOME & BALANCE" },
  { Icon: Tags, title: "A place for every rupee.", body: "Start with useful personal and business categories, then add your own. See which parts of life take the biggest share.", tag: "FLEXIBLE CATEGORIES" },
  { Icon: FileDown, title: "Keep the whole month.", body: "Download a monthly PDF with income, expenses, category totals, and transaction details. Clear records, whenever you need them.", tag: "MONTHLY REPORTS" },
  { Icon: ShieldCheck, title: "Your records stay yours.", body: "Each person gets their own account and private financial records. Keep your financial records together across devices.", tag: "PRIVATE ACCOUNTS" },
  { Icon: ChartNoAxesCombined, title: "A view that fits your life.", body: "Tell us what you’re working toward during setup. Your workspace reflects your purpose, whether that’s household spending or business cash flow.", tag: "PERSONAL SETUP" },
];

const audiences = [
  { Icon: Heart, title: "For you & your family", detail: "From bike maintenance to child expenses. Bring everyday spending into one simple view.", label: "PERSONAL LIFE" },
  { Icon: BriefcaseBusiness, title: "For independent work", detail: "Keep track of client payments, subscriptions, and the costs of doing what you do.", label: "FREELANCERS" },
  { Icon: Store, title: "For small businesses", detail: "Log business income and daily costs, from supplies and inventory to advertising.", label: "SMALL BUSINESS" },
  { Icon: BarChart3, title: "For the next chapter", detail: "Maintain a focused expense log as your business grows, alongside your existing accounting tools.", label: "GROWING & LARGER BUSINESSES" },
];

export default function LandingPage() {
  const origin = getSiteOrigin();
  const structuredData = origin ? {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    "@id": `${origin}/#application`,
    name: "Hisabivo",
    url: `${origin}/`,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    inLanguage: "en",
    description: "A private income and expense tracker for personal and business records in Pakistani rupees (PKR), with monthly PDF reports.",
    featureList: ["Income and expense tracking in PKR", "Personal and business categories", "Private user accounts", "Monthly PDF reports"],
  } : null;
  return <div className="lp-root">
    {structuredData && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }} />}
    <a href="#main" className="lp-skip-link">Skip to content</a>
    <header className="lp-header"><div className="lp-container lp-header-inner"><Link href="/" aria-label="Hisabivo home"><Brand /></Link><nav aria-label="Main navigation" className="lp-nav"><a href="#features">What you get</a><a href="#how-it-works">How it works</a><a href="#who-its-for">Who it’s for</a></nav><div className="lp-header-actions"><Link href="/login/" className="lp-signin">Sign in</Link><Button asChild className="lp-primary"><Link href="/signup/">Get started</Link></Button></div><details className="lp-mobile-menu"><summary aria-label="Open navigation"><Menu size={23} /></summary><nav aria-label="Mobile navigation"><a href="#features">What you get</a><a href="#how-it-works">How it works</a><a href="#who-its-for">Who it’s for</a><Link href="/login/">Sign in</Link><Link href="/signup/">Create an account</Link></nav></details></div></header>
    <main id="main">
      <section className="lp-hero"><div className="lp-container lp-hero-grid"><div className="lp-hero-copy"><div className="lp-eyebrow"><span className="lp-eyebrow-icon"><Leaf size={14} /></span> A little clarity. Every day.</div><h1>Make sense<br />of <span>every rupee.</span></h1><p className="lp-hero-description">Money comes in. Life happens. Hisabivo brings your income and expenses together, so you can see where you stand and what comes next.</p><div className="lp-hero-actions"><Button asChild size="lg" className="lp-primary"><Link href="/signup/">Start your money story</Link></Button><Link href="/dashboard/?demo=1" className="lp-demo-link"><span><LayoutDashboard size={17} /></span> Explore the demo</Link></div><div className="lp-hero-checks"><span><Check size={15} /> Built for PKR</span><span><Check size={15} /> Private by default</span><span><Check size={15} /> PDF reports</span></div><div className="lp-hero-note"><span className="lp-note-line" /><p>For everyday life.<br /><strong>And the work you’re growing.</strong></p></div></div><ProductPreview /></div></section>
      <section className="lp-purpose-strip" aria-label="Everyday categories"><div className="lp-container"><span>BIG PLANS. EVERYDAY DETAILS.</span><div><span><ShoppingBasket size={18} /> Groceries</span><span><Bike size={18} /> Fuel & maintenance</span><span><Heart size={18} /> Family & health</span><span><Coffee size={18} /> The little things</span><span><BriefcaseBusiness size={18} /> Business expenses</span></div></div></section>
      <section id="features" className="lp-features lp-section"><div className="lp-container"><div className="lp-section-header"><div><span className="lp-kicker">LESS GUESSWORK. MORE CLARITY.</span><h2>The full picture.<br /><span>Without the extra work.</span></h2></div><p>A clear, considered space for your daily records. Everything you need to understand what you received, what you spent, and what’s left.</p></div><div className="lp-feature-grid">{features.map(({ Icon, title, body, tag }) => <article key={tag} className="lp-feature-card"><span className="lp-feature-icon"><Icon size={24} strokeWidth={1.6} /></span><span className="lp-card-kicker">{tag}</span><h3>{title}</h3><p>{body}</p></article>)}</div></div></section>
      <section id="how-it-works" className="lp-how lp-section"><div className="lp-container lp-how-grid"><div className="lp-how-intro"><span className="lp-kicker">MAKE IT A SMALL DAILY HABIT</span><h2>A few moments.<br />A better picture.</h2><p>You don’t need to be a spreadsheet person. Just start with today.</p><Button asChild className="lp-primary" size="lg"><Link href="/signup/">Create your account</Link></Button></div><div className="lp-steps"><article><span className="lp-step-icon"><LockKeyhole size={22} /></span><div><h3>Make a space of your own</h3><p>Create your account and tell us how you’ll use Hisabivo. A personal ledger, a freelance practice, or your business.</p></div></article><article><span className="lp-step-icon"><Plus size={24} /></span><div><h3>Log the money in and out</h3><p>Add a transaction, choose a category, and carry on with your day. Come back to edit the details whenever you need.</p></div></article><article><span className="lp-step-icon"><ChartNoAxesCombined size={23} /></span><div><h3>Find clarity in the bigger picture</h3><p>Review your month, understand your categories, and download a PDF statement to keep your records together.</p></div></article></div></div></section>
      <section id="who-its-for" className="lp-audiences lp-section"><div className="lp-container"><div className="lp-centered-heading"><span className="lp-kicker">ONE SIMPLE HABIT. MANY WAYS TO USE IT.</span><h2>For the life you live.<br /><span>For the work you do.</span></h2><p>Your household, your side project, your business. Start with the records that matter to you.</p></div><div className="lp-audience-grid">{audiences.map(({ Icon, title, detail, label }) => <article key={label}><span className="lp-audience-icon"><Icon size={27} strokeWidth={1.5} /></span><span className="lp-card-kicker">{label}</span><h3>{title}</h3><p>{detail}</p></article>)}</div><p className="lp-business-note"><CircleHelp size={16} /> Hisabivo keeps individual income and expense records. Shared workspaces, payroll processing, and full accounting tools aren’t included.</p></div></section>
      <section className="lp-faq lp-section"><div className="lp-container lp-faq-grid"><div><span className="lp-kicker">GOOD TO KNOW</span><h2>A little more<br />clarity.</h2><p>The everyday questions, answered.</p><span className="lp-faq-art" aria-hidden="true"><BookOpen size={62} strokeWidth={1} /><Sparkles size={25} strokeWidth={1.3} /></span></div><div className="lp-faq-list"><details><summary>What can I track with Hisabivo?<ChevronDown size={19} /></summary><p>You can record income and expenses with an amount, date, category, payment method, and notes. Ready-to-use categories cover personal, household, family, and business spending, and you can add custom categories.</p></details><details><summary>Can I download a report for any month?<ChevronDown size={19} /></summary><p>Yes. Choose a month to download a PDF with your income, expenses, opening and closing balances, category totals, and transaction details. Reports use the records you’ve entered.</p></details><details><summary>Will other users see my records?<ChevronDown size={19} /></summary><p>Each signed-in account has its own records. Access is restricted to the record owner through database access policies. The public demo uses separate sample data and never adds it to your account.</p></details><details><summary>Is it just for personal expenses?<ChevronDown size={19} /></summary><p>No. Freelancers and businesses can also use Hisabivo as a dedicated income and expense log. Choose your purpose during onboarding. For larger operations, it can sit alongside your existing accounting workflow.</p></details><details><summary>Which currency does it use?<ChevronDown size={19} /></summary><p>This version uses Pakistani rupees (PKR), including paisa. Amounts are stored precisely and shown consistently across the dashboard and PDF reports.</p></details><details><summary>Does Hisabivo offer AI tips?<ChevronDown size={19} /></summary><p>AI features are planned for a later version. This release focuses on accurate records, private accounts, and clear reporting. Your onboarding goals help shape your workspace.</p></details></div></div></section>
      <section className="lp-cta-section"><div className="lp-container"><div className="lp-cta-card"><span className="lp-cta-leaf" aria-hidden="true"><Leaf size={145} strokeWidth={0.65} /></span><div><span className="lp-kicker">A CLEARER PICTURE STARTS WITH TODAY</span><h2>Make room for<br />what matters.</h2><p>Start with one expense. Build a habit you can see.</p></div><div className="lp-cta-actions"><Button asChild size="lg" className="lp-mint-button"><Link href="/signup/">Get started with Hisabivo</Link></Button><Link href="/dashboard/?demo=1">Or take a look around first</Link></div></div></div></section>
    </main>
    <footer className="lp-footer"><div className="lp-container"><div className="lp-footer-top"><Link href="/" aria-label="Hisabivo home"><Brand /></Link><p>Every rupee. A little clearer.</p><nav aria-label="Footer navigation"><a href="#features">Features</a><a href="#who-its-for">Who it’s for</a><Link href="/login/">Sign in</Link></nav></div><div className="lp-footer-bottom"><span>© {new Date().getFullYear()} Hisabivo</span><span><span className="lp-dot lp-dot-green" /> Made for everyday money.</span><span>All amounts in PKR.</span></div></div></footer>
  </div>;
}
