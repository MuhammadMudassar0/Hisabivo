import {expenseCashRows,expenseRemaining,isExpectedExpense,monthEnd,transactionDate,validDate,type Transaction} from './ledger';

export type DatePreset='all'|'month'|'today'|'last7'|'last30'|'custom';
export type TransactionTypeFilter='all'|'income'|'expense'|'expected';
export type DateRange={start:string;end:string};
export type TransactionFilters={range:DateRange;asOf:string;type?:TransactionTypeFilter;category?:string;query?:string;status?:string};
export const bikeCategoryFilter='group:bike';
/** A calendar day in Pakistan, independent of the browser/server's time zone. */
export function pakistanToday(now=new Date()){
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Karachi',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
 const part=(type:string)=>parts.find(item=>item.type===type)!.value;
 return `${part('year')}-${part('month')}-${part('day')}`;
}
function previousDay(date:string,days:number){const value=new Date(`${date}T12:00:00Z`);value.setUTCDate(value.getUTCDate()-days);return value.toISOString().slice(0,10);}
export function dateRange(preset:DatePreset,month:string,day:string,custom:DateRange):DateRange{
 if(!validDate(day))throw new Error('Choose a valid reporting date.');
 if(preset==='all')return{start:'1900-01-01',end:'9999-12-31'};
 if(preset==='today')return{start:day,end:day};
 if(preset==='last7'||preset==='last30')return{start:previousDay(day,preset==='last7'?6:29),end:day};
 if(preset==='month'){if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)||!validDate(`${month}-01`))throw new Error('Choose a valid month.');return{start:`${month}-01`,end:monthEnd(month)};}
 if(!validDate(custom.start)||!validDate(custom.end)||custom.end<custom.start)throw new Error('Choose an end date on or after the start date.');
 return custom;
}
export function matchesCategory(entry:Transaction,category='all'){
 if(category==='all')return true;
 if(category===bikeCategoryFilter)return entry.type==='expense'&&['Fuel','Bike maintenance'].includes(entry.category);
 return entry.category===category.replace(/^category:/,'');
}
export function filterTransactions(entries:Transaction[],filters:TransactionFilters){
 const {range,asOf}=filters;
 const inRange=(date:string)=>date>=range.start&&date<=range.end;
 // Scheduled bills remain visible, including payments made on a later date.
 const periodRows=entries.filter(entry=>!entry.deleted_at&&(entry.type==='income'?inRange(entry.date):inRange(entry.date)||inRange(transactionDate(entry))||(entry.payments||[]).some(payment=>inRange(payment.date))));
 const search=(filters.query||'').trim().toLocaleLowerCase();
 const matching=periodRows.filter(entry=>matchesCategory(entry,filters.category)&&(!search||`${entry.description} ${entry.category} ${entry.payment_method} ${entry.notes} ${(entry.payments||[]).map(payment=>`${payment.notes} ${payment.payment_method}`).join(' ')}`.toLocaleLowerCase().includes(search))&&(!filters.status||filters.status==='all'||entry.type==='expense'&&(filters.status==='expected'?isExpectedExpense(entry):filters.status==='partial'?entry.expense_status==='partial':!isExpectedExpense(entry)&&entry.expense_status!=='partial')));
 const counts={all:matching.length,income:matching.filter(entry=>entry.type==='income').length,expense:matching.filter(entry=>entry.type==='expense').length,expected:matching.filter(isExpectedExpense).length};
 const rows=matching.filter(entry=>!filters.type||filters.type==='all'||(filters.type==='expected'?isExpectedExpense(entry):entry.type===filters.type)).sort((a,b)=>{
  const latest=(entry:Transaction)=>[entry.date,transactionDate(entry),...(entry.payments||[]).map(payment=>payment.date)].filter(inRange).sort().at(-1)||entry.date;
  return latest(b).localeCompare(latest(a))||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id);
 });
 const through=range.end<asOf?range.end:asOf;
 const cashRows=expenseCashRows(rows).filter(entry=>inRange(transactionDate(entry))&&transactionDate(entry)<=through);
 const income=cashRows.filter(entry=>entry.type==='income').reduce((sum,entry)=>sum+entry.amount_paisa,0);
 const expense=cashRows.filter(entry=>entry.type==='expense').reduce((sum,entry)=>sum+entry.amount_paisa,0);
 const expected=rows.filter(entry=>entry.type==='expense').reduce((sum,entry)=>sum+expenseRemaining(entry,through),0);
 return{rows,cashRows,income,expense,net:income-expense,expected,counts};
}
