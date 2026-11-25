# Hisabivo

A Next.js income and expense tracker in Pakistani rupees, built with React, TypeScript, Tailwind CSS, shadcn/ui components, and Supabase.

## Run locally

Use Node.js 24 (see `.nvmrc`).

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set these values in `.env.local` before starting:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

The local workspace has already been configured with the supplied project URL and publishable key. `.env.local` is ignored by Git. A publishable/anon key is designed for the browser; database access is enforced by Supabase Auth and row level security. Never add a Supabase service-role key or an AI API key to a `NEXT_PUBLIC_*` variable.

## Supabase setup

1. Open the project's SQL Editor and run [`supabase/schema.sql`](supabase/schema.sql). It creates transactions, custom categories, and onboarding profiles, with owner-only policies. The download at `public/setup.sql` is an identical copy. The script can be rerun for this initial setup; future schema changes should use explicit migrations.
2. Enable email/password authentication. Email confirmation is supported: after confirming their email, users return to the dashboard and complete onboarding.
3. In Authentication → URL Configuration, set Site URL to the app's deployed origin. Add the app's `/dashboard/`, `/login/`, and `/reset-password/` callback URLs to Redirect URLs, including local URLs such as `http://127.0.0.1:3000/dashboard/` and `http://127.0.0.1:3000/reset-password/` for development. Use the exact port printed by the dev server.
4. For Google sign-in, create a Google Cloud OAuth web client. Add your app origin as an authorized JavaScript origin and the callback URL displayed by the Supabase Google provider as an authorized redirect URI (normally `https://<project-ref>.supabase.co/auth/v1/callback`). Configure its client ID and secret in Supabase Authentication → Sign In / Providers → Google, then enable the provider. Configure the Google consent screen and test users if the OAuth app is still in testing.

