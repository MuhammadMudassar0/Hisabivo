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
