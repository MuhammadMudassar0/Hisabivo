-- Optional: prepare recurring bills and expected income while the app is closed.
-- First run setup-planning.sql. Run this as postgres in the Supabase SQL Editor.
-- Official setup: https://supabase.com/docs/guides/cron/install
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('hisabivo-prepare-recurring', '5 19 * * *', 'select public.ledger_prepare_daily();');
-- 19:05 UTC is 00:05 Pakistan time. Same-name scheduling updates the existing job.
-- Inspect results in Integrations > Cron, or query cron.job_run_details.
-- To stop this job: select cron.unschedule('hisabivo-prepare-recurring');
