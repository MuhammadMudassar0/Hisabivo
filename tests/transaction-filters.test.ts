import test from 'node:test';
import assert from 'node:assert/strict';
import {dateRange,filterTransactions,pakistanToday,bikeCategoryFilter} from '../lib/transaction-filters';
import {type Transaction,type ExpensePayment} from '../lib/ledger';
const day='2026-11-26';
const entry=(id:string,amount:number,date:string,category='Fuel',extra:Partial<Transaction>={}):Transaction=>({id,type:'expense',amount_paisa:amount,date,category,description:id,payment_method:'Cash',notes:'',created_at:`${date}T12:00:00Z`,...extra});
const payment=(id:string,amount:number,date:string,extra:Partial<ExpensePayment>={}):ExpensePayment=>({id,expense_id:'bill',amount_paisa:amount,date,payment_method:'Cash',notes:'',created_at:`${date}T12:00:00Z`,...extra});
const all=dateRange('all','2026-11',day,{start:day,end:day});

test('today is the Pakistan calendar day even when UTC/browser day differs',()=>{
 assert.equal(pakistanToday(new Date('2026-11-25T18:59:59Z')),'2026-11-25');
 assert.equal(pakistanToday(new Date('2026-11-25T19:00:00Z')),'2026-11-26');
});
test('date presets cover inclusive days across months and validate custom dates',()=>{
 assert.deepEqual(dateRange('today','2026-11',day,{start:day,end:day}),{start:day,end:day});
 assert.deepEqual(dateRange('last7','2026-11','2026-11-03',{start:day,end:day}),{start:'2026-10-28',end:'2026-11-03'});
 assert.deepEqual(dateRange('last30','2026-11',day,{start:day,end:day}),{start:'2026-10-28',end:day});
 assert.deepEqual(dateRange('month','2024-02',day,{start:day,end:day}),{start:'2024-02-01',end:'2024-02-29'});
 assert.throws(()=>dateRange('custom','2026-11',day,{start:day,end:'2026-11-25'}));
 assert.throws(()=>dateRange('custom','2026-11',day,{start:'2026-02-30',end:day}));
});
test('daily spending uses payment dates and installments, not bill totals or advance credits',()=>{
 const rows=[entry('bill',100000,'2026-10-15','Bike maintenance',{payment_tracking:true,expense_status:'partial',paid_date:null,payments:[payment('old',20000,'2026-11-25'),payment('today',30000,day),payment('credit',10000,day,{advance_id:'advance'})]}),entry('paid-later',427500,'2026-11-25','Personal care',{paid_date:day}),entry('yesterday',90000,'2026-11-25'),entry('future-bill',50000,day,'Medicine',{expense_status:'expected'}),entry('deleted',99999,day,'Fuel',{deleted_at:day}),entry('income',1000000,day,'Salary',{type:'income'})];
 const daily=filterTransactions(rows,{range:{start:day,end:day},asOf:day,type:'expense'});
 assert.equal(daily.expense,457500);
 assert.equal(daily.cashRows.length,2);
 assert.equal(daily.income,0);
 assert.equal(daily.expected,90000);
 assert.equal(daily.rows.filter(row=>row.id==='bill').length,1);
});
test('all-time category/group filters include older expenses and totals follow search and type filters',()=>{
 const rows=[entry('old-bike',10000,'2026-02-01','Bike maintenance'),entry('fuel-today',20000,day),entry('child',30000,day,'Child expenses'),entry('personal',40000,day,'Personal care'),entry('income',50000,day,'Salary',{type:'income'}),entry('planned',70000,'2026-12-10','Fuel',{expense_status:'expected'}),entry('future-receipt',90000,'2026-12-10','Salary',{type:'income'})];
 const bike=filterTransactions(rows,{range:all,asOf:day,category:bikeCategoryFilter});
 assert.deepEqual(bike.rows.map(row=>row.id),['planned','fuel-today','old-bike']);
 assert.equal(bike.expense,30000);
 assert.equal(bike.expected,70000);
 assert.equal(filterTransactions(rows,{range:all,asOf:day,category:'category:Child expenses'}).expense,30000);
 assert.equal(filterTransactions(rows,{range:all,asOf:day,category:'category:Personal care',query:'personal'}).expense,40000);
 assert.equal(filterTransactions(rows,{range:all,asOf:day,type:'income'}).income,50000);
 assert.equal(filterTransactions(rows,{range:all,asOf:day,query:'not found'}).rows.length,0);
 assert.equal(filterTransactions(rows,{range:all,asOf:day}).rows.length,7,'All time retains future planned records');
});
test('custom dates are inclusive and historical unpaid remainders use the end of the period',()=>{
 const rows=[entry('bill',100000,'2026-11-10','Medicine',{payment_tracking:true,payments:[payment('nov',25000,day),payment('dec',75000,'2026-12-01')],expense_status:'paid',paid_date:'2026-12-01'}),entry('start',1000,'2026-11-01'),entry('end',2000,'2026-11-30'),entry('before',9000,'2026-10-31'),entry('after',9000,'2026-12-01')];
 const november=filterTransactions(rows,{range:{start:'2026-11-01',end:'2026-11-30'},asOf:'2026-12-02'});
 assert.equal(november.expense,28000);
 assert.equal(november.expected,75000);
 assert.equal(november.rows.length,3);
 assert.equal(filterTransactions(rows,{range:all,asOf:'2026-12-02',status:'expected'}).expense,0);
});
