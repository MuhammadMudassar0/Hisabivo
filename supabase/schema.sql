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
create unique index if not exists ledger_categories_owner_name on public.ledger_categories(user_id, type, lower(trim(name)));

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
