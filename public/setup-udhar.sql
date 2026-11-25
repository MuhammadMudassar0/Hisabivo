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
