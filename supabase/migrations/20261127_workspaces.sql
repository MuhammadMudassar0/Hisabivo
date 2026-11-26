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
