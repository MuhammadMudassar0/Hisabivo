import test from 'node:test';import assert from 'node:assert/strict';
import {expensePaid,expenseRemaining,monthSummary,normalizeEntry,pendingExpenses,categoryTotals,type Transaction} from '../lib/ledger';
import {addDays,buildReminders,calendarReminder,scheduleDates,scheduledDate,visibleReminders,type Schedule,type Occurrence} from '../lib/planning';
import {createMonthlyPdf} from '../lib/pdf';
const bill:Transaction={id:'bill',type:'expense',amount_paisa:2000000,date:'2026-11-20',description:'School fee',category:'Education',payment_method:'Cash',notes:'',created_at:'2026-11-01',expense_status:'expected',paid_date:null,payment_tracking:true,payments:[]};
const installment=(id:string,date:string,amount_paisa:number)=>({id,expense_id:'bill',date,amount_paisa,payment_method:'Cash' as const,notes:'installment',created_at:date});
const rule:Schedule={id:'rule',type:'income',frequency:'monthly',start_date:'2026-01-31',end_date:null,active:true,amount_paisa:1000000,description:'Client retainer',category:'Freelance',notes:'',payment_method:'Bank transfer',reminder_days:3,created_at:'2026-01-01'};
test('partial payments across months reconcile spending, carried cash, categories, and historical unpaid balances',()=>{
 const partial=normalizeEntry({...bill,payments:[installment('p1','2026-11-23',700000)]});assert.equal(partial.expense_status,'partial');assert.equal(expensePaid(partial),700000);assert.equal(expenseRemaining(partial),1300000);
 const paid=normalizeEntry({...partial,payments:[...partial.payments!,installment('p2','2026-12-05',1300000)]});assert.equal(paid.expense_status,'paid');assert.equal(paid.paid_date,'2026-12-05');
 const nov=monthSummary([paid],'2026-11'),dec=monthSummary([paid],'2026-12');assert.equal(nov.expense,700000);assert.equal(nov.expected,1300000);assert.equal(dec.expense,1300000);assert.equal(dec.opening,-700000);assert.equal(dec.closing,-2000000);assert.equal(dec.rows.length,1);assert.equal(nov.cashRows.length,1);assert.deepEqual(categoryTotals(nov.cashRows),[{name:'Education',amount:700000}]);
 assert.equal(expenseRemaining(pendingExpenses([paid],'2026-11')[0],'2026-11-30'),1300000);assert.equal(pendingExpenses([paid],'2026-12').length,0);
 const undone=normalizeEntry({...paid,payments:[installment('p1','2026-11-23',700000)]});assert.equal(undone.expense_status,'partial');assert.equal(monthSummary([undone],'2026-12').expense,0);
});
test('monthly and leap-year recurrence uses the original anchor without drifting',()=>{
 assert.equal(scheduledDate(rule,1),'2026-02-28');assert.equal(scheduledDate(rule,2),'2026-03-31');
 assert.equal(scheduledDate({...rule,frequency:'yearly',start_date:'2024-02-29'},1),'2025-02-28');assert.equal(scheduledDate({...rule,frequency:'yearly',start_date:'2024-02-29'},4),'2028-02-29');
 assert.equal(addDays('2026-12-31',1),'2027-01-01');assert.deepEqual(scheduleDates({...rule,end_date:'2026-02-28'},'2026-06-01'),['2026-01-31','2026-02-28']);assert.deepEqual(scheduleDates({...rule,active:false},'2026-06-01'),[]);
});
test('reminders exclude fully paid bills and settled Udhar, include remaining installments, and honor snooze/dismiss',()=>{
 const partial=normalizeEntry({...bill,payments:[installment('p','2026-11-22',700000)]});
 const income:Occurrence={...rule,id:'income',schedule_id:'rule',scheduled_date:'2026-11-28',status:'expected',transaction_id:null};
 const reminders=buildReminders([partial],[],[],[income],'2026-11-25');assert.equal(reminders.length,2);assert.equal(reminders[0].amount_paisa,1300000);
 const states=[{reminder_id:reminders[0].id,dismissed:false,snoozed_until:'2026-11-26'},{reminder_id:reminders[1].id,dismissed:true,snoozed_until:null}];assert.equal(visibleReminders(reminders,states,'2026-11-25').length,0);assert.equal(visibleReminders(reminders,states,'2026-11-26').length,1);
 const calendar=calendarReminder({...reminders[0],title:'School, fee; reminder\nMore'});assert.ok(calendar.includes('School\\, fee\\; reminder\\nMore'));assert.ok(calendar.includes('DTSTART;VALUE=DATE:20261120'));
});
test('PDF records installment cash once and separates expected income and unpaid bill remainder',()=>{
 const partial=normalizeEntry({...bill,payments:[installment('p','2026-11-22',700000)]});const income:Occurrence={...rule,id:'income',schedule_id:'rule',scheduled_date:'2026-11-28',status:'expected',transaction_id:null};const pdf=createMonthlyPdf([partial],'2026-11','Test',false,undefined,[income]).output();assert.ok(pdf.includes('Expected income - not received'));assert.ok(pdf.includes('Rs 13,000.00'));assert.ok(pdf.includes('Rs 7,000.00'));
});
