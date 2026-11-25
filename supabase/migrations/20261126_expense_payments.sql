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
