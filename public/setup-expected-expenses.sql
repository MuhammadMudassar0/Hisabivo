-- Existing expenses remain paid. Expected bills do not move cash until marked paid.
begin;
alter table public.ledger_transactions add column if not exists expense_status text not null default 'paid';
alter table public.ledger_transactions add column if not exists paid_date date;
update public.ledger_transactions set paid_date = date where type = 'expense' and expense_status = 'paid' and paid_date is null;
update public.ledger_transactions set paid_date = null where type = 'income';

-- Preserve the newer partial-payment normalizer and constraints on existing installations.
do $upgrade$ begin
 if not exists(select 1 from information_schema.columns where table_schema='public' and table_name='ledger_transactions' and column_name='payment_tracking') then
  execute $legacy$
alter table public.ledger_transactions drop constraint if exists ledger_expense_status_valid;
alter table public.ledger_transactions add constraint ledger_expense_status_valid check (expense_status in ('paid', 'expected'));
alter table public.ledger_transactions drop constraint if exists ledger_expense_payment_metadata;
alter table public.ledger_transactions add constraint ledger_expense_payment_metadata check (
  (type = 'income' and expense_status = 'paid' and paid_date is null)
  or (type = 'expense' and (
    (expense_status = 'expected' and paid_date is null)
    or (expense_status = 'paid' and paid_date is not null and paid_date between '1900-01-01' and '9999-12-31')
  ))
);

create or replace function public.ledger_normalize_expense_payment()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.expense_status := coalesce(new.expense_status, 'paid');
  if new.type = 'income' then
    if new.expense_status = 'expected' then
      raise exception 'Only expenses can be marked expected.' using errcode = '23514';
    end if;
    new.paid_date := null;
  elsif new.expense_status = 'expected' then
    new.paid_date := null;
  elsif new.expense_status = 'paid' then
    new.paid_date := coalesce(new.paid_date, new.date);
  end if;
  return new;
end;
$$;
revoke all on function public.ledger_normalize_expense_payment() from public, anon;
grant execute on function public.ledger_normalize_expense_payment() to authenticated;
drop trigger if exists ledger_expense_payment_normalization on public.ledger_transactions;
create trigger ledger_expense_payment_normalization before insert or update on public.ledger_transactions
  for each row execute function public.ledger_normalize_expense_payment();

$legacy$;
 end if;
end $upgrade$;

create index if not exists ledger_transactions_owner_paid_date on public.ledger_transactions(user_id, paid_date);
create index if not exists ledger_transactions_owner_expected_date on public.ledger_transactions(user_id, date) where expense_status = 'expected';
notify pgrst, 'reload schema';
commit;
