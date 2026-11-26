-- Account migration checks for a fresh, disposable PostgreSQL test database.
-- The runner loads 20261127_accounts.sql at the marked boundary below.
create role anon;
create role authenticated;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
grant usage on schema auth to authenticated;
insert into auth.users values('a1111111-1111-4111-a111-111111111111'),('b2222222-2222-4222-b222-222222222222');
create table public.ledger_transactions(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),type text not null,date date not null,amount_paisa bigint not null default 100,payment_method text default 'Cash',expense_status text default 'paid',payment_tracking boolean default false,paid_date date);
create table public.ledger_expense_payments(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),date date not null);
create table public.ledger_loans(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),date date not null);
create table public.ledger_loan_payments(id uuid primary key default gen_random_uuid(),user_id uuid not null default auth.uid(),date date not null);
grant select,insert,update on public.ledger_transactions,public.ledger_expense_payments,public.ledger_loans,public.ledger_loan_payments to authenticated;
create function public.test_account_assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception 'Assertion failed: %',label;end if;end$$;
create function public.test_account_reject(statement text,expected text) returns void language plpgsql as $$begin
 begin execute statement;exception when others then if position(expected in sqlerrm)>0 then return;end if;raise exception 'Wrong rejection: % (expected %)',sqlerrm,expected;end;
 raise exception 'Expected rejection: %',expected;
end$$;

-- MIGRATION_BOUNDARY

insert into public.ledger_accounts(id,user_id,name,kind,opening_balance_paisa,opening_date) values
 ('c1111111-1111-4111-a111-111111111111','a1111111-1111-4111-a111-111111111111','Cash','cash',100000,current_date-10),
 ('c2222222-2222-4222-a222-222222222222','a1111111-1111-4111-a111-111111111111','Bank','bank',200000,current_date-10),
 ('c3333333-3333-4333-a333-333333333333','b2222222-2222-4222-b222-222222222222','Cash','cash',300000,current_date-10);
set role authenticated;
set request.jwt.claim.sub='a1111111-1111-4111-a111-111111111111';
select public.test_account_assert((select count(*)=2 from public.ledger_accounts),'Owner sees only own accounts');
select public.test_account_reject($q$insert into public.ledger_accounts(user_id,name,kind,opening_date) values('b2222222-2222-4222-b222-222222222222','Forged','cash',current_date)$q$,'row-level security');
select public.test_account_reject($q$insert into public.ledger_accounts(name,kind,opening_date) values(' cash ','cash',current_date)$q$,'duplicate key');
select public.test_account_reject($q$insert into public.ledger_accounts(name,kind,opening_date) values('Future','cash',current_date+1)$q$,'today or earlier');
select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',10000,current_date,'ATM','d1111111-1111-4111-a111-111111111111');
select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',10000,current_date,'ATM','d1111111-1111-4111-a111-111111111111');
select public.test_account_assert((select count(*)=1 from public.ledger_account_transfers),'Repeated request creates one transfer');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',10001,current_date,'ATM','d1111111-1111-4111-a111-111111111111')$q$,'another transfer');
select public.test_account_reject($q$select public.ledger_record_account_transfer('b2222222-2222-4222-b222-222222222222','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',10000,current_date,'','d2222222-2222-4222-a222-222222222222')$q$,'Only the workspace owner');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c3333333-3333-4333-a333-333333333333',10000,current_date,'','d2222222-2222-4222-a222-222222222222')$q$,'two active accounts');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111',10000,current_date,'','d2222222-2222-4222-a222-222222222222')$q$,'two different');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',0,current_date,'','d2222222-2222-4222-a222-222222222222')$q$,'positive amount');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',100,current_date+1,'','d2222222-2222-4222-a222-222222222222')$q$,'actual transfer date');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',100,current_date-11,'','d2222222-2222-4222-a222-222222222222')$q$,'actual transfer date');
select public.test_account_reject($q$insert into public.ledger_account_transfers(id,user_id,from_account_id,to_account_id,amount_paisa,date,request_id) values('d2222222-2222-4222-a222-222222222222',auth.uid(),'c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',100,current_date,'d2222222-2222-4222-a222-222222222222')$q$,'permission denied');
select public.test_account_reject($q$insert into public.ledger_transactions(type,date,account_id) values('income',current_date,'c3333333-3333-4333-a333-333333333333')$q$,'same workspace owner');
select public.test_account_reject($q$insert into public.ledger_transactions(type,date,account_id) values('income',current_date-11,'c1111111-1111-4111-a111-111111111111')$q$,'starting balance date');
select public.test_account_reject($q$insert into public.ledger_expense_payments(date,account_id) values(current_date,'c3333333-3333-4333-a333-333333333333')$q$,'same workspace owner');
insert into public.ledger_transactions(type,date,account_id,payment_method) values('income',current_date,null,'Bank transfer');
select public.test_account_assert((select account_id is null from public.ledger_transactions limit 1),'Method never assigns a named account');
select public.test_account_reject($q$update public.ledger_accounts set opening_balance_paisa=10 where id='c1111111-1111-4111-a111-111111111111'$q$,'cannot change after');
update public.ledger_accounts set archived=true where id='c1111111-1111-4111-a111-111111111111';
select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',10000,current_date,'ATM','d1111111-1111-4111-a111-111111111111');
select public.test_account_reject($q$select public.ledger_record_account_transfer('a1111111-1111-4111-a111-111111111111','c1111111-1111-4111-a111-111111111111','c2222222-2222-4222-a222-222222222222',100,current_date,'','d2222222-2222-4222-a222-222222222222')$q$,'two active accounts');
select public.test_account_reject($q$insert into public.ledger_transactions(type,date,account_id) values('income',current_date,'c1111111-1111-4111-a111-111111111111')$q$,'active account');
set request.jwt.claim.sub='b2222222-2222-4222-b222-222222222222';
select public.test_account_assert((select count(*)=1 from public.ledger_accounts),'Second owner isolated');
select public.test_account_assert((select count(*)=0 from public.ledger_account_transfers),'Second owner cannot see transfers');
reset role;
set role anon;
select public.test_account_reject('select * from public.ledger_accounts','permission denied');
select public.test_account_reject($q$select public.ledger_record_account_transfer(null,null,null,1,current_date,'',gen_random_uuid())$q$,'permission denied');
reset role;
