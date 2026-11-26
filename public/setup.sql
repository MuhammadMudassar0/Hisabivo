-- Run in your Supabase SQL Editor. Uses Supabase Auth; no service-role key needed.
begin;

create table if not exists public.ledger_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense')),
  amount_paisa bigint not null check (amount_paisa > 0 and amount_paisa <= 99999999999),
  category text not null check (char_length(trim(category)) between 1 and 60),
  description text not null check (char_length(trim(description)) between 1 and 100),
  date date not null check (date between '1900-01-01' and '9999-12-31'),
  payment_method text not null check (payment_method in ('Cash', 'Bank transfer', 'Debit / credit card', 'Easypaisa', 'JazzCash')),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 60),
  type text not null check (type in ('income', 'expense')),
  created_at timestamptz not null default now()
);

create table if not exists public.ledger_profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  purpose text not null check (purpose in ('personal', 'freelance', 'small_business', 'growing_business', 'large_business')),
  business_name text not null default '' check (char_length(business_name) <= 100),
  referral_source text not null check (referral_source in ('search', 'social_media', 'friend', 'youtube', 'other')),
  referral_details text not null default '' check (char_length(referral_details) <= 200),
  goals text[] not null check (cardinality(goals) between 1 and 4 and array_position(goals, null) is null and goals <@ array['save_more', 'understand_spending', 'grow_audience', 'manage_cashflow']::text[]),
  currency text not null default 'PKR' check (currency = 'PKR'),
  onboarding_completed_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists ledger_transactions_owner_date on public.ledger_transactions(user_id, date);
do $$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ledger_categories' and column_name='workspace_id') then
  create unique index if not exists ledger_categories_owner_name on public.ledger_categories(user_id,type,lower(trim(name)));
 end if;
end $$;

alter table public.ledger_transactions enable row level security;
alter table public.ledger_categories enable row level security;
alter table public.ledger_profiles enable row level security;

revoke all on public.ledger_transactions, public.ledger_categories from public, anon;
grant select, insert, update, delete on public.ledger_transactions, public.ledger_categories to authenticated;
revoke all on public.ledger_profiles from public, anon;
grant select, insert, update, delete on public.ledger_profiles to authenticated;

drop policy if exists "ledger_owner_transactions" on public.ledger_transactions;
create policy "ledger_owner_transactions" on public.ledger_transactions for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ledger_owner_categories" on public.ledger_categories;
create policy "ledger_owner_categories" on public.ledger_categories for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "ledger_owner_profile" on public.ledger_profiles;
create policy "ledger_owner_profile" on public.ledger_profiles for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

commit;

-- Principal-only Udhar records. Run once in Supabase SQL Editor (safe to rerun).
-- Borrowing, lending, and repayment affect cash, not earned income or expenses.
begin;

create table if not exists public.ledger_loans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  direction text not null check (direction in ('given', 'taken')),
  person text not null check (char_length(person) <= 100 and char_length(trim(person)) >= 1),
  amount_paisa bigint not null check (amount_paisa > 0 and amount_paisa <= 99999999999),
  date date not null check (date between '1900-01-01' and '9999-12-31'),
  due_date date check (due_date between '1900-01-01' and '9999-12-31' and due_date >= date),
  payment_method text not null check (payment_method in ('Cash', 'Bank transfer', 'Debit / credit card', 'Easypaisa', 'JazzCash')),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.ledger_loan_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  loan_id uuid not null,
  amount_paisa bigint not null check (amount_paisa > 0 and amount_paisa <= 99999999999),
  date date not null check (date between '1900-01-01' and '9999-12-31'),
  payment_method text not null check (payment_method in ('Cash', 'Bank transfer', 'Debit / credit card', 'Easypaisa', 'JazzCash')),
  notes text not null default '' check (char_length(notes) <= 500),
  created_at timestamptz not null default now(),
  foreign key (loan_id, user_id) references public.ledger_loans(id, user_id) on delete cascade
);

create index if not exists ledger_loans_owner_date on public.ledger_loans(user_id, date);
create index if not exists ledger_loan_payments_owner_loan on public.ledger_loan_payments(user_id, loan_id);
create index if not exists ledger_loan_payments_owner_date on public.ledger_loan_payments(user_id, date);

alter table public.ledger_loans enable row level security;
alter table public.ledger_loan_payments enable row level security;
revoke all on public.ledger_loans, public.ledger_loan_payments from public, anon;
grant select, insert, update, delete on public.ledger_loans, public.ledger_loan_payments to authenticated;

drop policy if exists "ledger_owner_loans" on public.ledger_loans;
create policy "ledger_owner_loans" on public.ledger_loans for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "ledger_owner_loan_payments" on public.ledger_loan_payments;
create policy "ledger_owner_loan_payments" on public.ledger_loan_payments for all to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- A shared parent-row lock serializes all repayment inserts/updates with each
-- other and with principal/date/direction edits. The sum is read AFTER locking.
create or replace function public.ledger_check_loan_payment()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  parent public.ledger_loans%rowtype;
  already_paid numeric;
begin
  if tg_op = 'UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.loan_id is distinct from old.loan_id) then
    raise exception 'A repayment cannot be moved to another loan or owner.' using errcode = '23514';
  end if;
  select * into parent from public.ledger_loans
    where id = new.loan_id and user_id = new.user_id for update;
  if not found then
    raise exception 'This loan is unavailable to your account.' using errcode = '23503';
  end if;
  if new.date < parent.date then
    raise exception 'A repayment cannot be dated before the loan.' using errcode = '23514';
  end if;
  select coalesce(sum(amount_paisa), 0) into already_paid from public.ledger_loan_payments
    where loan_id = parent.id and user_id = parent.user_id and id <> new.id;
  if already_paid + new.amount_paisa > parent.amount_paisa then
    raise exception 'This repayment is more than the remaining loan balance. Refresh and try again.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create or replace function public.ledger_check_loan_edit()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare
  already_paid numeric;
  first_payment date;
begin
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then
    raise exception 'A loan cannot be moved to another owner.' using errcode = '23514';
  end if;
  -- UPDATE already holds the same parent-row lock used by repayment writers.
  select coalesce(sum(amount_paisa), 0), min(date) into already_paid, first_payment
    from public.ledger_loan_payments where loan_id = old.id and user_id = old.user_id;
  if new.amount_paisa < already_paid then
    raise exception 'The loan amount cannot be less than repayments already recorded.' using errcode = '23514';
  end if;
  if already_paid > 0 and new.direction is distinct from old.direction then
    raise exception 'The loan direction cannot change after repayments have been recorded.' using errcode = '23514';
  end if;
  if first_payment is not null and new.date > first_payment then
    raise exception 'The loan date cannot be after an existing repayment.' using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.ledger_check_loan_payment(), public.ledger_check_loan_edit() from public, anon;
grant execute on function public.ledger_check_loan_payment(), public.ledger_check_loan_edit() to authenticated;
drop trigger if exists ledger_loan_payment_guard on public.ledger_loan_payments;
create trigger ledger_loan_payment_guard before insert or update on public.ledger_loan_payments
  for each row execute function public.ledger_check_loan_payment();
drop trigger if exists ledger_loan_edit_guard on public.ledger_loans;
create trigger ledger_loan_edit_guard before update on public.ledger_loans
  for each row execute function public.ledger_check_loan_edit();

commit;


-- Install after the expected-expenses migration. Safe to rerun.
begin;
alter table public.ledger_transactions add column if not exists expense_status text not null default 'paid';
alter table public.ledger_transactions add column if not exists paid_date date;
alter table public.ledger_transactions add column if not exists payment_tracking boolean not null default false;
update public.ledger_transactions set paid_date=date where type='expense' and expense_status='paid' and paid_date is null and not payment_tracking;
create unique index if not exists ledger_transactions_owner_identity on public.ledger_transactions(id,user_id);
create table if not exists public.ledger_expense_payments (
 id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade,
 expense_id uuid not null, amount_paisa bigint not null check(amount_paisa between 1 and 99999999999),
 date date not null check(date between '1900-01-01' and '9999-12-31'),
 payment_method text not null check(payment_method in ('Cash','Bank transfer','Debit / credit card','Easypaisa','JazzCash')),
 notes text not null default '' check(char_length(notes)<=500), created_at timestamptz not null default now(),
 foreign key(expense_id,user_id) references public.ledger_transactions(id,user_id) on delete cascade
);
alter table public.ledger_expense_payments enable row level security;
revoke all on public.ledger_expense_payments from public,anon,authenticated;
grant select on public.ledger_expense_payments to authenticated;
drop policy if exists ledger_owner_expense_payments on public.ledger_expense_payments;
create policy ledger_owner_expense_payments on public.ledger_expense_payments for select to authenticated using((select auth.uid())=user_id);
create index if not exists ledger_expense_payments_owner on public.ledger_expense_payments(user_id,expense_id,date);
alter table public.ledger_transactions drop constraint if exists ledger_expense_status_valid;
alter table public.ledger_transactions add constraint ledger_expense_status_valid check(expense_status in ('paid','expected','partial'));
alter table public.ledger_transactions drop constraint if exists ledger_expense_payment_metadata;
alter table public.ledger_transactions add constraint ledger_expense_payment_metadata check(
 (type='income' and expense_status='paid' and paid_date is null and not payment_tracking) or
 (type='expense' and ((expense_status in ('expected','partial') and paid_date is null) or (expense_status='paid' and paid_date between '1900-01-01' and '9999-12-31')))
);
-- This trigger also guards direct client updates. Payment totals always win.
create or replace function public.ledger_normalize_expense_payment()
returns trigger language plpgsql security definer set search_path='' as $$
declare total bigint; last_paid date;
begin
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id) then raise exception 'The owner and identity cannot change.'; end if;
 if tg_op='INSERT' and (new.payment_tracking or new.expense_status='partial') then raise exception 'Record installments using the payment action.'; end if;
 if tg_op='UPDATE' then
  if old.payment_tracking and (not new.payment_tracking or new.type<>'expense') then raise exception 'A tracked bill must remain an expense. Remove it to delete its payment history.'; end if;

 end if;
 if new.payment_tracking then
  select coalesce(sum(amount_paisa),0),max(date) into total,last_paid from public.ledger_expense_payments where expense_id=new.id and user_id=new.user_id;
  if tg_op='UPDATE' and not old.payment_tracking and total=0 then raise exception 'Record a payment before enabling installments.'; end if;
  if new.amount_paisa<total then raise exception 'The bill cannot be less than payments already recorded.'; end if;
  new.expense_status:=case when total=new.amount_paisa then 'paid' when total>0 then 'partial' else 'expected' end;
  new.paid_date:=case when total=new.amount_paisa then last_paid else null end;
 elsif new.type='income' then
  if new.expense_status<>'paid' then raise exception 'Only expenses can be marked expected.' using errcode='23514'; end if;
  new.paid_date:=null;
 elsif new.expense_status='expected' then new.paid_date:=null;
 elsif new.expense_status='paid' then new.paid_date:=coalesce(new.paid_date,new.date);
 else raise exception 'Record installments using the payment action.';
 end if;
 return new;
end $$;

