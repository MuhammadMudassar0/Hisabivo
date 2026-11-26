-- Apply after setup-planning.sql. Salary payments reuse the existing expense ledger.
begin;
create table if not exists public.ledger_employees (
 id uuid primary key,user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check(char_length(trim(name)) between 1 and 80),role text not null default '' check(char_length(role)<=80),
 base_paisa bigint not null check(base_paisa between 1 and 99999999999),allowance_paisa bigint not null default 0 check(allowance_paisa between 0 and 99999999999),
 deduction_paisa bigint not null default 0 check(deduction_paisa between 0 and 99999999999),
 joining_date date not null check(joining_date between '1900-01-01' and '9998-12-31'),notes text not null default '' check(char_length(notes)<=300),
 schedule_id uuid not null unique,archived_at timestamptz,created_at timestamptz not null default now(),
 check(base_paisa+allowance_paisa-deduction_paisa between 1 and 99999999999),
 foreign key(schedule_id,user_id) references public.ledger_schedules(id,user_id) on delete no action
);
alter table public.ledger_employees enable row level security;
revoke all on public.ledger_employees from public,anon,authenticated;
grant select on public.ledger_employees to authenticated;
drop policy if exists ledger_owner_employees on public.ledger_employees;
create policy ledger_owner_employees on public.ledger_employees for select to authenticated using((select auth.uid())=user_id);
create index if not exists ledger_employees_owner on public.ledger_employees(user_id,name);

create or replace function public.ledger_salary_schedule_guard() returns trigger language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;
begin
 select * into employee from public.ledger_employees where schedule_id=old.id;
 if found then
  if new.type<>'expense' or new.frequency<>'monthly' or new.category<>'Payroll' or new.description<>('Salary — '||employee.name) or new.amount_paisa<>employee.base_paisa+employee.allowance_paisa-employee.deduction_paisa then raise exception 'Edit employee salary details from the Salaries page.'; end if;
  if employee.archived_at is not null and new.active then raise exception 'Reactivate this employee from the Salaries page first.'; end if;
 end if;return new;
end $$;
drop trigger if exists ledger_salary_schedule_guard on public.ledger_schedules;
create trigger ledger_salary_schedule_guard before update on public.ledger_schedules for each row execute function public.ledger_salary_schedule_guard();

create or replace function public.ledger_salary_bill_guard() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if (new.type<>'expense' or new.category<>'Payroll') and exists(select 1 from public.ledger_occurrences o join public.ledger_employees e on e.schedule_id=o.schedule_id where o.transaction_id=old.id and o.user_id=old.user_id) then raise exception 'Salary bills must remain Payroll expenses.';end if;
 return new;
end $$;
drop trigger if exists ledger_salary_bill_guard on public.ledger_transactions;
create trigger ledger_salary_bill_guard before update on public.ledger_transactions for each row execute function public.ledger_salary_bill_guard();

create or replace function public.ledger_save_employee(p_id uuid,p_name text,p_role text,p_base bigint,p_allowance bigint,p_deduction bigint,p_joining date,p_first_pay date,p_method text,p_notes text)
returns uuid language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;schedule_id uuid;net bigint;salary_notes text;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_id is null then raise exception 'A request identity is required.';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into employee from public.ledger_employees where id=p_id;
 if found and employee.user_id<>auth.uid() then raise exception 'Employee unavailable.' using errcode='42501';end if;
 if employee.archived_at is not null then raise exception 'Reactivate this employee before editing salary details.';end if;
 if p_joining is null or p_first_pay is null or p_first_pay<p_joining or p_first_pay>'9998-12-31' then raise exception 'The first salary date must be on or after joining.';end if;
 net:=p_base+p_allowance-p_deduction;
 if net is null or net<=0 or net>99999999999 then raise exception 'Enter a positive net salary within the supported PKR limit.';end if;
 salary_notes:=format('Base PKR %s | Allowances PKR %s | Manual deductions PKR %s%s',p_base/100.0,p_allowance/100.0,p_deduction/100.0,case when coalesce(p_notes,'')='' then '' else E'\n'||p_notes end);
 if employee.id is null then
  insert into public.ledger_schedules(user_id,type,description,category,amount_paisa,payment_method,notes,start_date,frequency,reminder_days) values(auth.uid(),'expense','Salary — '||trim(p_name),'Payroll',net,p_method,salary_notes,p_first_pay,'monthly',3) returning id into schedule_id;
  insert into public.ledger_employees(id,user_id,name,role,base_paisa,allowance_paisa,deduction_paisa,joining_date,notes,schedule_id) values(p_id,auth.uid(),trim(p_name),trim(coalesce(p_role,'')),p_base,p_allowance,p_deduction,p_joining,coalesce(p_notes,''),schedule_id);
 else
  perform 1 from public.ledger_schedules where id=employee.schedule_id and user_id=auth.uid() for update;
  update public.ledger_employees set name=trim(p_name),role=trim(coalesce(p_role,'')),base_paisa=p_base,allowance_paisa=p_allowance,deduction_paisa=p_deduction,joining_date=p_joining,notes=coalesce(p_notes,'') where id=p_id;
  update public.ledger_schedules set description='Salary — '||trim(p_name),amount_paisa=net,payment_method=p_method,notes=salary_notes,start_date=p_first_pay where id=employee.schedule_id;
 end if;return p_id;
