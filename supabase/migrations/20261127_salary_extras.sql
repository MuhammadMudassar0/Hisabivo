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