drop trigger if exists ledger_expense_payment_normalization on public.ledger_transactions;
create trigger ledger_expense_payment_normalization before insert or update on public.ledger_transactions for each row execute function public.ledger_normalize_expense_payment();
create or replace function public.ledger_record_expense_payment(p_expense uuid,p_amount bigint,p_date date,p_method text,p_notes text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare bill public.ledger_transactions%rowtype; old_payment public.ledger_expense_payments%rowtype; total bigint;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select * into bill from public.ledger_transactions where id=p_expense and user_id=auth.uid() for update;
 if not found or bill.type<>'expense' then raise exception 'This expense is unavailable.' using errcode='42501'; end if;
 select * into old_payment from public.ledger_expense_payments where id=p_request;
 if found then
  if old_payment.user_id=auth.uid() and old_payment.expense_id=p_expense and old_payment.amount_paisa=p_amount and old_payment.date=p_date and old_payment.payment_method=p_method and old_payment.notes=coalesce(p_notes,'') then return p_request; end if;
  raise exception 'This request was already used for a different payment.';
 end if;
 if not bill.payment_tracking and bill.expense_status='paid' then raise exception 'This expense is already paid.'; end if;
 select coalesce(sum(amount_paisa),0) into total from public.ledger_expense_payments where expense_id=p_expense;
 if p_date is null or p_date>(now() at time zone 'Asia/Karachi')::date then raise exception 'Choose an actual payment date, today or earlier.'; end if;
 if p_amount is null or p_amount<=0 or total+p_amount>bill.amount_paisa then raise exception 'Enter an amount no greater than the remaining bill.' using errcode='23514'; end if;
 insert into public.ledger_expense_payments(id,user_id,expense_id,amount_paisa,date,payment_method,notes) values(p_request,auth.uid(),p_expense,p_amount,p_date,p_method,coalesce(p_notes,''));
 update public.ledger_transactions set payment_tracking=true where id=p_expense;
 return p_request;
end $$;
create or replace function public.ledger_remove_expense_payment(p_payment uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare bill_id uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select expense_id into bill_id from public.ledger_expense_payments where id=p_payment and user_id=auth.uid();
 if bill_id is null then raise exception 'Payment unavailable. Refresh your records.'; end if;
 perform 1 from public.ledger_transactions where id=bill_id and user_id=auth.uid() for update;
 delete from public.ledger_expense_payments where id=p_payment and user_id=auth.uid();
 update public.ledger_transactions set payment_tracking=true where id=bill_id;
 return bill_id;
end $$;
revoke all on function public.ledger_record_expense_payment(uuid,bigint,date,text,text,uuid),public.ledger_remove_expense_payment(uuid) from public,anon;
grant execute on function public.ledger_record_expense_payment(uuid,bigint,date,text,text,uuid),public.ledger_remove_expense_payment(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

begin;
create table if not exists public.ledger_schedules (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 type text not null check(type in ('income','expense')),description text not null check(char_length(trim(description)) between 1 and 100),
 category text not null check(char_length(trim(category)) between 1 and 60),amount_paisa bigint not null check(amount_paisa between 1 and 99999999999),
 payment_method text not null check(payment_method in ('Cash','Bank transfer','Debit / credit card','Easypaisa','JazzCash')),
 notes text not null default '' check(char_length(notes)<=500),start_date date not null check(start_date between '1900-01-01' and '9998-12-31'),
 end_date date check(end_date>=start_date and end_date<='9999-12-31'),frequency text not null check(frequency in ('once','weekly','monthly','yearly')),
 reminder_days int not null default 3 check(reminder_days in (0,1,3,7)),active boolean not null default true,created_at timestamptz not null default now(),unique(id,user_id)
);
create table if not exists public.ledger_occurrences (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 schedule_id uuid not null,scheduled_date date not null,status text not null check(status in ('expected','created','skipped')),
 transaction_id uuid references public.ledger_transactions(id) on delete set null,
 type text not null check(type in ('income','expense')),description text not null,category text not null,amount_paisa bigint not null,
 payment_method text not null,notes text not null,created_at timestamptz not null default now(),
 unique(schedule_id,scheduled_date),foreign key(schedule_id,user_id) references public.ledger_schedules(id,user_id) on delete cascade
);
create table if not exists public.ledger_reminders (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,reminder_id text not null check(char_length(reminder_id) between 1 and 150),
 dismissed boolean not null default false,snoozed_until date check(snoozed_until between '1900-01-01' and '9999-12-31'),primary key(user_id,reminder_id)
);
alter table public.ledger_schedules enable row level security;
alter table public.ledger_occurrences enable row level security;
alter table public.ledger_reminders enable row level security;
revoke all on public.ledger_schedules,public.ledger_occurrences,public.ledger_reminders from public,anon,authenticated;
grant select,insert,update,delete on public.ledger_schedules,public.ledger_reminders to authenticated;
grant select on public.ledger_occurrences to authenticated;
drop policy if exists ledger_owner_schedules on public.ledger_schedules;
create policy ledger_owner_schedules on public.ledger_schedules for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
drop policy if exists ledger_owner_occurrences on public.ledger_occurrences;
create policy ledger_owner_occurrences on public.ledger_occurrences for select to authenticated using((select auth.uid())=user_id);
drop policy if exists ledger_owner_reminders on public.ledger_reminders;
create policy ledger_owner_reminders on public.ledger_reminders for all to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
create index if not exists ledger_occurrences_owner on public.ledger_occurrences(user_id,scheduled_date);
create or replace function public.ledger_schedule_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id then raise exception 'Schedule identity and owner cannot change.'; end if;
 if (new.start_date is distinct from old.start_date or new.frequency is distinct from old.frequency or new.type is distinct from old.type) and exists(select 1 from public.ledger_occurrences where schedule_id=old.id) then raise exception 'Create a new schedule to change its start date, frequency, or type. Existing instances keep their details.'; end if;
 return new;
end $$;
drop trigger if exists ledger_schedule_guard on public.ledger_schedules;
create trigger ledger_schedule_guard before update on public.ledger_schedules for each row execute function public.ledger_schedule_edit_guard();

-- Private worker: serialized by schedule row; occurrence uniqueness prevents duplicates.
create or replace function public.ledger_prepare_owner(p_owner uuid,p_through date) returns int language plpgsql security definer set search_path='' as $$
declare rule public.ledger_schedules%rowtype; due date; periods int; i int; n int:=0; tx uuid; occurrence_id uuid;
begin
 if p_through is null or p_through>(now() at time zone 'Asia/Karachi')::date+366 then raise exception 'Choose a preparation horizon within the next year.'; end if;
 for rule in select * from public.ledger_schedules where user_id=p_owner and active and (start_date<=p_through or frequency='once') order by id for update loop
  periods:=case rule.frequency when 'once' then 0 when 'weekly' then (p_through-rule.start_date)/7 when 'monthly' then (extract(year from p_through)::int-extract(year from rule.start_date)::int)*12+extract(month from p_through)::int-extract(month from rule.start_date)::int else extract(year from p_through)::int-extract(year from rule.start_date)::int end;
  for i in 0..least(periods,10000) loop
   due:=case rule.frequency when 'once' then rule.start_date when 'weekly' then rule.start_date+i*7 when 'monthly' then (rule.start_date+make_interval(months=>i))::date else (rule.start_date+make_interval(years=>i))::date end;
   if (rule.frequency<>'once' and due>p_through) or (rule.end_date is not null and due>rule.end_date) then exit; end if;
   occurrence_id:=null;
   insert into public.ledger_occurrences(user_id,schedule_id,scheduled_date,status,type,description,category,amount_paisa,payment_method,notes)
    values(p_owner,rule.id,due,'expected',rule.type,rule.description,rule.category,rule.amount_paisa,rule.payment_method,rule.notes)
    on conflict(schedule_id,scheduled_date) do nothing returning id into occurrence_id;
   if occurrence_id is not null then
    if rule.type='expense' then
     insert into public.ledger_transactions(user_id,type,amount_paisa,category,description,date,payment_method,notes,expense_status,paid_date)
      values(p_owner,'expense',rule.amount_paisa,rule.category,rule.description,due,rule.payment_method,rule.notes,'expected',null) returning id into tx;
     update public.ledger_occurrences set status='created',transaction_id=tx where id=occurrence_id;
    end if;
    n:=n+1;
   end if;
  end loop;
 end loop;
 return n;
end $$;
revoke all on function public.ledger_prepare_owner(uuid,date) from public,anon,authenticated;
create or replace function public.ledger_prepare_schedules(p_through date) returns int language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 return public.ledger_prepare_owner(auth.uid(),p_through);
end $$;
create or replace function public.ledger_confirm_income(p_occurrence uuid,p_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_occurrences%rowtype; tx uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select * into item from public.ledger_occurrences where id=p_occurrence and user_id=auth.uid() for update;
 if not found or item.type<>'income' then raise exception 'Expected income unavailable.' using errcode='42501'; end if;
 if item.status='created' then
  if item.transaction_id is null then raise exception 'This receipt was deleted. Add a new income entry if needed.'; end if;
  return item.transaction_id;
 end if;
 if item.status<>'expected' then raise exception 'This expected income was skipped.'; end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Karachi')::date then raise exception 'Confirm receipt on the actual day received, today or earlier.'; end if;
 insert into public.ledger_transactions(user_id,type,amount_paisa,description,category,date,payment_method,notes) values(auth.uid(),'income',item.amount_paisa,item.description,item.category,p_date,item.payment_method,item.notes) returning id into tx;
 update public.ledger_occurrences set status='created',transaction_id=tx where id=p_occurrence;
 return tx;
end $$;
create or replace function public.ledger_skip_occurrence(p_occurrence uuid) returns void language plpgsql security definer set search_path='' as $$
declare item public.ledger_occurrences%rowtype; bill public.ledger_transactions%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501'; end if;
 select * into item from public.ledger_occurrences where id=p_occurrence and user_id=auth.uid() for update;
 if not found then raise exception 'Expected item unavailable.' using errcode='42501'; end if;
 if item.status='skipped' then return; end if;
 if item.type='income' and item.status='created' then raise exception 'Received income cannot be skipped. Edit its transaction instead.'; end if;
 if item.type='expense' and item.transaction_id is not null then
  select * into bill from public.ledger_transactions where id=item.transaction_id and user_id=auth.uid() for update;
  if found and (bill.expense_status<>'expected' or bill.payment_tracking) then raise exception 'A bill with payments cannot be skipped.'; end if;
  delete from public.ledger_transactions where id=item.transaction_id and user_id=auth.uid();
 end if;
 update public.ledger_occurrences set status='skipped',transaction_id=null where id=p_occurrence;
end $$;
-- Optional daily cron entry point. Never callable from a browser session.
create or replace function public.ledger_prepare_daily() returns int language plpgsql security definer set search_path='' as $$
declare owner_id uuid;n int:=0;
begin
 for owner_id in select distinct user_id from public.ledger_schedules where active loop n:=n+public.ledger_prepare_owner(owner_id,(now() at time zone 'Asia/Karachi')::date+30); end loop;
 return n;
end $$;
revoke all on function public.ledger_prepare_daily() from public,anon,authenticated;
revoke all on function public.ledger_prepare_schedules(date),public.ledger_confirm_income(uuid,date),public.ledger_skip_occurrence(uuid) from public,anon;
grant execute on function public.ledger_prepare_schedules(date),public.ledger_confirm_income(uuid,date),public.ledger_skip_occurrence(uuid) to authenticated;
notify pgrst,'reload schema';
commit;

-- Apply after setup-planning.sql. Salary payments reuse the existing expense ledger.
begin;
create table if not exists public.ledger_employees (
 id uuid primary key,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),role text not null default '' check(char_length(role)<=80),
 base_paisa bigint not null check(base_paisa between 1 and 99999999999),allowance_paisa bigint not null default 0 check(allowance_paisa between 0 and 99999999999),
 deduction_paisa bigint not null default 0 check(deduction_paisa between 0 and 99999999999),
 joining_date date not null check(joining_date between '1900-01-01' and '9998-12-31'),notes text not null default '' check(char_length(notes)<=300),
 schedule_id uuid not null unique,archived_at timestamptz,created_at timestamptz not null default now(),
 check(base_paisa+allowance_paisa-deduction_paisa between 1 and 99999999999),
 foreign key(schedule_id,user_id) references public.ledger_schedules(id,user_id) on delete no action
);
alter table public.ledger_employees enable row level security;
revoke all on public.ledger_employees from public,anon,authenticated;
grant select on public.ledger_employees to authenticated;
drop policy if exists ledger_owner_employees on public.ledger_employees;
create policy ledger_owner_employees on public.ledger_employees for select to authenticated using((select auth.uid())=user_id);
create index if not exists ledger_employees_owner on public.ledger_employees(user_id,name);

create or replace function public.ledger_salary_schedule_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;
begin
 select * into employee from public.ledger_employees where schedule_id=old.id;
 if found then
  if new.type<>'expense' or new.frequency<>'monthly' or new.category<>'Payroll' or new.description<>('Salary — '||employee.name) or new.amount_paisa<>employee.base_paisa+employee.allowance_paisa-employee.deduction_paisa then raise exception 'Edit employee salary details from the Salaries page.'; end if;
  if employee.archived_at is not null and new.active then raise exception 'Reactivate this employee from the Salaries page first.'; end if;
 end if;return new;
end $$;
drop trigger if exists ledger_salary_schedule_guard on public.ledger_schedules;
create trigger ledger_salary_schedule_guard before update on public.ledger_schedules for each row execute function public.ledger_salary_schedule_guard();

create or replace function public.ledger_salary_bill_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.type<>'expense' or new.category<>'Payroll') and exists(select 1 from public.ledger_occurrences o join public.ledger_employees e on e.schedule_id=o.schedule_id where o.transaction_id=old.id and o.user_id=old.user_id) then raise exception 'Salary bills must remain Payroll expenses.';end if;
 return new;
end $$;
drop trigger if exists ledger_salary_bill_guard on public.ledger_transactions;
create trigger ledger_salary_bill_guard before update on public.ledger_transactions for each row execute function public.ledger_salary_bill_guard();

create or replace function public.ledger_save_employee(p_id uuid,p_name text,p_role text,p_base bigint,p_allowance bigint,p_deduction bigint,p_joining date,p_first_pay date,p_method text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;schedule_id uuid;net bigint;salary_notes text;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_id is null then raise exception 'A request identity is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into employee from public.ledger_employees where id=p_id;
 if found and employee.user_id<>auth.uid() then raise exception 'Employee unavailable.' using errcode='42501';end if;
 if employee.archived_at is not null then raise exception 'Reactivate this employee before editing salary details.';end if;
 if p_joining is null or p_first_pay is null or p_first_pay<p_joining or p_first_pay>'9998-12-31' then raise exception 'The first salary date must be on or after joining.';end if;
 net:=p_base+p_allowance-p_deduction;
 if net is null or net<=0 or net>99999999999 then raise exception 'Enter a positive net salary within the supported PKR limit.';end if;
 salary_notes:=format('Base PKR %s | Allowances PKR %s | Manual deductions PKR %s%s',p_base/100.0,p_allowance/100.0,p_deduction/100.0,case when coalesce(p_notes,'')='' then '' else E'\n'||p_notes end);
 if employee.id is null then
  insert into public.ledger_schedules(user_id,type,description,category,amount_paisa,payment_method,notes,start_date,frequency,reminder_days) values(auth.uid(),'expense','Salary — '||trim(p_name),'Payroll',net,p_method,salary_notes,p_first_pay,'monthly',3) returning id into schedule_id;
  insert into public.ledger_employees(id,user_id,name,role,base_paisa,allowance_paisa,deduction_paisa,joining_date,notes,schedule_id) values(p_id,auth.uid(),trim(p_name),trim(coalesce(p_role,'')),p_base,p_allowance,p_deduction,p_joining,coalesce(p_notes,''),schedule_id);
 else
  perform 1 from public.ledger_schedules where id=employee.schedule_id and user_id=auth.uid() for update;
  update public.ledger_employees set name=trim(p_name),role=trim(coalesce(p_role,'')),base_paisa=p_base,allowance_paisa=p_allowance,deduction_paisa=p_deduction,joining_date=p_joining,notes=coalesce(p_notes,'') where id=p_id;
  update public.ledger_schedules set description='Salary — '||trim(p_name),amount_paisa=net,payment_method=p_method,notes=salary_notes,start_date=p_first_pay where id=employee.schedule_id;
 end if;return p_id;
end $$;
create or replace function public.ledger_archive_employee(p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into employee from public.ledger_employees where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Employee unavailable.' using errcode='42501';end if;
 perform 1 from public.ledger_schedules where id=employee.schedule_id for update;
 update public.ledger_employees set archived_at=case when p_archived then coalesce(archived_at,now()) else null end where id=p_id;
 update public.ledger_schedules set active=not p_archived where id=employee.schedule_id;
end $$;
create or replace function public.ledger_prepare_salaries(p_month date) returns int language plpgsql security definer set search_path='' as $$
declare rule public.ledger_schedules%rowtype;due date;occurrence_id uuid;tx uuid;n int:=0;last_day date;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'1900-01-01' or p_month>'9998-12-01' or p_month>(now() at time zone 'Asia/Karachi')::date+366 then raise exception 'Choose a salary month no more than one year ahead.';end if;
 last_day:=(p_month+interval '1 month - 1 day')::date;
 for rule in select s.* from public.ledger_schedules s join public.ledger_employees e on e.schedule_id=s.id and e.user_id=s.user_id where s.user_id=auth.uid() and s.active and e.archived_at is null order by s.id for update of s loop
  due:=p_month+(least(extract(day from rule.start_date)::int,extract(day from last_day)::int)-1);
  if due<rule.start_date or (rule.end_date is not null and due>rule.end_date) then continue;end if;
  occurrence_id:=null;
  insert into public.ledger_occurrences(user_id,schedule_id,scheduled_date,status,type,description,category,amount_paisa,payment_method,notes) values(auth.uid(),rule.id,due,'expected','expense',rule.description,'Payroll',rule.amount_paisa,rule.payment_method,rule.notes) on conflict(schedule_id,scheduled_date) do nothing returning id into occurrence_id;
  if occurrence_id is not null then
   insert into public.ledger_transactions(user_id,type,description,category,amount_paisa,date,payment_method,notes,expense_status) values(auth.uid(),'expense',rule.description,'Payroll',rule.amount_paisa,due,rule.payment_method,rule.notes,'expected') returning id into tx;
   update public.ledger_occurrences set status='created',transaction_id=tx where id=occurrence_id;n:=n+1;
  end if;
 end loop;return n;
end $$;
revoke all on function public.ledger_salary_schedule_guard(),public.ledger_salary_bill_guard(),public.ledger_save_employee(uuid,text,text,bigint,bigint,bigint,date,date,text,text),public.ledger_archive_employee(uuid,boolean),public.ledger_prepare_salaries(date) from public,anon;
grant execute on function public.ledger_save_employee(uuid,text,text,bigint,bigint,bigint,date,date,text,text),public.ledger_archive_employee(uuid,boolean),public.ledger_prepare_salaries(date) to authenticated;
notify pgrst,'reload schema';
commit;

-- HISABIVO EXTENDED SUITE

-- 20261127_accounts.sql
-- Install after setup-planning.sql and setup-udhar.sql. Safe to rerun.
begin;
create table if not exists public.ledger_accounts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 60),kind text not null check(kind in ('cash','bank','easypaisa','jazzcash')),
 opening_balance_paisa bigint not null default 0 check(opening_balance_paisa between -99999999999 and 99999999999),
 opening_date date not null check(opening_date between '1900-01-01' and '9999-12-31'),archived boolean not null default false,
 created_at timestamptz not null default now(),unique(id,user_id)
);
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ledger_accounts' and column_name='workspace_id') then
  drop index if exists public.ledger_accounts_owner_name;
  execute 'create unique index if not exists ledger_accounts_workspace_name on public.ledger_accounts(workspace_id,lower(trim(name)))';
 else create unique index if not exists ledger_accounts_owner_name on public.ledger_accounts(user_id,lower(trim(name)));
 end if;
end $$;
create table if not exists public.ledger_account_transfers (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 from_account_id uuid not null,to_account_id uuid not null,amount_paisa bigint not null check(amount_paisa between 1 and 99999999999),
 date date not null check(date between '1900-01-01' and '9999-12-31'),notes text not null default '' check(char_length(notes)<=500),
 request_id uuid not null unique,created_at timestamptz not null default now(),check(from_account_id<>to_account_id),check(id=request_id),
 foreign key(from_account_id,user_id) references public.ledger_accounts(id,user_id),foreign key(to_account_id,user_id) references public.ledger_accounts(id,user_id)
);
create index if not exists ledger_account_transfers_owner_date on public.ledger_account_transfers(user_id,date);
alter table public.ledger_transactions add column if not exists account_id uuid references public.ledger_accounts(id);
alter table public.ledger_expense_payments add column if not exists account_id uuid references public.ledger_accounts(id);
alter table public.ledger_loans add column if not exists account_id uuid references public.ledger_accounts(id);
alter table public.ledger_loan_payments add column if not exists account_id uuid references public.ledger_accounts(id);
alter table public.ledger_accounts enable row level security;
alter table public.ledger_account_transfers enable row level security;
revoke all on public.ledger_accounts,public.ledger_account_transfers from public,anon,authenticated;
grant select,insert,update on public.ledger_accounts to authenticated;
grant select on public.ledger_account_transfers to authenticated;
drop policy if exists ledger_owner_accounts_read on public.ledger_accounts;
drop policy if exists ledger_owner_accounts_insert on public.ledger_accounts;
drop policy if exists ledger_owner_accounts_update on public.ledger_accounts;
drop policy if exists ledger_owner_transfers_read on public.ledger_account_transfers;
-- The last workspaces migration replaces these policies with workspace-scoped policies.
do $$ begin
 if exists(select 1 from information_schema.columns where table_schema='public' and table_name='ledger_accounts' and column_name='workspace_id') then
  if to_regprocedure('public.ledger_can_read_workspace(uuid,uuid)') is null or to_regprocedure('public.ledger_can_write_owner(uuid,uuid)') is null then raise exception 'Complete the workspaces migration before reinstalling accounts.';end if;
  execute 'create policy ledger_owner_accounts_read on public.ledger_accounts for select to authenticated using(public.ledger_can_read_workspace(user_id,workspace_id))';
  execute 'create policy ledger_owner_accounts_insert on public.ledger_accounts for insert to authenticated with check(public.ledger_can_write_owner(user_id,workspace_id))';
  execute 'create policy ledger_owner_accounts_update on public.ledger_accounts for update to authenticated using(public.ledger_can_write_owner(user_id,workspace_id)) with check(public.ledger_can_write_owner(user_id,workspace_id))';
  execute 'create policy ledger_owner_transfers_read on public.ledger_account_transfers for select to authenticated using(public.ledger_can_read_workspace(user_id,workspace_id))';
 elsif to_regprocedure('public.ledger_can_read_owner(uuid)') is not null then
  execute 'create policy ledger_owner_accounts_read on public.ledger_accounts for select to authenticated using(public.ledger_can_read_owner(user_id))';
  execute 'create policy ledger_owner_transfers_read on public.ledger_account_transfers for select to authenticated using(public.ledger_can_read_owner(user_id))';
  create policy ledger_owner_accounts_insert on public.ledger_accounts for insert to authenticated with check((select auth.uid())=user_id);
  create policy ledger_owner_accounts_update on public.ledger_accounts for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
 else
  create policy ledger_owner_accounts_read on public.ledger_accounts for select to authenticated using((select auth.uid())=user_id);
  create policy ledger_owner_accounts_insert on public.ledger_accounts for insert to authenticated with check((select auth.uid())=user_id);
  create policy ledger_owner_accounts_update on public.ledger_accounts for update to authenticated using((select auth.uid())=user_id) with check((select auth.uid())=user_id);
  create policy ledger_owner_transfers_read on public.ledger_account_transfers for select to authenticated using((select auth.uid())=user_id);
 end if;
end $$;

-- Optional workspace support is discovered dynamically so this migration also installs independently.
create or replace function public.ledger_account_context_matches(p_row jsonb) returns boolean language plpgsql security definer set search_path='' as $$
declare selected_id uuid;
begin
 if auth.uid() is null or p_row->>'workspace_id' is null or to_regprocedure('public.ledger_current_workspace()') is null then return true;end if;
 execute 'select public.ledger_current_workspace()' into selected_id;
 return selected_id is not null and p_row->>'workspace_id'=selected_id::text;
end $$;

create or replace function public.ledger_guard_account_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare account public.ledger_accounts%rowtype;row_data jsonb;old_data jsonb;movement_date date;
begin
 row_data:=to_jsonb(new);if row_data->>'account_id' is null then return new;end if;
 select * into account from public.ledger_accounts where id=(row_data->>'account_id')::uuid for share;
 if not found or account.user_id<>new.user_id then raise exception 'Choose an account from the same workspace owner.' using errcode='23514';end if;
 if tg_op='UPDATE' then old_data:=to_jsonb(old);end if;
 if account.archived and (tg_op='INSERT' or old_data->>'account_id' is distinct from row_data->>'account_id') then raise exception 'Choose an active account.';end if;
 if row_data->>'workspace_id' is not null and to_jsonb(account)->>'workspace_id' is distinct from row_data->>'workspace_id' then raise exception 'Choose an account from this workspace.' using errcode='42501';end if;
 if not public.ledger_account_context_matches(to_jsonb(account)) then raise exception 'This account is outside the selected workspace.' using errcode='42501';end if;
 if tg_table_name='ledger_transactions' and row_data->>'type'='expense' and (coalesce((row_data->>'payment_tracking')::boolean,false) or row_data->>'expense_status' in ('expected','partial')) then movement_date:=null;
 elsif tg_table_name='ledger_transactions' and row_data->>'type'='expense' then movement_date:=coalesce((row_data->>'paid_date')::date,(row_data->>'date')::date);
 else movement_date:=(row_data->>'date')::date;end if;
 if movement_date<account.opening_date then raise exception 'The movement date cannot be before this account starting balance date.' using errcode='23514';end if;
 return new;
end $$;
do $$ declare table_name text;begin
 foreach table_name in array array['ledger_transactions','ledger_expense_payments','ledger_loans','ledger_loan_payments'] loop
  execute format('drop trigger if exists ledger_account_assignment on public.%I',table_name);
  execute format('create trigger ledger_account_assignment before insert or update on public.%I for each row execute function public.ledger_guard_account_assignment()',table_name);
 end loop;
end $$;

create or replace function public.ledger_account_edit_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.opening_date>(now() at time zone 'Asia/Karachi')::date then raise exception 'Choose a starting balance date today or earlier.';end if;
 if tg_op='UPDATE' then
  if new.id is distinct from old.id or new.user_id is distinct from old.user_id then raise exception 'Account identity and owner cannot change.';end if;
  if (new.opening_date is distinct from old.opening_date or new.opening_balance_paisa is distinct from old.opening_balance_paisa) and (
   exists(select 1 from public.ledger_transactions where account_id=old.id) or exists(select 1 from public.ledger_expense_payments where account_id=old.id)
   or exists(select 1 from public.ledger_loans where account_id=old.id) or exists(select 1 from public.ledger_loan_payments where account_id=old.id)
   or exists(select 1 from public.ledger_account_transfers where from_account_id=old.id or to_account_id=old.id)
  ) then raise exception 'Starting balance and date cannot change after this account has activity.';end if;
 end if;return new;
end $$;
drop trigger if exists ledger_account_edit_guard on public.ledger_accounts;
create trigger ledger_account_edit_guard before insert or update on public.ledger_accounts for each row execute function public.ledger_account_edit_guard();

create or replace function public.ledger_record_account_transfer(p_owner uuid,p_from uuid,p_to uuid,p_amount bigint,p_date date,p_notes text,p_request uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare source public.ledger_accounts%rowtype;destination public.ledger_accounts%rowtype;existing public.ledger_account_transfers%rowtype;
begin
 if auth.uid() is null or p_owner is null or auth.uid()<>p_owner then raise exception 'Only the workspace owner can record transfers.' using errcode='42501';end if;
 if p_request is null then raise exception 'A transfer request identity is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into existing from public.ledger_account_transfers where id=p_request;
 if found then
  if existing.user_id=p_owner and existing.from_account_id=p_from and existing.to_account_id=p_to and existing.amount_paisa=p_amount and existing.date=p_date and existing.notes=trim(coalesce(p_notes,'')) and public.ledger_account_context_matches(to_jsonb(existing)) then return existing.id;end if;
  raise exception 'This request was already used for another transfer.';
 end if;
 if p_from is null or p_to is null or p_from=p_to then raise exception 'Choose two different active accounts.';end if;
 perform 1 from public.ledger_accounts where id in(p_from,p_to) and user_id=p_owner order by id for update;
 select * into source from public.ledger_accounts where id=p_from and user_id=p_owner;
 select * into destination from public.ledger_accounts where id=p_to and user_id=p_owner;
 if source.id is null or destination.id is null or source.archived or destination.archived then raise exception 'Choose two active accounts from this workspace.' using errcode='42501';end if;
 if not public.ledger_account_context_matches(to_jsonb(source)) or not public.ledger_account_context_matches(to_jsonb(destination)) or to_jsonb(source)->>'workspace_id' is distinct from to_jsonb(destination)->>'workspace_id' then raise exception 'Accounts must be in the selected workspace.' using errcode='42501';end if;
 if p_amount is null or p_amount<=0 or p_amount>99999999999 or p_date is null or p_date>(now() at time zone 'Asia/Karachi')::date or p_date<source.opening_date or p_date<destination.opening_date then raise exception 'Check the positive amount and actual transfer date.' using errcode='23514';end if;
 insert into public.ledger_account_transfers(id,user_id,from_account_id,to_account_id,amount_paisa,date,notes,request_id) values(p_request,p_owner,p_from,p_to,p_amount,p_date,trim(coalesce(p_notes,'')),p_request);
 return p_request;
end $$;
revoke all on function public.ledger_account_context_matches(jsonb),public.ledger_guard_account_assignment(),public.ledger_account_edit_guard() from public,anon,authenticated;
revoke all on function public.ledger_record_account_transfer(uuid,uuid,uuid,bigint,date,text,uuid) from public,anon;
grant execute on function public.ledger_record_account_transfer(uuid,uuid,uuid,bigint,date,text,uuid) to authenticated;
-- Confirm an expected receipt and assign its actual cash account atomically.
create or replace function public.ledger_confirm_account_income(p_occurrence uuid,p_date date,p_account uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_occurrences%rowtype;entry public.ledger_transactions%rowtype;result uuid;
begin
 select * into item from public.ledger_occurrences where id=p_occurrence for update;
 if not found or auth.uid() is null or item.user_id<>auth.uid() or not public.ledger_account_context_matches(to_jsonb(item)) then raise exception 'This receipt is outside your selected owner workspace.' using errcode='42501';end if;
 if item.status='created' then
  select * into entry from public.ledger_transactions where id=item.transaction_id;
  if not found or entry.account_id is distinct from p_account or entry.date is distinct from p_date then raise exception 'This receipt was already confirmed with different details.';end if;
  return entry.id;
 end if;
 result:=public.ledger_confirm_income(p_occurrence,p_date);
 update public.ledger_transactions set account_id=p_account where id=result;
 return result;
end $$;
revoke all on function public.ledger_confirm_account_income(uuid,date,uuid) from public,anon;
grant execute on function public.ledger_confirm_account_income(uuid,date,uuid) to authenticated;

notify pgrst,'reload schema';
commit;


-- 20261127_productivity.sql
-- Templates, private receipts, and atomic source-CSV import.
-- Apply before 20261127_workspaces.sql, which supplies final workspace policies.
begin;
create unique index if not exists ledger_transactions_owner_identity on public.ledger_transactions(id,user_id);

create table if not exists public.ledger_templates (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 workspace_id uuid not null,name text not null check(char_length(trim(name)) between 1 and 60),
 type text not null check(type in ('income','expense')),amount_paisa bigint check(amount_paisa between 1 and 99999999999),
 description text not null check(char_length(trim(description)) between 1 and 100),category text not null check(char_length(trim(category)) between 1 and 60),
 payment_method text not null check(payment_method in ('Cash','Bank transfer','Debit / credit card','Easypaisa','JazzCash')),
 created_at timestamptz not null default now()
);
create unique index if not exists ledger_templates_owner_workspace_name on public.ledger_templates(user_id,workspace_id,lower(trim(name)));

create table if not exists public.ledger_receipts (
 id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 workspace_id uuid not null,entry_id uuid not null,object_path text not null unique,
 file_name text not null check(char_length(file_name) between 1 and 120 and file_name !~ '[\\/[:cntrl:]]'),
 mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp','application/pdf')),
 size_bytes bigint not null check(size_bytes between 1 and 5242880),created_at timestamptz not null default now(),
 foreign key(entry_id,user_id) references public.ledger_transactions(id,user_id) on delete cascade,
 check(object_path=user_id::text||'/'||workspace_id::text||'/'||entry_id::text||'/'||id::text||'.'||case mime_type when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' else 'pdf' end)
);
create index if not exists ledger_receipts_owner_entry on public.ledger_receipts(user_id,workspace_id,entry_id);

create table if not exists public.ledger_import_batches (
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,workspace_id uuid not null,request_id uuid not null,
 payload jsonb not null,result jsonb not null,created_at timestamptz not null default now(),primary key(user_id,workspace_id,request_id)
);

alter table public.ledger_templates enable row level security;
alter table public.ledger_receipts enable row level security;
alter table public.ledger_import_batches enable row level security;
revoke all on public.ledger_templates,public.ledger_receipts,public.ledger_import_batches from public,anon;
grant select,insert,delete on public.ledger_templates,public.ledger_receipts to authenticated;
grant select,insert on public.ledger_import_batches to authenticated;
drop policy if exists ledger_templates_owner on public.ledger_templates;
create policy ledger_templates_owner on public.ledger_templates for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists ledger_receipts_owner on public.ledger_receipts;
create policy ledger_receipts_owner on public.ledger_receipts for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists ledger_import_batches_owner on public.ledger_import_batches;
create policy ledger_import_batches_owner on public.ledger_import_batches for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('ledger-receipts','ledger-receipts',false,5242880,array['image/jpeg','image/png','image/webp','application/pdf'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists ledger_receipts_storage_read on storage.objects;
create policy ledger_receipts_storage_read on storage.objects for select to authenticated using(bucket_id='ledger-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists ledger_receipts_storage_insert on storage.objects;
create policy ledger_receipts_storage_insert on storage.objects for insert to authenticated with check(bucket_id='ledger-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists ledger_receipts_storage_delete on storage.objects;
create policy ledger_receipts_storage_delete on storage.objects for delete to authenticated using(bucket_id='ledger-receipts' and (storage.foldername(name))[1]=(select auth.uid())::text);

create or replace function public.ledger_import_csv(p_rows jsonb,p_request uuid,p_workspace uuid) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare previous public.ledger_import_batches%rowtype;item jsonb;status text;paid_on date;inserted_ids jsonb:='[]'::jsonb;new_id uuid;skipped int:=0;result jsonb;
begin
 if auth.uid() is null then raise exception 'Sign in before importing records.';end if;
 if p_workspace is null or p_request is null then raise exception 'Choose a workspace and import request.';end if;
 if to_regprocedure('public.ledger_can_write_owner(uuid,uuid)') is null then raise exception 'Complete the workspace database setup before importing.';end if;
 if not public.ledger_can_write_owner(auth.uid(),p_workspace) then raise exception 'Only the owner of the selected workspace can import records.';end if;
 if jsonb_typeof(p_rows)<>'array' then raise exception 'Provide a CSV row array.';end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 or octet_length(p_rows::text)>2000000 then raise exception 'Import 1–1,000 records in a batch no larger than 2 MB.';end if;
 perform pg_advisory_xact_lock(hashtextextended('ledger-csv:'||auth.uid()::text||':'||p_workspace::text,0));
 select * into previous from public.ledger_import_batches where user_id=auth.uid() and workspace_id=p_workspace and request_id=p_request;
 if found then
  if previous.payload<>p_rows then raise exception 'This request was already used for a different batch.';end if;
  return previous.result;
 end if;
 for item in select value from jsonb_array_elements(p_rows) loop
  if jsonb_typeof(item)<>'object' then raise exception 'Each CSV row must be an object.';end if;
  status:=coalesce(item->>'expense_status','paid');
  if status not in ('paid','expected') or coalesce(item->>'payment_tracking','false')<>'false' or (item ? 'payments') then raise exception 'Tracked installment bills cannot be imported without their payment history.';end if;
  if item->>'type' not in ('income','expense') then raise exception 'Choose income or expense.';end if;
  if item->>'type'='income' and (status<>'paid' or nullif(item->>'paid_date','') is not null) then raise exception 'Income cannot have expected payment metadata.';end if;
  if jsonb_typeof(item->'amount_paisa')<>'number' or (item->>'amount_paisa') !~ '^[1-9][0-9]{0,10}$' then raise exception 'Use a positive integer amount in paisa.';end if;
  if nullif(trim(item->>'description'),'') is null or nullif(trim(item->>'category'),'') is null or nullif(item->>'date','') is null or nullif(item->>'payment_method','') is null then raise exception 'A required CSV field is missing.';end if;
  paid_on:=case when item->>'type'='expense' and status='paid' then coalesce(nullif(item->>'paid_date','')::date,(item->>'date')::date) else null end;
  if exists(select 1 from public.ledger_transactions e where e.user_id=auth.uid() and e.workspace_id=p_workspace and e.type=item->>'type' and e.date=(item->>'date')::date and e.amount_paisa=(item->>'amount_paisa')::bigint and e.category=trim(item->>'category') and e.description=trim(item->>'description') and e.payment_method=item->>'payment_method') then skipped:=skipped+1;continue;end if;
  insert into public.ledger_transactions(user_id,workspace_id,type,amount_paisa,category,description,date,payment_method,notes,expense_status,paid_date)
  values(auth.uid(),p_workspace,item->>'type',(item->>'amount_paisa')::bigint,trim(item->>'category'),trim(item->>'description'),(item->>'date')::date,item->>'payment_method',coalesce(item->>'notes',''),status,paid_on) returning id into new_id;
  inserted_ids:=inserted_ids||jsonb_build_array(new_id);
 end loop;
 result:=jsonb_build_object('inserted',jsonb_array_length(inserted_ids),'skipped',skipped,'ids',inserted_ids);
 insert into public.ledger_import_batches(user_id,workspace_id,request_id,payload,result) values(auth.uid(),p_workspace,p_request,p_rows,result);
 return result;
end;$$;
revoke all on function public.ledger_import_csv(jsonb,uuid,uuid) from public,anon;
grant execute on function public.ledger_import_csv(jsonb,uuid,uuid) to authenticated;
commit;


-- 20261127_salary_extras.sql
begin;
alter table public.ledger_transactions add column if not exists deleted_at timestamptz;
create table if not exists public.ledger_salary_advances (
 id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,
 employee_id uuid not null references public.ledger_employees(id),transaction_id uuid not null unique references public.ledger_transactions(id),
 amount_paisa bigint not null check(amount_paisa between 1 and 99999999999),date date not null,notes text not null default '' check(char_length(notes)<=300),created_at timestamptz not null default now()
);
create table if not exists public.ledger_salary_statements (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,
 expense_id uuid not null unique references public.ledger_transactions(id),employee_id uuid not null references public.ledger_employees(id),
 period date not null,name_snapshot text not null,base_paisa bigint,allowance_paisa bigint,deduction_paisa bigint,net_paisa bigint not null,
 notes text not null default '',created_at timestamptz not null default now()
);
alter table public.ledger_expense_payments add column if not exists advance_id uuid references public.ledger_salary_advances(id);
alter table public.ledger_salary_advances enable row level security;alter table public.ledger_salary_statements enable row level security;
revoke all on public.ledger_salary_advances,public.ledger_salary_statements from public,anon,authenticated;
grant select on public.ledger_salary_advances,public.ledger_salary_statements to authenticated;
drop policy if exists ledger_owner_salary_advances on public.ledger_salary_advances;
create policy ledger_owner_salary_advances on public.ledger_salary_advances for select to authenticated using((select auth.uid())=user_id);
drop policy if exists ledger_owner_salary_statements on public.ledger_salary_statements;
create policy ledger_owner_salary_statements on public.ledger_salary_statements for select to authenticated using((select auth.uid())=user_id);

create or replace function public.ledger_snapshot_salary() returns trigger language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;bill public.ledger_transactions%rowtype;
begin
 if new.transaction_id is null or new.type<>'expense' then return new;end if;
 select * into employee from public.ledger_employees where schedule_id=new.schedule_id and user_id=new.user_id;
 if not found then return new;end if;
 select * into bill from public.ledger_transactions where id=new.transaction_id and user_id=new.user_id;
 insert into public.ledger_salary_statements(user_id,expense_id,employee_id,period,name_snapshot,base_paisa,allowance_paisa,deduction_paisa,net_paisa,notes)
 values(new.user_id,bill.id,employee.id,date_trunc('month',new.scheduled_date)::date,employee.name,employee.base_paisa,employee.allowance_paisa,employee.deduction_paisa,bill.amount_paisa,bill.notes) on conflict(expense_id) do nothing;
 return new;
end $$;
drop trigger if exists ledger_snapshot_salary on public.ledger_occurrences;
create trigger ledger_snapshot_salary after insert or update on public.ledger_occurrences for each row execute function public.ledger_snapshot_salary();
-- Existing bills retain their total and notes; a historical breakdown is never guessed.
insert into public.ledger_salary_statements(user_id,expense_id,employee_id,period,name_snapshot,net_paisa,notes)
 select o.user_id,o.transaction_id,e.id,date_trunc('month',o.scheduled_date)::date,replace(o.description,'Salary — ',''),t.amount_paisa,t.notes from public.ledger_occurrences o join public.ledger_employees e on e.schedule_id=o.schedule_id join public.ledger_transactions t on t.id=o.transaction_id where o.type='expense' on conflict(expense_id) do nothing;

create or replace function public.ledger_expense_credit_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare advance public.ledger_salary_advances%rowtype;bill public.ledger_transactions%rowtype;used bigint;
begin
 select * into bill from public.ledger_transactions where id=new.expense_id and user_id=new.user_id;
 if not found or bill.deleted_at is not null then raise exception 'Restore the deleted bill before changing its payments.';end if;
 if new.advance_id is null then return new;end if;
 select * into advance from public.ledger_salary_advances where id=new.advance_id and user_id=new.user_id for update;
 if not found or new.date<advance.date then raise exception 'This salary advance is unavailable on the selected date.';end if;
 if not exists(select 1 from public.ledger_salary_statements where expense_id=bill.id and employee_id=advance.employee_id and user_id=new.user_id) then raise exception 'An advance can only be applied to the same employee salary.';end if;
 if exists(select 1 from public.ledger_transactions where id=advance.transaction_id and deleted_at is not null) then raise exception 'This salary advance was deleted.';end if;
 select coalesce(sum(amount_paisa),0) into used from public.ledger_expense_payments where advance_id=advance.id and id<>new.id;
 if used+new.amount_paisa>advance.amount_paisa then raise exception 'This advance has already been applied, or the amount exceeds its unused balance.';end if;
 return new;
end $$;
drop trigger if exists ledger_expense_credit_guard on public.ledger_expense_payments;
create trigger ledger_expense_credit_guard before insert or update on public.ledger_expense_payments for each row execute function public.ledger_expense_credit_guard();

create or replace function public.ledger_grant_salary_advance(p_id uuid,p_employee uuid,p_amount bigint,p_date date,p_account uuid,p_method text,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;prior public.ledger_salary_advances%rowtype;tx uuid;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into prior from public.ledger_salary_advances where id=p_id;
 if found then
  if prior.user_id=auth.uid() and prior.employee_id=p_employee and prior.amount_paisa=p_amount and prior.date=p_date and prior.notes=coalesce(p_notes,'') and exists(select 1 from public.ledger_transactions t where t.id=prior.transaction_id and t.account_id is not distinct from p_account and t.payment_method=p_method) then return prior.id;end if;
  raise exception 'This request belongs to a different advance.';
 end if;
 select * into employee from public.ledger_employees where id=p_employee and user_id=auth.uid() and archived_at is null;
 if not found then raise exception 'Employee unavailable.' using errcode='42501';end if;
 if p_date is null or p_date>(now() at time zone 'Asia/Karachi')::date or p_date<employee.joining_date then raise exception 'Choose the actual advance date on or after joining, today or earlier.';end if;
 insert into public.ledger_transactions(user_id,type,description,category,amount_paisa,date,payment_method,notes,expense_status,account_id)
 values(auth.uid(),'expense','Salary advance — '||employee.name,'Payroll',p_amount,p_date,p_method,coalesce(p_notes,''),'paid',p_account) returning id into tx;
 insert into public.ledger_salary_advances(id,user_id,employee_id,transaction_id,amount_paisa,date,notes) values(p_id,auth.uid(),p_employee,tx,p_amount,p_date,coalesce(p_notes,''));return p_id;
end $$;
create or replace function public.ledger_apply_salary_advance(p_advance uuid,p_expense uuid,p_amount bigint,p_date date,p_request uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare advance public.ledger_salary_advances%rowtype;bill public.ledger_transactions%rowtype;prior public.ledger_expense_payments%rowtype;paid bigint;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 select * into advance from public.ledger_salary_advances where id=p_advance and user_id=auth.uid() for update;
 if not found then raise exception 'Advance unavailable.' using errcode='42501';end if;
 select * into bill from public.ledger_transactions where id=p_expense and user_id=auth.uid() for update;
 if not found or bill.type<>'expense' or bill.deleted_at is not null then raise exception 'Salary bill unavailable.';end if;
 select * into prior from public.ledger_expense_payments where id=p_request;
 if found then
  if prior.user_id=auth.uid() and prior.advance_id=p_advance and prior.expense_id=p_expense and prior.amount_paisa=p_amount and prior.date=p_date then return p_request;end if;
  raise exception 'This request was used for another payment.';
 end if;
 if p_amount is null or p_amount<=0 or p_date is null or p_date>(now() at time zone 'Asia/Karachi')::date then raise exception 'Enter a valid amount and an actual application date.';end if;
 if not bill.payment_tracking and bill.expense_status='paid' then raise exception 'This salary is already paid.';end if;
 select coalesce(sum(amount_paisa),0) into paid from public.ledger_expense_payments where expense_id=bill.id;
 if paid+p_amount>bill.amount_paisa then raise exception 'This amount exceeds the remaining salary bill.';end if;
 insert into public.ledger_expense_payments(id,user_id,expense_id,amount_paisa,date,payment_method,notes,advance_id) values(p_request,auth.uid(),bill.id,p_amount,p_date,'Cash','Applied from salary advance',p_advance);
 update public.ledger_transactions set payment_tracking=true where id=bill.id;return p_request;
end $$;
revoke all on function public.ledger_snapshot_salary(),public.ledger_expense_credit_guard(),public.ledger_grant_salary_advance(uuid,uuid,bigint,date,uuid,text,text),public.ledger_apply_salary_advance(uuid,uuid,bigint,date,uuid) from public,anon;
grant execute on function public.ledger_grant_salary_advance(uuid,uuid,bigint,date,uuid,text,text),public.ledger_apply_salary_advance(uuid,uuid,bigint,date,uuid) to authenticated;
commit;


-- 20261127_recovery.sql
begin;
alter table public.ledger_transactions add column if not exists deleted_at timestamptz;
alter table public.ledger_loans add column if not exists deleted_at timestamptz;
alter table public.ledger_loan_payments add column if not exists deleted_at timestamptz;
create table if not exists public.ledger_audit_events (
 id uuid primary key default gen_random_uuid(),user_id uuid not null references auth.users(id) on delete cascade,actor_id uuid,
 entity_type text not null,entity_id uuid,action text not null,before_data jsonb,after_data jsonb,created_at timestamptz not null default now()
);
alter table public.ledger_audit_events enable row level security;
revoke all on public.ledger_audit_events from public,anon,authenticated;grant select on public.ledger_audit_events to authenticated;
drop policy if exists ledger_owner_audit on public.ledger_audit_events;
create policy ledger_owner_audit on public.ledger_audit_events for select to authenticated using((select auth.uid())=user_id);
create index if not exists ledger_audit_owner_date on public.ledger_audit_events(user_id,created_at desc);
create or replace function public.ledger_capture_audit() returns trigger language plpgsql security definer set search_path='' as $$
declare prior jsonb;next jsonb;rowdata jsonb;payload jsonb;
begin
 prior:=case when tg_op='INSERT' then null else to_jsonb(old) end;next:=case when tg_op='DELETE' then null else to_jsonb(new) end;rowdata:=coalesce(next,prior);
 if tg_op='UPDATE' and (prior-'workspace_id')=(next-'workspace_id') then return new;end if;
 if not exists(select 1 from auth.users where id=(rowdata->>'user_id')::uuid) then return coalesce(new,old);end if;
 payload:=jsonb_build_object('id',gen_random_uuid(),'user_id',rowdata->>'user_id','actor_id',auth.uid(),'entity_type',tg_table_name,'entity_id',rowdata->>'id','action',case when tg_op='UPDATE' and prior->>'deleted_at' is null and next->>'deleted_at' is not null then 'deleted' when tg_op='UPDATE' and prior->>'deleted_at' is not null and next->>'deleted_at' is null then 'restored' else lower(tg_op) end,'before_data',prior,'after_data',next,'created_at',now());
 if rowdata?'workspace_id' then payload:=payload||jsonb_build_object('workspace_id',rowdata->'workspace_id');end if;
 execute 'insert into public.ledger_audit_events select (jsonb_populate_record(null::public.ledger_audit_events,$1)).*' using payload;
 return coalesce(new,old);
end $$;
do $$declare name text;begin
 foreach name in array array['ledger_transactions','ledger_expense_payments','ledger_loans','ledger_loan_payments','ledger_schedules','ledger_occurrences','ledger_employees','ledger_salary_advances','ledger_salary_statements','ledger_accounts','ledger_account_transfers','ledger_templates','ledger_receipts'] loop
  if to_regclass('public.'||name) is not null then execute format('drop trigger if exists ledger_audit_capture on public.%I',name);execute format('create trigger ledger_audit_capture after insert or update or delete on public.%I for each row execute function public.ledger_capture_audit()',name);end if;
 end loop;
end $$;
create or replace function public.ledger_protect_advance_cash() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.deleted_at is not null and old.deleted_at is null and (exists(select 1 from public.ledger_expense_payments where expense_id=old.id and advance_id is not null) or exists(select 1 from public.ledger_salary_advances a join public.ledger_expense_payments p on p.advance_id=a.id where a.transaction_id=old.id)) then raise exception 'Undo applied salary advances before deleting this record.';end if;
 if exists(select 1 from public.ledger_salary_advances where transaction_id=old.id) and (new.type is distinct from old.type or new.amount_paisa is distinct from old.amount_paisa or new.date is distinct from old.date or new.expense_status is distinct from old.expense_status or new.paid_date is distinct from old.paid_date or new.payment_tracking is distinct from old.payment_tracking or new.category is distinct from old.category) then raise exception 'Issued salary advances keep their original amount, date, and Payroll classification. Delete an unapplied mistaken advance and create a corrected one.';end if;
 return new;
end $$;
drop trigger if exists ledger_protect_advance_cash on public.ledger_transactions;
create trigger ledger_protect_advance_cash before update on public.ledger_transactions for each row execute function public.ledger_protect_advance_cash();

create or replace function public.ledger_check_loan_payment() returns trigger language plpgsql security invoker set search_path='' as $$
declare parent public.ledger_loans%rowtype;already_paid numeric;
begin
 if tg_op='UPDATE' and (new.id is distinct from old.id or new.user_id is distinct from old.user_id or new.loan_id is distinct from old.loan_id) then raise exception 'A repayment cannot be moved to another loan or owner.';end if;
 select * into parent from public.ledger_loans where id=new.loan_id and user_id=new.user_id for update;
 if not found or parent.deleted_at is not null then raise exception 'Restore the Udhar record before changing its repayments.';end if;
 if new.deleted_at is not null then return new;end if;
 if new.date<parent.date then raise exception 'A repayment cannot be dated before the loan.';end if;
 select coalesce(sum(amount_paisa),0) into already_paid from public.ledger_loan_payments where loan_id=parent.id and user_id=parent.user_id and id<>new.id and deleted_at is null;
 if already_paid+new.amount_paisa>parent.amount_paisa then raise exception 'This repayment is more than the remaining loan balance.';end if;return new;
end $$;
create or replace function public.ledger_check_loan_edit() returns trigger language plpgsql security invoker set search_path='' as $$
declare paid numeric;first_payment date;
begin
 if new.id is distinct from old.id or new.user_id is distinct from old.user_id then raise exception 'A loan cannot be moved to another owner.';end if;
 select coalesce(sum(amount_paisa),0),min(date) into paid,first_payment from public.ledger_loan_payments where loan_id=old.id and user_id=old.user_id and deleted_at is null;
 if new.amount_paisa<paid then raise exception 'The loan amount cannot be less than repayments already recorded.';end if;
 if paid>0 and new.direction is distinct from old.direction then raise exception 'The loan direction cannot change after repayments.';end if;
 if first_payment is not null and new.date>first_payment then raise exception 'The loan date cannot follow an existing repayment.';end if;return new;
end $$;

create or replace function public.ledger_list_trash(p_owner uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb:='[]';name text;items jsonb;
begin
 if auth.uid() is null or auth.uid()<>p_owner then raise exception 'Only the owner can recover records.' using errcode='42501';end if;
 foreach name in array array['ledger_transactions','ledger_loans','ledger_loan_payments'] loop
  execute format('select coalesce(jsonb_agg(jsonb_build_object(''kind'',$1,''id'',id,''deleted_at'',deleted_at,''data'',to_jsonb(t)) order by deleted_at desc),''[]''::jsonb) from public.%I t where user_id=$2 and deleted_at is not null and workspace_id=public.ledger_current_workspace()',name) into items using name,p_owner;
  result:=result||items;
 end loop;return result;
end $$;
create or replace function public.ledger_restore_record(p_kind text,p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare changed uuid;
begin
 if auth.uid() is null or p_kind not in ('ledger_transactions','ledger_loans','ledger_loan_payments') then raise exception 'Choose a valid record to restore.' using errcode='42501';end if;
 execute format('update public.%I set deleted_at=null where id=$1 and user_id=auth.uid() and workspace_id=public.ledger_current_workspace() and deleted_at is not null returning id',p_kind) into changed using p_id;
 if changed is null then raise exception 'This deleted record is unavailable in the selected workspace.';end if;
end $$;
revoke all on function public.ledger_capture_audit(),public.ledger_protect_advance_cash(),public.ledger_list_trash(uuid),public.ledger_restore_record(text,uuid) from public,anon;
grant execute on function public.ledger_list_trash(uuid),public.ledger_restore_record(text,uuid) to authenticated;

create or replace function public.ledger_record_account_expense_payment(p_expense uuid,p_amount bigint,p_date date,p_method text,p_notes text,p_request uuid,p_account uuid) returns uuid language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if exists(select 1 from public.ledger_expense_payments where id=p_request and user_id=auth.uid() and account_id is distinct from p_account) then raise exception 'This request used a different account.';end if;
 perform public.ledger_record_expense_payment(p_expense,p_amount,p_date,p_method,p_notes,p_request);
 update public.ledger_expense_payments set account_id=p_account where id=p_request and user_id=auth.uid();return p_request;
end $$;
revoke all on function public.ledger_record_account_expense_payment(uuid,bigint,date,text,text,uuid,uuid) from public,anon;
grant execute on function public.ledger_record_account_expense_payment(uuid,bigint,date,text,text,uuid,uuid) to authenticated;
commit;


-- 20261127_backup.sql
begin;
create table if not exists public.ledger_restore_batches(id uuid primary key,user_id uuid not null references auth.users(id) on delete cascade,payload_hash text not null,result jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.ledger_restore_batches enable row level security;
revoke all on public.ledger_restore_batches from public,anon,authenticated;grant select on public.ledger_restore_batches to authenticated;
create or replace function public.ledger_restore_backup(p_payload jsonb,p_request uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare
 name text;rowdata jsonb;prior record;target record;new_id uuid;matched bigint;count_inserted int:=0;count_kept int:=0;count_repaired int:=0;
 new_expenses uuid[]:='{}';new_loans uuid[]:='{}';tracked uuid[]:='{}';deleted_expenses jsonb:='{}';deleted_loans jsonb:='{}';
 ws uuid;result jsonb;original_deleted jsonb;desired_tracking boolean;
 tables text[]:=array['ledger_accounts','ledger_schedules','ledger_categories','ledger_loans','ledger_transactions','ledger_employees','ledger_salary_advances','ledger_salary_statements','ledger_expense_payments','ledger_loan_payments','ledger_occurrences','ledger_transfers','ledger_account_transfers','ledger_templates','ledger_receipts'];
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_request is null then raise exception 'A restore request identity is required.';end if;
 ws:=public.ledger_current_workspace();
 if public.ledger_workspace_role(ws) is distinct from 'owner' then raise exception 'Only the workspace owner can restore a backup.' using errcode='42501';end if;
 if p_payload->>'format' is distinct from 'hisabivo-workspace-v1' or p_payload->>'owner_id' is distinct from auth.uid()::text or p_payload->>'workspace_id' is distinct from ws::text or jsonb_typeof(p_payload->'tables') is distinct from 'object' or octet_length(p_payload::text)>40000000 then raise exception 'Choose a Hisabivo backup for this owner and the selected workspace (maximum 40 MB).';end if;
 for name in select jsonb_object_keys(p_payload->'tables') loop
  if not(name=any(tables)) then raise exception 'This backup contains an unsupported table: %',name;end if;
 end loop;
 perform pg_advisory_xact_lock(hashtextextended(p_request::text,0));
 select * into prior from public.ledger_restore_batches where id=p_request;
 if found then
  if prior.user_id=auth.uid() and prior.workspace_id=ws and prior.payload_hash=md5(p_payload::text) then return prior.result;end if;
  raise exception 'This restore request belongs to a different backup.';
 end if;
 foreach name in array tables loop
  if p_payload->'tables'->name is null then continue;end if;
  if to_regclass('public.'||name) is null then raise exception 'Install the feature for backup table % before restoring.',name;end if;
  if jsonb_typeof(p_payload->'tables'->name)<>'array' or jsonb_array_length(p_payload->'tables'->name)>10000 then raise exception 'Invalid backup table: %',name;end if;
  for rowdata in select value from jsonb_array_elements(p_payload->'tables'->name) loop
   if jsonb_typeof(rowdata) is distinct from 'object' or rowdata->>'user_id' is distinct from auth.uid()::text or rowdata->>'workspace_id' is distinct from ws::text then raise exception 'A backup record belongs to another owner or workspace.' using errcode='42501';end if;
   execute format('select user_id,workspace_id from public.%I where id=$1',name) into target using (rowdata->>'id')::uuid;
   get diagnostics matched=row_count;
   if matched>0 then
    if target.user_id<>auth.uid() or target.workspace_id<>ws then raise exception 'A record identity is unavailable in this workspace.' using errcode='42501';end if;
    -- Reconnect only an already-created occurrence whose original parent was
    -- missing and was inserted by THIS restore. Never replace an existing link.
    if name='ledger_occurrences' and rowdata->>'status'='created' and (rowdata->>'transaction_id')::uuid=any(new_expenses) then
     update public.ledger_occurrences set transaction_id=(rowdata->>'transaction_id')::uuid
      where id=(rowdata->>'id')::uuid and user_id=auth.uid() and workspace_id=ws and status='created' and transaction_id is null
      and schedule_id=(rowdata->>'schedule_id')::uuid and type=rowdata->>'type';
     get diagnostics matched=row_count;count_repaired:=count_repaired+matched::int;
    end if;
    count_kept:=count_kept+1;continue;
   end if;
   -- Existing bills and loans retain their current payment history, even if a
   -- stale backup has additional payments that were intentionally removed.
   if name='ledger_expense_payments' and not((rowdata->>'expense_id')::uuid=any(new_expenses)) then count_kept:=count_kept+1;continue;end if;
   if name='ledger_loan_payments' and not((rowdata->>'loan_id')::uuid=any(new_loans)) then count_kept:=count_kept+1;continue;end if;
   original_deleted:=rowdata->'deleted_at';desired_tracking:=false;
   if name='ledger_transactions' then
    desired_tracking:=coalesce((rowdata->>'payment_tracking')::boolean,false);
    if desired_tracking then rowdata:=rowdata||'{"payment_tracking":false,"expense_status":"expected","paid_date":null}'::jsonb;end if;
    -- Payment guards correctly refuse deleted parents. Restore this new graph
    -- active inside the same transaction, then put back its original trash state.
    rowdata:=rowdata||'{"deleted_at":null}'::jsonb;
   elsif name='ledger_loans' then rowdata:=rowdata||'{"deleted_at":null}'::jsonb;
   end if;
   new_id:=null;
   execute format('insert into public.%I select (jsonb_populate_record(null::public.%I,$1)).* on conflict do nothing returning id',name,name) into new_id using rowdata;
   if new_id is not null then
    count_inserted:=count_inserted+1;
    if name='ledger_transactions' then
     new_expenses:=array_append(new_expenses,new_id);
     if desired_tracking then tracked:=array_append(tracked,new_id);end if;
     if original_deleted is not null and original_deleted<>'null'::jsonb then deleted_expenses:=deleted_expenses||jsonb_build_object(new_id::text,original_deleted);end if;
    elsif name='ledger_loans' then
     new_loans:=array_append(new_loans,new_id);
     if original_deleted is not null and original_deleted<>'null'::jsonb then deleted_loans:=deleted_loans||jsonb_build_object(new_id::text,original_deleted);end if;
    end if;
   else count_kept:=count_kept+1;
   end if;
  end loop;
 end loop;
 foreach new_id in array tracked loop
  -- A bill with zero remaining payment rows is safely canonicalized as expected;
  -- no synthetic cash event or trigger bypass is introduced to set a legacy flag.
  if exists(select 1 from public.ledger_expense_payments where expense_id=new_id and user_id=auth.uid() and workspace_id=ws) then
   update public.ledger_transactions set payment_tracking=true where id=new_id and user_id=auth.uid() and workspace_id=ws;
  end if;
 end loop;
 for name in select jsonb_object_keys(deleted_loans) loop
  update public.ledger_loans set deleted_at=(deleted_loans->>name)::timestamptz where id=name::uuid and user_id=auth.uid() and workspace_id=ws;
 end loop;
 for name in select jsonb_object_keys(deleted_expenses) loop
  update public.ledger_transactions set deleted_at=(deleted_expenses->>name)::timestamptz where id=name::uuid and user_id=auth.uid() and workspace_id=ws;
 end loop;
 if exists(select 1 from public.ledger_employees e join public.ledger_schedules s on s.id=e.schedule_id where e.user_id=auth.uid() and e.workspace_id=ws and (s.user_id<>e.user_id or s.workspace_id<>e.workspace_id or s.amount_paisa<>e.base_paisa+e.allowance_paisa-e.deduction_paisa)) then raise exception 'The restored employee salary details do not match their schedule.';end if;
 result:=jsonb_build_object('inserted',count_inserted,'kept',count_kept,'repaired',count_repaired);
 insert into public.ledger_restore_batches(id,user_id,workspace_id,payload_hash,result) values(p_request,auth.uid(),ws,md5(p_payload::text),result);
 return result;
end $$;
revoke all on function public.ledger_restore_backup(jsonb,uuid) from public,anon;
grant execute on function public.ledger_restore_backup(jsonb,uuid) to authenticated;
commit;


-- 20261127_workspaces.sql
-- Apply LAST, after all financial feature migrations. Separates personal/business
-- ledgers and adds accountant read access and staff proposals without shared logins.
begin;
create table if not exists public.ledger_workspaces (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 100), kind text not null check(kind in ('personal','business')),
 is_default boolean not null default false, created_at timestamptz not null default now(), check(not is_default or kind='personal')
);
create unique index if not exists ledger_one_default_workspace on public.ledger_workspaces(owner_id) where is_default;
create table if not exists public.ledger_team_members (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.ledger_workspaces(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,email text not null,
 role text not null check(role in ('accountant','staff')),created_at timestamptz not null default now(),unique(workspace_id,user_id)
);
create table if not exists public.ledger_team_invites (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.ledger_workspaces(id) on delete cascade,
 email text not null check(char_length(email)<=254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
 role text not null check(role in ('accountant','staff')),token uuid not null unique default gen_random_uuid(),
 expires_at timestamptz not null default now()+interval '7 days',accepted_by uuid references auth.users(id) on delete set null,
 cancelled_at timestamptz,created_at timestamptz not null default now()
);
create table if not exists public.ledger_entry_proposals (
 id uuid primary key default gen_random_uuid(),workspace_id uuid not null references public.ledger_workspaces(id) on delete cascade,
 owner_id uuid not null references auth.users(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,
 type text not null check(type in ('income','expense')),amount_paisa bigint not null check(amount_paisa between 1 and 99999999999),
 category text not null check(char_length(trim(category)) between 1 and 60),description text not null check(char_length(trim(description)) between 1 and 100),
 date date not null check(date between '1900-01-01' and '9999-12-31'),payment_method text not null check(payment_method in ('Cash','Bank transfer','Debit / credit card','Easypaisa','JazzCash')),
 notes text not null default '' check(char_length(notes)<=500),status text not null default 'pending' check(status in ('pending','approved','rejected')),
 transaction_id uuid references public.ledger_transactions(id) on delete set null,decision_notes text not null default '' check(char_length(decision_notes)<=500),
 decided_at timestamptz,created_at timestamptz not null default now()
);
create index if not exists ledger_team_members_user on public.ledger_team_members(user_id,workspace_id);
create index if not exists ledger_proposals_workspace on public.ledger_entry_proposals(workspace_id,status,created_at);

insert into public.ledger_workspaces(owner_id,name,kind,is_default)
 select id,'Personal workspace','personal',true from auth.users
 on conflict(owner_id) where is_default do nothing;
create or replace function public.ledger_new_user_workspace() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.ledger_workspaces(owner_id,name,kind,is_default) values(new.id,'Personal workspace','personal',true)
 on conflict(owner_id) where is_default do nothing;return new;
end $$;
revoke all on function public.ledger_new_user_workspace() from public,anon,authenticated;
drop trigger if exists ledger_new_user_workspace on auth.users;
create trigger ledger_new_user_workspace after insert on auth.users for each row execute function public.ledger_new_user_workspace();

create or replace function public.ledger_current_workspace() returns uuid language plpgsql stable security definer set search_path='' as $$
declare header text;result uuid;
begin
 header:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb->>'x-hisabivo-workspace';
 if header is not null then
  if header !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return null;end if;
  return header::uuid;
 end if;
 select id into result from public.ledger_workspaces where owner_id=auth.uid() and is_default;return result;
exception when invalid_text_representation then return null;
end $$;
create or replace function public.ledger_workspace_role(p_workspace uuid default null) returns text language plpgsql stable security definer set search_path='' as $$
declare ws uuid:=coalesce(p_workspace,public.ledger_current_workspace());actor uuid:=auth.uid();result text;
begin
 if actor is null or ws is null then return null;end if;
 if exists(select 1 from public.ledger_workspaces where id=ws and owner_id=actor) then return 'owner';end if;
 select role into result from public.ledger_team_members where workspace_id=ws and user_id=actor;return result;
end $$;
create or replace function public.ledger_can_read_workspace(p_owner uuid,p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(p_workspace=public.ledger_current_workspace() and public.ledger_workspace_role(p_workspace) in ('owner','accountant') and exists(select 1 from public.ledger_workspaces where id=p_workspace and owner_id=p_owner),false)
$$;
create or replace function public.ledger_can_read_owner(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.ledger_can_read_workspace(p_owner,public.ledger_current_workspace())
$$;
create or replace function public.ledger_can_read(p_owner uuid) returns boolean language sql stable security definer set search_path='' as $$select public.ledger_can_read_owner(p_owner)$$;
create or replace function public.ledger_can_write_owner(p_owner uuid,p_workspace uuid) returns boolean language sql stable security definer set search_path='' as $$
 select coalesce(auth.uid()=p_owner and p_workspace=public.ledger_current_workspace() and exists(select 1 from public.ledger_workspaces where id=p_workspace and owner_id=p_owner),false)
$$;
create or replace function public.ledger_assert_workspace_owner() returns void language plpgsql stable security definer set search_path='' as $$
begin
 if not public.ledger_can_write_owner(auth.uid(),public.ledger_current_workspace()) then raise exception 'Choose a workspace that you own before changing financial records.' using errcode='42501';end if;
end $$;
revoke all on function public.ledger_current_workspace(),public.ledger_workspace_role(uuid),public.ledger_can_read_workspace(uuid,uuid),public.ledger_can_read_owner(uuid),public.ledger_can_read(uuid),public.ledger_can_write_owner(uuid,uuid),public.ledger_assert_workspace_owner() from public,anon;
grant execute on function public.ledger_current_workspace(),public.ledger_workspace_role(uuid),public.ledger_can_read_workspace(uuid,uuid),public.ledger_can_read_owner(uuid),public.ledger_can_read(uuid),public.ledger_can_write_owner(uuid,uuid),public.ledger_assert_workspace_owner() to authenticated;

-- Backfill ALL existing user-owned financial rows into that user's default
-- personal workspace, then replace every older permissive policy atomically.
do $$
declare t text;p record;
begin
 foreach t in array array['ledger_transactions','ledger_categories','ledger_loans','ledger_loan_payments','ledger_schedules','ledger_occurrences','ledger_reminders','ledger_expense_payments','ledger_employees','ledger_accounts','ledger_account_transfers','ledger_templates','ledger_receipts','ledger_import_batches','ledger_salary_advances','ledger_salary_statements','ledger_audit_events','ledger_restore_batches'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  execute format('alter table public.%I add column if not exists workspace_id uuid',t);
  execute format('update public.%I r set workspace_id=w.id from public.ledger_workspaces w where r.workspace_id is null and r.user_id=w.owner_id and w.is_default',t);
  execute format('alter table public.%I alter column workspace_id set not null',t);
  if not exists(select 1 from pg_constraint where conrelid=('public.'||t)::regclass and conname=t||'_workspace_fk') then
   execute format('alter table public.%I add constraint %I foreign key(workspace_id) references public.ledger_workspaces(id) on delete cascade',t,t||'_workspace_fk');
  end if;
  execute format('create index if not exists %I on public.%I(workspace_id,user_id)',t||'_workspace_owner',t);
  execute format('alter table public.%I enable row level security',t);
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;
  execute format('create policy ledger_workspace_read on public.%I for select to authenticated using(public.ledger_can_read_workspace(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_insert on public.%I for insert to authenticated with check(public.ledger_can_write_owner(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_update on public.%I for update to authenticated using(public.ledger_can_write_owner(user_id,workspace_id)) with check(public.ledger_can_write_owner(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_delete on public.%I for delete to authenticated using(public.ledger_can_write_owner(user_id,workspace_id))',t);
  -- These restrictive guards also survive a later rerun of a legacy feature
  -- migration that recreates a permissive owner policy with its old name.
  execute format('create policy ledger_workspace_read_guard on public.%I as restrictive for select to authenticated using(public.ledger_can_read_workspace(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_insert_guard on public.%I as restrictive for insert to authenticated with check(public.ledger_can_write_owner(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_update_guard on public.%I as restrictive for update to authenticated using(public.ledger_can_write_owner(user_id,workspace_id)) with check(public.ledger_can_write_owner(user_id,workspace_id))',t);
  execute format('create policy ledger_workspace_delete_guard on public.%I as restrictive for delete to authenticated using(public.ledger_can_write_owner(user_id,workspace_id))',t);
 end loop;
end $$;
drop index if exists public.ledger_categories_owner_name;
create unique index if not exists ledger_categories_workspace_name on public.ledger_categories(workspace_id,type,lower(trim(name)));
do $$begin
 if to_regclass('public.ledger_accounts') is not null then
  drop index if exists public.ledger_accounts_owner_name;
  execute 'create unique index if not exists ledger_accounts_workspace_name on public.ledger_accounts(workspace_id,lower(trim(name)))';
 end if;
 if to_regclass('public.ledger_reminders') is not null then
  alter table public.ledger_reminders drop constraint if exists ledger_reminders_pkey;
  alter table public.ledger_reminders add primary key(user_id,workspace_id,reminder_id);
 end if;
end $$;

create or replace function public.ledger_parent_workspace(p_table text,p_id uuid,p_owner uuid) returns uuid language plpgsql stable security definer set search_path='' as $$
declare result uuid;
begin
 if p_table not in ('ledger_transactions','ledger_schedules','ledger_loans','ledger_employees','ledger_accounts','ledger_salary_advances') then raise exception 'Unsupported parent relation.';end if;
 execute format('select workspace_id from public.%I where id=$1 and user_id=$2',p_table) into result using p_id,p_owner;
 if result is null then raise exception 'The related record is unavailable in this workspace.' using errcode='42501';end if;
 return result;
end $$;
revoke all on function public.ledger_parent_workspace(text,uuid,uuid) from public,anon,authenticated;

create or replace function public.ledger_financial_workspace_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb;prior jsonb;owner uuid;ws uuid;parent_ws uuid;candidate uuid;key text;relation text;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 owner:=(r->>'user_id')::uuid;ws:=(r->>'workspace_id')::uuid;
 if tg_op='DELETE' and not exists(select 1 from auth.users where id=owner) then return old;end if;
 if tg_op='UPDATE' then
  prior:=to_jsonb(old);
  if owner is distinct from (prior->>'user_id')::uuid or ws is distinct from (prior->>'workspace_id')::uuid then raise exception 'A financial record cannot be moved between owners or workspaces.' using errcode='42501';end if;
 end if;
 -- Related records must belong to the same owner AND workspace. Derive child
 -- scope from its parent, including unattended recurring/payroll preparation.
 if tg_op<>'DELETE' then
  foreach key in array array['expense_id','entry_id','transaction_id','schedule_id','loan_id','employee_id','advance_id','account_id','from_account_id','to_account_id'] loop
   if nullif(r->>key,'') is null then continue;end if;
   relation:=case key when 'schedule_id' then 'ledger_schedules' when 'loan_id' then 'ledger_loans' when 'employee_id' then 'ledger_employees' when 'advance_id' then 'ledger_salary_advances' when 'account_id' then 'ledger_accounts' when 'from_account_id' then 'ledger_accounts' when 'to_account_id' then 'ledger_accounts' else 'ledger_transactions' end;
   if to_regclass('public.'||relation) is null then raise exception 'Install the related feature before using this record.';end if;
   candidate:=public.ledger_parent_workspace(relation,(r->>key)::uuid,owner);
   if parent_ws is not null and parent_ws<>candidate then raise exception 'Related records must belong to the same workspace.' using errcode='42501';end if;
   parent_ws:=candidate;
  end loop;
  if ws is null then
   ws:=parent_ws;
   if ws is null and auth.uid() is not null then ws:=public.ledger_current_workspace();end if;
   if ws is null then select id into ws from public.ledger_workspaces where owner_id=owner and is_default;end if;
  end if;
  if parent_ws is not null and parent_ws<>ws then raise exception 'The related record belongs to a different workspace.' using errcode='42501';end if;
  if ws is null or not exists(select 1 from public.ledger_workspaces where id=ws and owner_id=owner) then raise exception 'This workspace does not belong to the record owner.' using errcode='42501';end if;
  new.workspace_id:=ws;
  if tg_table_name='ledger_receipts' and (split_part(r->>'object_path','/',1)<>owner::text or split_part(r->>'object_path','/',2)<>ws::text or split_part(r->>'object_path','/',3)<>r->>'entry_id') then raise exception 'Receipt path must match its owner, workspace and entry.';end if;
 end if;
 if auth.uid() is not null and not public.ledger_can_write_owner(owner,ws) then raise exception 'This change is outside your selected owner workspace.' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;return new;
end $$;
revoke all on function public.ledger_financial_workspace_guard() from public,anon,authenticated;
do $$declare t text;begin
 foreach t in array array['ledger_transactions','ledger_categories','ledger_loans','ledger_loan_payments','ledger_schedules','ledger_occurrences','ledger_reminders','ledger_expense_payments','ledger_employees','ledger_accounts','ledger_account_transfers','ledger_templates','ledger_receipts','ledger_import_batches','ledger_salary_advances','ledger_salary_statements','ledger_audit_events','ledger_restore_batches'] loop
  if to_regclass('public.'||t) is null then continue;end if;
  execute format('drop trigger if exists a_ledger_workspace_scope on public.%I',t);
  execute format('create trigger a_ledger_workspace_scope before insert or update or delete on public.%I for each row execute function public.ledger_financial_workspace_guard()',t);
 end loop;
end $$;

alter table public.ledger_workspaces enable row level security;
alter table public.ledger_team_members enable row level security;
alter table public.ledger_team_invites enable row level security;
alter table public.ledger_entry_proposals enable row level security;
revoke all on public.ledger_workspaces,public.ledger_team_members,public.ledger_team_invites,public.ledger_entry_proposals from public,anon,authenticated;
grant select on public.ledger_workspaces,public.ledger_team_members,public.ledger_team_invites,public.ledger_entry_proposals to authenticated;
drop policy if exists ledger_workspace_context_read on public.ledger_workspaces;
create policy ledger_workspace_context_read on public.ledger_workspaces for select to authenticated using(public.ledger_workspace_role(id) is not null);
drop policy if exists ledger_workspace_members_read on public.ledger_team_members;
create policy ledger_workspace_members_read on public.ledger_team_members for select to authenticated using(workspace_id=public.ledger_current_workspace() and (public.ledger_workspace_role(workspace_id)='owner' or user_id=auth.uid()));
drop policy if exists ledger_workspace_invites_read on public.ledger_team_invites;
create policy ledger_workspace_invites_read on public.ledger_team_invites for select to authenticated using(workspace_id=public.ledger_current_workspace() and public.ledger_workspace_role(workspace_id)='owner');
drop policy if exists ledger_workspace_proposals_read on public.ledger_entry_proposals;
create policy ledger_workspace_proposals_read on public.ledger_entry_proposals for select to authenticated using(workspace_id=public.ledger_current_workspace() and (public.ledger_workspace_role(workspace_id)='owner' or (user_id=auth.uid() and public.ledger_workspace_role(workspace_id)='staff')));

create or replace function public.ledger_list_workspaces() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'owner_id',w.owner_id,'name',w.name,'kind',w.kind,'role',case when w.owner_id=auth.uid() then 'owner' else m.role end,'is_default',w.is_default) order by w.is_default desc,w.created_at,w.id),'[]'::jsonb)
 from public.ledger_workspaces w left join public.ledger_team_members m on m.workspace_id=w.id and m.user_id=auth.uid()
 where auth.uid() is not null and (w.owner_id=auth.uid() or m.user_id=auth.uid())
$$;
create or replace function public.ledger_create_workspace(p_name text,p_kind text) returns jsonb language plpgsql security definer set search_path='' as $$
declare result public.ledger_workspaces%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 insert into public.ledger_workspaces(owner_id,name,kind) values(auth.uid(),trim(p_name),p_kind) returning * into result;
 return jsonb_build_object('id',result.id,'owner_id',result.owner_id,'name',result.name,'kind',result.kind,'role','owner','is_default',false);
end $$;
create or replace function public.ledger_update_workspace(p_workspace uuid,p_name text,p_kind text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.ledger_can_write_owner(auth.uid(),p_workspace) then raise exception 'Only the selected workspace owner can edit its details.' using errcode='42501';end if;
 update public.ledger_workspaces set name=trim(p_name),kind=p_kind where id=p_workspace and owner_id=auth.uid();
end $$;
create or replace function public.ledger_invite_workspace(p_workspace uuid,p_email text,p_role text) returns jsonb language plpgsql security definer set search_path='' as $$
declare invited_email text:=lower(trim(p_email));invitation public.ledger_team_invites%rowtype;
begin
 if not public.ledger_can_write_owner(auth.uid(),p_workspace) then raise exception 'Only the selected workspace owner can invite members.' using errcode='42501';end if;
 update public.ledger_team_invites set cancelled_at=now() where workspace_id=p_workspace and lower(ledger_team_invites.email)=invited_email and accepted_by is null and cancelled_at is null;
 -- No auth.users lookup here: the same pending invitation is returned whether
 -- the address is registered or not. No email is sent by this operation.
 insert into public.ledger_team_invites(workspace_id,email,role) values(p_workspace,invited_email,p_role) returning * into invitation;
 return to_jsonb(invitation);
end $$;
create or replace function public.ledger_verified_actor_email() returns text language plpgsql stable security definer set search_path='' as $$
declare email text;
begin
 select lower(u.email) into email from auth.users u where u.id=auth.uid() and u.email_confirmed_at is not null;
 if email is null or email is distinct from lower(auth.jwt()->>'email') then return null;end if;
 return email;
end $$;
revoke all on function public.ledger_verified_actor_email() from public,anon,authenticated;
create or replace function public.ledger_incoming_team_invites() returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(to_jsonb(i)||jsonb_build_object('workspace_name',w.name) order by i.created_at desc),'[]'::jsonb)
 from public.ledger_team_invites i join public.ledger_workspaces w on w.id=i.workspace_id
 where lower(i.email)=public.ledger_verified_actor_email() and i.accepted_by is null and i.cancelled_at is null and i.expires_at>now()
$$;
create or replace function public.ledger_accept_workspace_invite(p_token uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.ledger_team_invites%rowtype;email text:=public.ledger_verified_actor_email();owner uuid;
begin
 if email is null then raise exception 'Sign in with the verified email address that was invited.' using errcode='42501';end if;
 select * into invitation from public.ledger_team_invites where token=p_token for update;
 if not found or lower(invitation.email)<>email then raise exception 'This invitation is unavailable for your account.' using errcode='42501';end if;
 if invitation.accepted_by is not null then
  if invitation.accepted_by=auth.uid() and exists(select 1 from public.ledger_team_members where workspace_id=invitation.workspace_id and user_id=auth.uid()) then return invitation.workspace_id;end if;
  raise exception 'This invitation was already used or access has been removed.' using errcode='42501';
 end if;
 if invitation.cancelled_at is not null or invitation.expires_at<=now() then raise exception 'This invitation has expired or been cancelled.';end if;
 select owner_id into owner from public.ledger_workspaces where id=invitation.workspace_id;
 if owner=auth.uid() then raise exception 'You already own this workspace.';end if;
 insert into public.ledger_team_members(workspace_id,user_id,email,role) values(invitation.workspace_id,auth.uid(),email,invitation.role)
 on conflict(workspace_id,user_id) do update set email=excluded.email,role=excluded.role;
 update public.ledger_team_invites set accepted_by=auth.uid() where id=invitation.id;
 return invitation.workspace_id;
end $$;
create or replace function public.ledger_revoke_workspace_invite(p_invite uuid) returns void language plpgsql security definer set search_path='' as $$
declare ws uuid;
begin
 select workspace_id into ws from public.ledger_team_invites where id=p_invite;
 if not public.ledger_can_write_owner(auth.uid(),ws) then raise exception 'Invitation unavailable.' using errcode='42501';end if;
 update public.ledger_team_invites set cancelled_at=coalesce(cancelled_at,now()) where id=p_invite and accepted_by is null;
end $$;
create or replace function public.ledger_change_workspace_member(p_workspace uuid,p_user uuid,p_role text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.ledger_can_write_owner(auth.uid(),p_workspace) then raise exception 'Only the workspace owner can change access.' using errcode='42501';end if;
 update public.ledger_team_members set role=p_role where workspace_id=p_workspace and user_id=p_user;
 if not found then raise exception 'This member is no longer in the workspace.';end if;
end $$;
create or replace function public.ledger_remove_workspace_member(p_workspace uuid,p_user uuid) returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.ledger_can_write_owner(auth.uid(),p_workspace) then raise exception 'Only the workspace owner can remove access.' using errcode='42501';end if;
 delete from public.ledger_team_members where workspace_id=p_workspace and user_id=p_user;
end $$;
create or replace function public.ledger_submit_proposal(p_workspace uuid,p_type text,p_amount bigint,p_category text,p_description text,p_date date,p_method text,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare owner uuid;result uuid;
begin
 if p_workspace is distinct from public.ledger_current_workspace() or public.ledger_workspace_role(p_workspace) is distinct from 'staff' then raise exception 'Staff can submit entries only to their selected workspace.' using errcode='42501';end if;
 select owner_id into owner from public.ledger_workspaces where id=p_workspace;
 insert into public.ledger_entry_proposals(workspace_id,owner_id,user_id,type,amount_paisa,category,description,date,payment_method,notes)
 values(p_workspace,owner,auth.uid(),p_type,p_amount,trim(p_category),trim(p_description),p_date,p_method,coalesce(p_notes,'')) returning id into result;
 return result;
end $$;
create or replace function public.ledger_decide_proposal(p_proposal uuid,p_approve boolean,p_notes text) returns uuid language plpgsql security definer set search_path='' as $$
declare item public.ledger_entry_proposals%rowtype;result uuid;
begin
 select * into item from public.ledger_entry_proposals where id=p_proposal for update;
 if not found or not public.ledger_can_write_owner(auth.uid(),item.workspace_id) or item.owner_id<>auth.uid() then raise exception 'Only the selected workspace owner can review this entry.' using errcode='42501';end if;
 if item.status='approved' then
  if p_approve then return item.transaction_id;end if;raise exception 'This entry was already approved.';
 end if;
 if item.status='rejected' then
  if not p_approve then return null;end if;raise exception 'This entry was already rejected.';
 end if;
 if p_approve then
  insert into public.ledger_transactions(user_id,workspace_id,type,amount_paisa,category,description,date,payment_method,notes,expense_status)
  values(item.owner_id,item.workspace_id,item.type,item.amount_paisa,item.category,item.description,item.date,item.payment_method,item.notes,'paid') returning id into result;
 end if;
 update public.ledger_entry_proposals set status=case when p_approve then 'approved' else 'rejected' end,transaction_id=result,decision_notes=coalesce(p_notes,''),decided_at=now() where id=p_proposal;
 return result;
end $$;
revoke all on function public.ledger_list_workspaces(),public.ledger_create_workspace(text,text),public.ledger_update_workspace(uuid,text,text),public.ledger_invite_workspace(uuid,text,text),public.ledger_incoming_team_invites(),public.ledger_accept_workspace_invite(uuid),public.ledger_revoke_workspace_invite(uuid),public.ledger_change_workspace_member(uuid,uuid,text),public.ledger_remove_workspace_member(uuid,uuid),public.ledger_submit_proposal(uuid,text,bigint,text,text,date,text,text),public.ledger_decide_proposal(uuid,boolean,text) from public,anon;
grant execute on function public.ledger_list_workspaces(),public.ledger_create_workspace(text,text),public.ledger_update_workspace(uuid,text,text),public.ledger_invite_workspace(uuid,text,text),public.ledger_incoming_team_invites(),public.ledger_accept_workspace_invite(uuid),public.ledger_revoke_workspace_invite(uuid),public.ledger_change_workspace_member(uuid,uuid,text),public.ledger_remove_workspace_member(uuid,uuid),public.ledger_submit_proposal(uuid,text,bigint,text,text,date,text,text),public.ledger_decide_proposal(uuid,boolean,text) to authenticated;

-- Scope recurring preparation and generated children to the active ledger.
create or replace function public.ledger_prepare_owner(p_owner uuid,p_through date) returns int language plpgsql security definer set search_path='' as $$
declare rule public.ledger_schedules%rowtype; due date; periods int; i int; n int:=0; tx uuid; occurrence_id uuid;
begin
 if p_through is null or p_through>(now() at time zone 'Asia/Karachi')::date+366 then raise exception 'Choose a preparation horizon within the next year.'; end if;
 for rule in select * from public.ledger_schedules where user_id=p_owner and (auth.uid() is null or workspace_id=public.ledger_current_workspace()) and active and (start_date<=p_through or frequency='once') order by id for update loop
  periods:=case rule.frequency when 'once' then 0 when 'weekly' then (p_through-rule.start_date)/7 when 'monthly' then (extract(year from p_through)::int-extract(year from rule.start_date)::int)*12+extract(month from p_through)::int-extract(month from rule.start_date)::int else extract(year from p_through)::int-extract(year from rule.start_date)::int end;
  for i in 0..least(periods,10000) loop
   due:=case rule.frequency when 'once' then rule.start_date when 'weekly' then rule.start_date+i*7 when 'monthly' then (rule.start_date+make_interval(months=>i))::date else (rule.start_date+make_interval(years=>i))::date end;
   if (rule.frequency<>'once' and due>p_through) or (rule.end_date is not null and due>rule.end_date) then exit; end if;
   occurrence_id:=null;
   insert into public.ledger_occurrences(user_id,schedule_id,scheduled_date,status,type,description,category,amount_paisa,payment_method,notes)
    values(p_owner,rule.id,due,'expected',rule.type,rule.description,rule.category,rule.amount_paisa,rule.payment_method,rule.notes)
    on conflict(schedule_id,scheduled_date) do nothing returning id into occurrence_id;
   if occurrence_id is not null then
    if rule.type='expense' then
     insert into public.ledger_transactions(workspace_id,user_id,type,amount_paisa,category,description,date,payment_method,notes,expense_status,paid_date)
      values(rule.workspace_id,p_owner,'expense',rule.amount_paisa,rule.category,rule.description,due,rule.payment_method,rule.notes,'expected',null) returning id into tx;
     update public.ledger_occurrences set status='created',transaction_id=tx where id=occurrence_id;
    end if;
    n:=n+1;
   end if;
  end loop;
 end loop;
 return n;
end $$;
create or replace function public.ledger_prepare_salaries(p_month date) returns int language plpgsql security definer set search_path='' as $$
declare rule public.ledger_schedules%rowtype;due date;occurrence_id uuid;tx uuid;n int:=0;last_day date;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'1900-01-01' or p_month>'9998-12-01' or p_month>(now() at time zone 'Asia/Karachi')::date+366 then raise exception 'Choose a salary month no more than one year ahead.';end if;
 last_day:=(p_month+interval '1 month - 1 day')::date;
 for rule in select s.* from public.ledger_schedules s join public.ledger_employees e on e.schedule_id=s.id and e.user_id=s.user_id where s.user_id=auth.uid() and s.workspace_id=public.ledger_current_workspace() and s.active and e.archived_at is null order by s.id for update of s loop
  due:=p_month+(least(extract(day from rule.start_date)::int,extract(day from last_day)::int)-1);
  if due<rule.start_date or (rule.end_date is not null and due>rule.end_date) then continue;end if;
  occurrence_id:=null;
  insert into public.ledger_occurrences(user_id,schedule_id,scheduled_date,status,type,description,category,amount_paisa,payment_method,notes) values(auth.uid(),rule.id,due,'expected','expense',rule.description,'Payroll',rule.amount_paisa,rule.payment_method,rule.notes) on conflict(schedule_id,scheduled_date) do nothing returning id into occurrence_id;
  if occurrence_id is not null then
   insert into public.ledger_transactions(workspace_id,user_id,type,description,category,amount_paisa,date,payment_method,notes,expense_status) values(rule.workspace_id,auth.uid(),'expense',rule.description,'Payroll',rule.amount_paisa,due,rule.payment_method,rule.notes,'expected') returning id into tx;
   update public.ledger_occurrences set status='created',transaction_id=tx where id=occurrence_id;n:=n+1;
  end if;
 end loop;return n;
end $$;

-- Harden existing SECURITY DEFINER entry points too: RLS alone cannot protect
-- code running as a function owner. All browser mutations require owner context
-- and known record arguments are checked before even an idempotent early return.
do $$
declare item record;definition text;guard text;marker text:='-- ledger workspace entry guard';
begin
 for item in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.proname in ('ledger_prepare_schedules','ledger_prepare_salaries','ledger_confirm_income','ledger_confirm_account_income','ledger_skip_occurrence','ledger_save_employee','ledger_archive_employee','ledger_record_expense_payment','ledger_record_account_expense_payment','ledger_remove_expense_payment','ledger_record_account_transfer','ledger_grant_salary_advance','ledger_apply_salary_advance','ledger_restore_backup','ledger_list_trash','ledger_restore_record') loop
  definition:=pg_get_functiondef(item.oid);
  if strpos(definition,marker)>0 then continue;end if;
  guard:=E'\n '||marker||E'\n perform public.ledger_assert_workspace_owner();\n';
  if item.proname in ('ledger_record_expense_payment','ledger_record_account_expense_payment','ledger_apply_salary_advance') then
   guard:=guard||E' if not exists(select 1 from public.ledger_transactions where id=p_expense and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This expense is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_remove_expense_payment' then
   guard:=guard||E' if not exists(select 1 from public.ledger_expense_payments where id=p_payment and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This payment is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname in ('ledger_confirm_income','ledger_confirm_account_income','ledger_skip_occurrence') then
   guard:=guard||E' if not exists(select 1 from public.ledger_occurrences where id=p_occurrence and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This occurrence is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_save_employee' then
   guard:=guard||E' if exists(select 1 from public.ledger_employees where id=p_id) and not exists(select 1 from public.ledger_employees where id=p_id and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This employee is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_archive_employee' then
   guard:=guard||E' if not exists(select 1 from public.ledger_employees where id=p_id and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This employee is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_grant_salary_advance' then
   guard:=guard||E' if not exists(select 1 from public.ledger_employees where id=p_employee and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) or (exists(select 1 from public.ledger_salary_advances where id=p_id) and not exists(select 1 from public.ledger_salary_advances where id=p_id and workspace_id=public.ledger_current_workspace() and user_id=auth.uid())) then raise exception ''This employee or advance is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_apply_salary_advance' then
   guard:=guard||E' if not exists(select 1 from public.ledger_salary_advances where id=p_advance and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''This advance is outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  if item.proname='ledger_record_account_transfer' then
   guard:=guard||E' if not exists(select 1 from public.ledger_accounts where id=p_from and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) or not exists(select 1 from public.ledger_accounts where id=p_to and user_id=auth.uid() and workspace_id=public.ledger_current_workspace()) then raise exception ''These accounts are outside the selected workspace.'' using errcode=''42501'';end if;\n';
  end if;
  definition:=regexp_replace(definition,'(?i)\mbegin\M',E'BEGIN\n'||guard);
  execute definition;
 end loop;
end $$;

-- Receipt storage is private and follows the same owner/workspace/entry scope.
-- UUID path components are checked as text, avoiding casts of untrusted paths.
create or replace function public.ledger_receipt_path_allowed(p_path text,p_write boolean) returns boolean language plpgsql stable security definer set search_path='' as $$
declare ws uuid:=public.ledger_current_workspace();owner uuid;entry uuid;
begin
 if ws is null then return false;end if;
 select owner_id into owner from public.ledger_workspaces where id=ws;
 if split_part(p_path,'/',1) is distinct from owner::text or split_part(p_path,'/',2) is distinct from ws::text then return false;end if;
 if p_write then
  if not public.ledger_can_write_owner(owner,ws) then return false;end if;
 else
  if not public.ledger_can_read_workspace(owner,ws) then return false;end if;
 end if;
 select id into entry from public.ledger_transactions where id::text=split_part(p_path,'/',3) and user_id=owner and workspace_id=ws;
 return entry is not null and split_part(p_path,'/',4)<>'' and split_part(p_path,'/',5)='';
end $$;
revoke all on function public.ledger_receipt_path_allowed(text,boolean) from public,anon;
grant execute on function public.ledger_receipt_path_allowed(text,boolean) to authenticated,anon;
do $$begin
 if to_regclass('storage.objects') is not null then
  drop policy if exists ledger_receipts_storage_read on storage.objects;
  drop policy if exists ledger_receipts_storage_insert on storage.objects;
  drop policy if exists ledger_receipts_storage_delete on storage.objects;
  execute 'create policy ledger_receipts_storage_read on storage.objects for select to authenticated using(bucket_id=''ledger-receipts'' and public.ledger_receipt_path_allowed(name,false))';
  execute 'create policy ledger_receipts_storage_insert on storage.objects for insert to authenticated with check(bucket_id=''ledger-receipts'' and public.ledger_receipt_path_allowed(name,true))';
  execute 'create policy ledger_receipts_storage_delete on storage.objects for delete to authenticated using(bucket_id=''ledger-receipts'' and public.ledger_receipt_path_allowed(name,true))';
  -- Restrictive bucket guards also defeat unrelated permissive owner policies.
  drop policy if exists ledger_receipts_workspace_read_guard on storage.objects;
  drop policy if exists ledger_receipts_workspace_insert_guard on storage.objects;
  drop policy if exists ledger_receipts_workspace_update_guard on storage.objects;
  drop policy if exists ledger_receipts_workspace_delete_guard on storage.objects;
  execute 'create policy ledger_receipts_workspace_read_guard on storage.objects as restrictive for select to authenticated,anon using(bucket_id<>''ledger-receipts'' or public.ledger_receipt_path_allowed(name,false))';
  execute 'create policy ledger_receipts_workspace_insert_guard on storage.objects as restrictive for insert to authenticated,anon with check(bucket_id<>''ledger-receipts'' or public.ledger_receipt_path_allowed(name,true))';
  execute 'create policy ledger_receipts_workspace_update_guard on storage.objects as restrictive for update to authenticated,anon using(bucket_id<>''ledger-receipts'' or public.ledger_receipt_path_allowed(name,true)) with check(bucket_id<>''ledger-receipts'' or public.ledger_receipt_path_allowed(name,true))';
  execute 'create policy ledger_receipts_workspace_delete_guard on storage.objects as restrictive for delete to authenticated,anon using(bucket_id<>''ledger-receipts'' or public.ledger_receipt_path_allowed(name,true))';
 end if;
end $$;
notify pgrst,'reload schema';
commit;