end $$;
create or replace function public.ledger_archive_employee(p_id uuid,p_archived boolean) returns void language plpgsql security definer set search_path='' as $$
declare employee public.ledger_employees%rowtype;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_id::text,0));
 select * into employee from public.ledger_employees where id=p_id and user_id=auth.uid();
 if not found then raise exception 'Employee unavailable.' using errcode='42501';end if;
 perform 1 from public.ledger_schedules where id=employee.schedule_id for update;
 update public.ledger_employees set archived_at=case when p_archived then coalesce(archived_at,now()) else null end where id=p_id;
 update public.ledger_schedules set active=not p_archived where id=employee.schedule_id;
end $$;
create or replace function public.ledger_prepare_salaries(p_month date) returns int language plpgsql security definer set search_path='' as $$
declare rule public.ledger_schedules%rowtype;due date;occurrence_id uuid;tx uuid;n int:=0;last_day date;
begin
 if auth.uid() is null then raise exception 'Sign in first.' using errcode='42501';end if;
 if p_month is null or extract(day from p_month)<>1 or p_month<'1900-01-01' or p_month>'9998-12-01' or p_month>(now() at time zone 'Asia/Karachi')::date+366 then raise exception 'Choose a salary month no more than one year ahead.';end if;
 last_day:=(p_month+interval '1 month - 1 day')::date;
 for rule in select s.* from public.ledger_schedules s join public.ledger_employees e on e.schedule_id=s.id and e.user_id=s.user_id where s.user_id=auth.uid() and s.active and e.archived_at is null order by s.id for update of s loop
  due:=p_month+(least(extract(day from rule.start_date)::int,extract(day from last_day)::int)-1);
  if due<rule.start_date or (rule.end_date is not null and due>rule.end_date) then continue;end if;
  occurrence_id:=null;
  insert into public.ledger_occurrences(user_id,schedule_id,scheduled_date,status,type,description,category,amount_paisa,payment_method,notes) values(auth.uid(),rule.id,due,'expected','expense',rule.description,'Payroll',rule.amount_paisa,rule.payment_method,rule.notes) on conflict(schedule_id,scheduled_date) do nothing returning id into occurrence_id;
  if occurrence_id is not null then
   insert into public.ledger_transactions(user_id,type,description,category,amount_paisa,date,payment_method,notes,expense_status) values(auth.uid(),'expense',rule.description,'Payroll',rule.amount_paisa,due,rule.payment_method,rule.notes,'expected') returning id into tx;
   update public.ledger_occurrences set status='created',transaction_id=tx where id=occurrence_id;n:=n+1;
  end if;
 end loop;return n;
end $$;
revoke all on function public.ledger_salary_schedule_guard(),public.ledger_salary_bill_guard(),public.ledger_save_employee(uuid,text,text,bigint,bigint,bigint,date,date,text,text),public.ledger_archive_employee(uuid,boolean),public.ledger_prepare_salaries(date) from public,anon;
grant execute on function public.ledger_save_employee(uuid,text,text,bigint,bigint,bigint,date,date,text,text),public.ledger_archive_employee(uuid,boolean),public.ledger_prepare_salaries(date) to authenticated;
notify pgrst,'reload schema';
commit;
