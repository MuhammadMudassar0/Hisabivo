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