Google sign-in requires that provider configuration; a browser publishable key alone cannot enable it. See the [official Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [Supabase redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

Onboarding stores the user's display name, purpose, business name, referral source/details, and selected goals in their private profile. Each signed-in user reads and writes only their own profile, transactions, and custom categories. All server queries also filter by user ID. The database policies are the actual access boundary; the UI gate alone is not a security boundary. See [Supabase row level security](https://supabase.com/docs/guides/database/postgres/row-level-security).

Before production use, test with two accounts: create different records under each, confirm each account cannot read/update/delete the other account's record IDs using its own session token, and confirm unauthenticated requests cannot access any of the three tables. The source policies have been reviewed; live cross-account verification requires configured tables and test accounts.

## Open on a phone over Wi-Fi

Run `npm run dev -- --hostname 0.0.0.0 --port 3097`, then open `http://<your-Mac-Wi-Fi-IP>:3097` on a phone connected to the same network. Keep the Mac awake. The development configuration allows the Mac's current local interface addresses. Add that origin's `/dashboard/` and `/reset-password/` URLs to Supabase's Redirect URLs for email confirmation and recovery on the phone. Your Wi-Fi address may change when reconnecting or changing networks.

## Pakistan tax estimate

The dashboard and income-entry dialog include a shared, session-only planning calculator for **Tax Year 2027 (1 July 2026–30 June 2027)**, verified against FBR on **24 November 2026**. Enter expected annual taxable salary from all jobs and other ordinary taxable income explicitly; ledger receipts and personal expenses are never used to infer taxability.

Supported scope is Pakistan-resident individuals in the ordinary regime, up to **Rs 10 million** in total annual taxable income. The calculator uses salary slabs only when salary strictly exceeds 75% of the combined taxable income. It excludes company/AOP, non-resident, pension, rental, dividend, capital-gains, export and other special-regime cases. The amount is an estimate before withholding, credits and other adjustments, not a payment due. Other years and amounts above the cap require a separate review.

Filing guidance distinguishes income-based return requirements from other section 114 conditions and from Active Taxpayer List status. No zero-tax result is presented as proof that filing is unnecessary. Tax scenarios remain in React state within the current user's workspace session; they are not added to browser storage or the database. The rates must be reviewed before supporting another tax year.

Sources: [FBR TY2027 rate card](https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf), [Income Tax Ordinance amended 30 June 2026](https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf), [official ATL check guidance](https://fbr.gov.pk/categ/check-active-taxpayer/51148/30859/71169).

## Udhar given and taken

For an existing Supabase project, run [`supabase/migrations/20261125_udhar.sql`](supabase/migrations/20261125_udhar.sql) once in the SQL Editor. The same script is available at `/setup-udhar.sql`. New projects can run the full `supabase/schema.sql`, which includes these tables. Existing income and expense records are preserved.

Udhar uses separate `ledger_loans` and `ledger_loan_payments` tables with owner-only policies. Record money lent or borrowed, the person, original amount, date, optional expected return date, payment method, and notes. Partial and full repayments update the outstanding amount. Records can be searched and filtered by direction and open/overdue/settled status, edited, or deleted with confirmation.

Loan principal and repayments are kept out of income and expense totals. They do affect opening/closing recorded cash balances and the monthly PDF cash movement details. PDFs also show outstanding Udhar as of the selected month end. These are balances of entered records, not verified bank balances. If the Udhar schema is unavailable, the existing income/expense features continue working; PDF reports clearly state that Udhar is excluded.

Database triggers lock the parent loan before checking repayments and reject overpayments, payments before the loan date, principal edits below the amount already repaid, and direction changes after repayment. Composite ownership keys prevent another user's loan from being used as a repayment target. Local PostgreSQL-engine tests cover RLS and these guards; live multi-connection contention still requires environment-specific verification.

The demo stores its Udhar records separately in the browser and never syncs them into authenticated accounts. Clearing the demo ledger in Settings clears income, expenses, custom categories, loans, and repayments.

## Expected and paid expenses

Existing Supabase projects should run [`supabase/migrations/20261125_expected_expenses.sql`](supabase/migrations/20261125_expected_expenses.sql) once in the SQL Editor. The same script is available at `/setup-expected-expenses.sql`; new projects get it in the full `supabase/schema.sql`. It preserves existing expenses as paid and refreshes the API schema cache.

Choose **Paid** for an expense already spent, or **Expected** for a future/unpaid bill. Expected expenses have a planned date and remain outside paid-spending totals, category charts, and cash balances. **Mark as paid** updates the same record with its actual paid date using an owner-scoped conditional update. A November bill paid in December reduces December cash and spending only; its original planned date is retained. Historical reports list unpaid bills separately as of the selected month end, including bills paid in a later month.

The dashboard includes an expected-expense summary. Transaction filters distinguish Paid and Expected, and monthly PDFs separate planned costs from cash movements. Expected income is managed separately under Upcoming money; ledger income entries represent received money. The sidebar supports a saved desktop collapsed preference and a mobile menu drawer; overview charts offer area/bar views, PKR tooltips, and an interactive paid-category breakdown.

## Recurring entries, expected income, installments, and reminders

For this release, run the complete [`public/setup-planning.sql`](public/setup-planning.sql) in the Supabase SQL Editor. It combines the installment and planning migrations and preserves existing income, paid expenses, expected bills, and Udhar. New projects can use the full `supabase/schema.sql`. Refresh the app after applying the script. It needs no database password or service-role key in the frontend.

- **Expected income:** choose Expected in Add income for a one-off receipt, or create a recurring income schedule. Upcoming money appears on Overview and Recurring & upcoming. It stays outside received income and cash until Confirm received creates one transaction on the actual receipt date. Repeat confirmation requests return the existing receipt. Skipped receipts remain in history.
- **Recurring entries:** weekly, monthly, and yearly schedules prepare expense bills and expected income 30 days ahead. Monthly dates use the original day, clamped to the last day of shorter months; a January 31 schedule returns to March 31 after February. Occurrence snapshots preserve earlier amounts, categories, and notes when the schedule changes. Pause stops preparation; resume catches up missed dates. Existing prepared records remain. Deleting a generated transaction does not regenerate that occurrence. Deleting a schedule keeps its generated expense/received income transactions, but removes unreceived income occurrences.
- **Partial expenses:** an expected bill can have multiple dated payments, each with a method and notes. Its badge shows Expected, Partially paid, or Paid. Payment history supports confirmed undo. The database locks the bill, rejects overpayments, and uses the request UUID to make retries safe. Tracked bill edits cannot remove payment tracking or reduce the total below recorded payments. Legacy paid expenses remain unchanged.
- **Reports:** only actual installments reduce monthly cash/spending and contribute to category charts. PDFs list each payment in its month and show unpaid bill remainders and unreceived income separately as of month end. A payment made next month does not rewrite this month's spending.
- **Reminders:** the private inbox shows bills, expected receipts, and dated Udhar due within seven days, plus overdue items. Outstanding amounts exclude money paid/received. Dismiss and snooze preferences are stored per account. Schedule reminder lead times control when optional browser notices become eligible. Notifications are opt-in, contain only a reminder count, need HTTPS/a compatible browser, and work while the app is open. Calendar downloads provide a separate calendar event with an alert; these are snapshots, not a live subscription. Email, WhatsApp, and background web push are not enabled.
- **Transaction list:** all matching monthly records are displayed on the Transactions page using normal page scrolling. Desktop users can opt into Scroll inside table, with sticky headings and a saved display preference. Mobile cards always scroll with the page. The dashboard previews the five most recent matching entries and links to the full list. Planning/reminder lists and payment history share their page or dialog scroll instead of nesting scroll panels. Filters apply to all records, and totals continue to describe the whole month.

The app prepares occurrences when planning loads and after schedule changes. For automatic preparation while nobody has the app open, also run [`public/setup-planning-cron.sql`](public/setup-planning-cron.sql). This creates one daily Supabase Cron job at 00:05 Pakistan time. It prepares data only; it does not send notifications. Review job execution under Integrations → Cron. Setup follows the official [Cron installation](https://supabase.com/docs/guides/cron/install) and [scheduling instructions](https://supabase.com/docs/guides/cron/quickstart). No Vercel server or secret frontend key is needed.

New tables: `ledger_expense_payments`, `ledger_schedules`, `ledger_occurrences`, and `ledger_reminders`. All have owner-only SELECT policies. Payment/occurrence mutations use narrow authenticated database functions; their tables reject direct authenticated writes. The cross-user preparation worker and daily cron entry point are inaccessible to anonymous/authenticated browser roles. Local PostgreSQL-engine checks cover owner isolation, repeated requests, overpayments, forbidden edits, recurrence deduplication, and rerunning the complete schema. Actual hosted project verification still requires applying the migration.

## Included

- Product landing page and email/Google authentication flows.
- Onboarding and a private dashboard for each user.
- Income and expense records with categories, dates, payment methods, and notes.
- Personal, family, transport, medical, household, and business categories, plus custom categories.
- Monthly totals, carried opening/closing balances, category breakdowns, and transaction filters.
- Downloadable monthly PDF statements with category totals, all transactions for that month, and page numbers.
- Suggested habits tailored to profile goals and recorded totals. These are deterministic suggestions, not AI-generated output.

Money is stored as integer paisa to avoid floating-point decimal errors. Opening and closing balances are calculated from recorded transactions; they are not verified bank balances. Reports use the complete selected month, independent of table search/filter settings. The current PDF font is intended for Latin text; full Urdu text rendering needs an embedded Unicode font.

The demo uses sample records and browser storage, remains separate from authenticated records, and never imports or syncs its data into a user's account automatically. Avoid entering sensitive real records into a demo on a shared device.

## Scope and AI follow-up

This version is a private income and expense log for individual users, including people using it for business expenses. Shared organizations, staff roles, accounting ledgers, tax reporting, invoicing, inventory tracking, and bank connections are not implemented. Category labels such as Inventory or Payroll classify transactions; they do not provide inventory or payroll management.

Live AI is intentionally deferred. A future integration should call a protected server route or Supabase Edge Function, verify the signed-in user, read only that user's records, and keep the provider key in server-side secret storage. Add request limits and explain which information is shared with the provider. Onboarding purpose and goals are already available for personalization.

## Deploy on Vercel

1. Put this project in a Git repository and import it into Vercel. Select **Next.js**, Node.js **24.x**, and the directory containing this `package.json` as the project root. Use the included `npm run build` command.
2. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` to the Vercel project's environment variables. Use the same values as your local `.env.local`.
3. Optionally set `NEXT_PUBLIC_SITE_URL` to the complete production origin, such as `https://your-project.vercel.app`. Otherwise, SEO uses Vercel's production URL automatically. Redeploy after changing build-time environment variables.
4. Deploy, then add the deployed `/dashboard/` and `/reset-password/` URLs to Supabase Authentication → URL Configuration → Redirect URLs, and set Site URL to the deployed origin.
5. Run the SQL setup and configure Google OAuth as described above. Verify registration, email confirmation, login, onboarding, and records under two separate accounts.

The landing page is prerendered with title/description, canonical URL, Open Graph/Twitter preview, WebApplication structured data, a sitemap, and robots rules. Account pages include `noindex` metadata. No fictional canonical domain is used when a production origin is unavailable. These measures make the site crawlable; they do not guarantee search rankings.

When you buy a domain, attach it in Vercel, set `NEXT_PUBLIC_SITE_URL` to that origin, update Supabase Site URL/redirect URLs and Google's authorized origins, and redeploy. Follow [Vercel's environment variable guide](https://vercel.com/docs/environment-variables) and [system URL reference](https://vercel.com/docs/environment-variables/system-environment-variables).

## Verify and build

```sh
npm test
npm run typecheck
npm run build
```

`next.config.ts` uses static export. Production output is written to `out/`; Supabase provides authentication and persistent data storage. Environment variables beginning with `NEXT_PUBLIC_` are included at build time, so rebuild after changing them. Serve `out/` with a static host rather than `next start`.
