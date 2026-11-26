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
