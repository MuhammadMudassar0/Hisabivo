# Hisabivo

Income, expenses, Udhar, accounts, and employee salary records in Pakistani rupees. Built with Next.js, React, TypeScript, Tailwind CSS, shadcn/ui, and Supabase.

Hisabivo includes a public product page, email and Google sign-in, onboarding, separate personal/business workspaces, team roles, monthly PDF reports, forecasting, receipts, CSV tools, and workspace recovery. Money is stored as integer paisa. Balances describe the records you enter; there is no bank connection or automatic payment transfer.

## Run locally

Use **Node.js 24**, as specified by `.nvmrc` and `package.json`.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Set the following before starting the server:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
NEXT_PUBLIC_SITE_URL=
```

`.env.local` is ignored by Git. The supplied local workspace may already contain the project URL and publishable key. A publishable/anon key belongs in the browser; Supabase Auth, database policies, and authenticated functions enforce access. Never put a service-role key, database password, Google client secret, or AI provider secret in a `NEXT_PUBLIC_*` variable.

### Open on a phone

```sh
npm run dev -- --hostname 0.0.0.0 --port 3097
```

Open `http://<your-computer-Wi-Fi-IP>:3097` on a phone connected to the same network. Use the actual address and port for your computer; the Wi-Fi address can change. Keep the development computer awake. The development configuration discovers its local IPv4 interfaces. Add this origin's authentication callback URLs to Supabase if you want to confirm email or reset a password on the phone. An ordinary LAN HTTP origin may not support browser notifications; UUID generation has a fallback for LAN use.

## Complete Supabase setup

For **new and existing projects**, run the **entire** [`public/setup-suite.sql`](public/setup-suite.sql) once in Supabase SQL Editor, then refresh the app. It combines the base schema and feature migrations in their required order, ending with workspace isolation and role policies. Existing financial records are preserved and assigned to their owner's default personal workspace.

Do not stop after an older feature-specific setup script: it may omit newer tables, functions, or the final workspace policies. Keep the full script together when applying this release. Individual migration sources remain in [`supabase/migrations`](supabase/migrations) for review. Back up an existing database before an upgrade.

The setup provisions financial tables, authenticated functions, private receipt storage, and owner/workspace access rules. No privileged Supabase key is needed by the frontend. Applying SQL requires access to the project's SQL Editor; having only the browser publishable key does not apply migrations.

### Authentication and onboarding

1. Enable email/password sign-in under Supabase Authentication. Email confirmation is supported; users confirm their email, return to the app, and complete onboarding.
2. Set Authentication → URL Configuration → Site URL to the deployed app origin. Add the app's `/dashboard/`, `/login/`, and `/reset-password/` URLs to Redirect URLs. Include the exact local or LAN origins and ports you use in development.
3. For Google sign-in, create a Google Cloud OAuth web client. Configure its authorized JavaScript origins and the callback URL shown by Supabase's Google provider, normally `https://<project-ref>.supabase.co/auth/v1/callback`. Store the client ID and secret in Supabase's Google provider settings, enable the provider, and configure the Google consent screen/test users as needed.

