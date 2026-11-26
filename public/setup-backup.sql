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