A publishable key alone cannot enable Google OAuth. See the official [Google sign-in guide](https://supabase.com/docs/guides/auth/social-sign-in/auth-google) and [redirect URL guide](https://supabase.com/docs/guides/auth/redirect-urls).

Onboarding stores display name, personal/business purpose, business name, referral source/details, and chosen goals. Profile records remain private to their signed-in user. Workspace financial access is enforced in the database, including authenticated functions and Storage policies; hiding a button is not the access boundary.

## Workspaces and team access

A user starts with a default personal workspace and can create additional personal or business workspaces. Financial records have a real `workspace_id`; changing the selected workspace changes the data scope rather than filtering a shared ledger only in the browser. Server policies also validate the selected workspace, parent records, and account assignments. Records cannot be moved to another workspace by changing a row's owner or workspace fields.

| Role | Access |
| --- | --- |
| Owner | Manage the selected workspace's financial records, accounts, schedules, salaries, imports, recovery, and team membership. Review and approve/reject staff proposals. |
| Accountant | Read the invited workspace's ledger and reports, including its private receipts. Cannot change financial records, upload/delete receipts, or invoke owner write functions. |
| Staff | Submit income/paid-expense proposals and review their own proposals. Cannot read the workspace's financial ledger, accounts, or other staff proposals. |

Owners create invitations for a specific email address and choose Accountant or Staff. **Invitation links are shared manually**; the app does not send invitation emails. The recipient must sign in with the invited, verified email and accept the invitation. Links expire after seven days, can be revoked, and cannot be reused to regain access after a member is removed. Each person uses their own account; no shared login is required.

Staff submissions do not affect balances until an owner approves them. Approval creates one financial record; repeated approval requests do not create duplicates. Expected bills, installment histories, and other owner workflows are not accepted as ordinary staff proposals.

## Daily records and actual cash

Record received income and expenses with a date, category/source, payment method, notes, and optional money account. Default categories cover household, family, bike maintenance, fuel, medicine, education, and business costs. Custom categories, income sources, and templates belong to the selected workspace.

- **Paid expense:** counts on its actual paid date.
- **Expected expense:** keeps a planned date and stays outside actual spending and cash until paid.
- **Partial expense:** one bill can have several dated payments. Only the actual payments affect spending and cash, in their respective months. The original bill total is not counted again.
- **Expected income:** appears under Upcoming money rather than received income. Confirm received creates one income record on the actual receipt date. Repeating the same confirmation does not duplicate it.

For example, a November bill partly paid in November and completed in December contributes the respective payments to each cash month. Historical month-end views retain what was unpaid at that time. Editing a tracked bill cannot discard its payment history or reduce its total below recorded payments. Payment history supports confirmed undo; a request identity makes retries safe.

The overview includes **Spent today**, calculated using the Pakistan calendar day and actual payment dates. Its button opens today’s expenses. Expected bills and salary-advance credits are excluded from daily spending; actual installments count only on their payment date.

The full Transactions page defaults to **All time** and shows every matching record. Date filters offer Today, last 7/30 days, a selected month, or inclusive custom dates. Search, type, status and category filters update both the list and its totals. Quick categories include Child expenses, Personal care, and an explicitly combined Bike & fuel filter (Fuel + Bike maintenance). Use Clear filters to return to all records. Scheduled bills can appear by planned date or a payment in the selected period; spending totals use actual payments through today, while unpaid amounts stay separate. Invalid date ranges show an error instead of stale totals.

Desktop users can choose page scrolling or a saved internal table-scroll preference. Mobile uses page-scrolling cards. The overview retains its five-entry monthly preview; its monthly charts and the scope of monthly PDFs are independent of the transaction filters.

### Udhar given and taken

Record money lent or borrowed separately, including the person, principal, date, optional due date, method, account, and notes. Partial/full repayments reduce the outstanding balance. Search, direction/status filters, editing, history, and confirmed deletion are available.

Udhar principal and repayments are **not income or expenses**, but do change recorded cash. Server checks reject overpayments, repayments before the original date, principal edits below repayments, and direction changes after repayment. Outstanding Udhar and its actual cash movements are included in monthly reporting.

### Money accounts and transfers

Maintain Cash, Bank, Easypaisa, and JazzCash accounts, each with a starting balance and starting date. Enter a starting balance **once**; do not also enter it as income. Use a date that avoids overlapping the starting balance with historical movements already entered for that account.

Assign actual receipts, paid expenses/installments, Udhar, and repayments to their real account. A planned bill does not move account money. Transactions without an explicit assignment remain in Unassigned; the app does not guess an account from a payment-method label.

An account transfer creates matching outgoing/incoming movements between two active accounts. It changes individual account balances, leaves total cash unchanged, and is not income or spending. Its request identity prevents duplicate transfers on retry. Account starting balances are included once in recorded cash and forecasts. Archived accounts keep their history.

## Cash forecasting

Forecasts cover 7, 30, or 90 days using recorded account balances, unpaid bills, dated Udhar, expected receipts, and recurring schedules. Generated occurrences are deduplicated against their schedules and linked records.

- **Conservative cash** subtracts expected obligations without assuming that future receipts arrive.
- **Projected / with receipts** also adds the expected incoming amounts shown in the forecast.

Overdue dated obligations are brought to the forecast start rather than silently omitted. Undated Udhar is identified separately because no repayment date can be assumed. Forecasts are planning scenarios, not new transactions, guaranteed collections, or verified bank balances.

## Recurring entries and reminders

Weekly, monthly, and yearly schedules prepare bills and expected income ahead of time. Monthly dates retain the original anchor: a January 31 schedule uses February's final day and returns to March 31. Generated occurrences retain their original amount/category/notes when a schedule changes. Pause stops preparation; resume can catch up. A deleted generated transaction is not recreated merely by preparing the same occurrence again.

The app prepares occurrences when planning loads and after schedule changes. To prepare data while nobody has the app open, optionally run [`public/setup-planning-cron.sql`](public/setup-planning-cron.sql) **after** the complete suite setup. It configures a daily Supabase Cron job at 00:05 Pakistan time. It prepares data only and does not send messages. See Supabase's [Cron installation](https://supabase.com/docs/guides/cron/install) and [scheduling guide](https://supabase.com/docs/guides/cron/quickstart).

The reminder inbox includes unpaid bills, expected receipts, and dated Udhar. Dismiss/snooze choices are private. Browser notifications are opt-in, contain a count rather than financial details, require a compatible secure browser, and work while the app is open. Calendar downloads are event snapshots, not a live subscription. Email, WhatsApp, voice input, and background web-push delivery are not enabled.

## Employees, salary advances, and statements

Use Salaries in the workspace, or the authenticated `/salaries/` route. Add an employee's name, optional role, base pay, allowances, manual deductions, joining date, first salary date, method, and notes. Net pay is base + allowances − manual deductions. A linked monthly Payroll schedule prepares salary bills. Preparing a month repeatedly does not duplicate existing bills.

Salary payments use the same dated installment history as other expenses. The salary register groups bills by their salary period and shows payments against them to date; monthly cash reports instead group actual payments by payment date. Archiving an employee stops future preparation but preserves existing bills/payments, including bills already prepared for a later date. Reactivating resumes the schedule.

**Salary advances** record one paid Payroll cash transaction on the actual grant date. Applying an unused advance to the same employee's salary bill creates a credit against money already paid; it does not create a second cash outflow. Credits must fit the unused advance and unpaid bill, and are never applied automatically. Retrying the same grant/application request does not create another movement.

Salary statement PDFs preserve the original period's name, net amount, and available salary breakdown. Changing today's employee salary does not rewrite an older statement. For historical demo records, a breakdown is used only when the original bill's literal base/allowance/deduction text matches its total; otherwise the statement says that the historical breakdown is unavailable. Current employee pay is never substituted for missing historical figures. Statements distinguish later bill adjustments, cash payments, and advance credits.

This is an employee salary register. Manual deductions do not calculate attendance, statutory payroll withholding, overtime, or salary proration, and the app does not transfer salary payments through a bank.

## Urdu, quick entry, and reports

The workspace language preference is saved in the browser. Core navigation and income/expense logging, transaction statuses, filters, categories, and dates support English and Urdu. Direction/language are scoped to the workspace. Some advanced account, payroll, and administration screens, along with explanatory and error messages, still use English.

Monthly PDFs and salary statements embed the bundled full static **Noto Naskh Arabic** Regular/Bold fonts when Urdu text is present. These fonts cover both Latin currency labels and Urdu text. Arabic shaping and per-text direction are used without reversing numeric table columns. This is Naskh, not Nastaliq. Font files and the SIL Open Font License are in [`public/fonts`](public/fonts).

Monthly statements use the complete selected month, independently of table filters. They separate actual income/expense payments, account transfers, Udhar cash movements, expected items, and month-end outstanding balances. They are readable reports, not restorable backups.

Quick text and reusable templates prepare **drafts only**. Fuel, groceries, and client-receipt examples can be reviewed and adapted before saving. The Roman Urdu helper is deterministic, not AI or voice recognition. Text such as `Ali ko 5 hazar advance` is deliberately ambiguous: the user must choose whether it means an expense, income, or Udhar and confirm the person/date/amount. No generic expense is created automatically.

## Private receipts

Attach JPEG, PNG, WebP, or PDF files up to **5 MB each** to a saved transaction. Filename, MIME type, extension, byte size, and file signature are checked. SVG and arbitrary executable/document formats are not accepted.

Files live in the private `ledger-receipts` bucket under `owner/workspace/entry/file-id.extension`, with corresponding owner/workspace/transaction metadata. Database and Storage rules enforce the selected workspace. Accountants can read scoped receipts, owners can upload/delete, and staff have no receipt access. Downloads use a short-lived signed URL; files are not made public. Deleting a receipt does not delete its transaction. Demo receipts stay in memory for the visit and are never uploaded.

## CSV and workspace backups

### Source CSV

Export source records or preview a CSV before importing. The parser supports UTF-8 BOM, quoted commas, doubled quotes, and quoted newlines. Import is limited to **1,000 rows and 2 MB per batch**, validates every row, and skips exact duplicates by date, type, amount, category, description, and payment method. Notes alone do not distinguish a duplicate. Invalid rows block the batch. Owner-only database import is atomic and retries reuse the same request identity. Spreadsheet formulas are neutralized on export.

A source CSV's expense amount is the **original bill total**, not necessarily cash paid. Tracked installment bills are marked and rejected on basic CSV import, because importing their total as a paid expense would lose payment history and change cash totals. Use a monthly report for cash movements, and a workspace JSON backup to preserve linked installment records. CSV is not a full backup or a way to overwrite existing records.

### Financial workspace JSON backup

Recovery exports a scoped financial graph: account data, transactions and installments, Udhar and repayments, schedules/occurrences, employees, salary advances/statements, templates, and receipt metadata. Authentication identities, team memberships/invitations, and browser-only display preferences are not restored by this financial backup.

Receipt bytes are optional. A metadata-only backup does not contain the actual files; their Storage objects must still exist for downloads to work. Including files is capped at **25 MB of decoded receipt data**. Restore validates all embedded files before changing financial records: owner/workspace/path identity, canonical base64, metadata size/MIME, individual 5 MB limits, total size, and image/PDF signatures.

Restore is restricted to the **same owner and currently selected workspace**. It inserts missing records and their valid linked history, preserving existing records instead of overwriting them with an older backup. Existing payment histories and intentional payment removals are kept. A deleted record is not silently reactivated from a stale backup; use Trash to restore an existing deleted record. Linked occurrence repair is limited to the newly restored graph. Database validation failure rolls back the financial batch.

File uploads happen after the financial restore transaction. If a valid file upload fails, the app reports that records were restored and permits retrying the same backup/request to finish missing files. It never silently replaces an existing private object.

### Trash and audit

Supported financial deletions use soft-deleted records, keeping their linked history recoverable through Trash. Owners can restore records in the selected workspace. Audit entries record actor, action, and before/after data for supported financial changes. Users cannot forge audit entries by inserting them directly. A financial backup restore and an explicit Trash restore serve different purposes; neither is an authentication/account backup.

## Pakistan tax estimate

The dashboard/income dialog include a session-only planning calculator for **Tax Year 2027, 1 July 2026–30 June 2027**, verified against FBR on **24 November 2026**. Enter annual taxable salary from all jobs and other ordinary taxable income explicitly. Ledger receipts do not imply taxability, and personal expenses do not reduce taxable salary here.

The supported scope is Pakistan-resident individuals under the ordinary regime, with total annual taxable income up to **Rs 10 million**. Salary slabs apply only when salary exceeds 75% of combined taxable income. Companies/AOPs, non-residents, pensions, rent, dividends, capital gains, export income, and other special regimes require separate treatment. Figures precede withholding, credits, and other adjustments; a zero estimate does not establish that a return is unnecessary. Tax scenarios remain in the current workspace session and are not stored as transactions or saved to the database. Review rates before supporting another tax year.

Sources: [FBR TY2027 rate card](https://download1.fbr.gov.pk/Docs/202681113864992WithholdingTaxRatesCard2027.pdf), [Income Tax Ordinance amended 30 June 2026](https://download1.fbr.gov.pk/Docs/2026724177725705IncomeTaxOrdinanace2001.pdf), and [official ATL guidance](https://fbr.gov.pk/categ/check-active-taxpayer/51148/30859/71169).

## Demo and deferred features

The demo uses browser sample data and separate demo storage. It never syncs financial records into a real account automatically. Clear demo records in Settings to start again. Demo data is not appropriate storage for sensitive records on a shared device, and an in-memory demo receipt disappears when its component/session is reset.

Profile-based suggestions and quick parsing are deterministic. Live AI and voice features remain deferred; no provider key is needed. Bank feeds, payment processing, statutory accounting/tax filing, invoicing, and inventory quantity management are not provided by category names or the salary register.

## Deploy on Vercel

1. Import the repository into Vercel. Select Next.js, **Node.js 24.x**, and the folder containing this `package.json`. The build command is `npm run build`.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the project's environment settings. Public variables are included at build time, so redeploy after changes.
3. Set `NEXT_PUBLIC_SITE_URL` to the production origin or custom domain. If omitted, SEO can use Vercel's production URL, then its deployment URL. No fictional domain is supplied when no origin is configured.
4. Apply the complete SQL suite, configure Google OAuth if used, and update Supabase Site URL and redirect URLs for the deployed origin.
5. Verify signup/confirmation, password reset, onboarding, workspace switching, and separate users/roles before entering production financial records.

`next.config.ts` uses static export with trailing slashes. Build output is `out/`; Supabase provides authentication, persistence, storage, and database functions. Serve the static output rather than using `next start`. The app does not require a Vercel server route for financial mutations.

The public landing page has title/description metadata, canonical URLs when configured, Open Graph/Twitter previews, WebApplication structured data, a sitemap, and robots rules. Account routes have noindex metadata. These make the site crawlable but do not guarantee rankings. When attaching a custom domain, update Vercel, `NEXT_PUBLIC_SITE_URL`, Supabase callback settings, and Google's authorized origins, then redeploy. See [Vercel environment variables](https://vercel.com/docs/environment-variables).

## Verification

```sh
npm test
npm run typecheck
npm run build
```

Tests cover monetary parsing, actual versus expected/partial timing, recurrence, account transfers and forecasting, salary advances/snapshots, PDF font glyphs, CSV handling, receipt preflight, and UI flows. The following optional integration scripts run a disposable PostgreSQL engine locally, not a live Supabase database:

```sh
HISABIVO_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/workspaces-sql.cjs
HISABIVO_PGLITE_MODULE=/absolute/path/to/node_modules/@electric-sql/pglite node tests/backup-sql.cjs
```

`@electric-sql/pglite` may be installed separately in a disposable directory; `HISABIVO_PGLITE_MODULE` points to that installed package. It is not required by the running app. These checks exercise workspace/role policies, scoped receipts, atomic imports, replay safety, recovery graphs, and migration reruns using real PostgreSQL semantics. PGlite uses one connection here; simultaneous hosted connections, hosted Storage behavior, Google OAuth, and actual notification delivery still require environment-specific checks.

The source review that informed follow-up work is in [`docs/competitive-review.txt`](docs/competitive-review.txt).
