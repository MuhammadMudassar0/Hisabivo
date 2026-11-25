import { expenseRemaining, paymentMethods, validDate, type PaymentMethod, type Transaction } from './ledger';
import { loanRemaining, type UdharLoan, type UdharPayment } from './udhar';
export type Schedule = { id:string;user_id?:string;type:'income'|'expense';description:string;category:string;amount_paisa:number;payment_method:PaymentMethod;notes:string;start_date:string;end_date:string|null;frequency:'once'|'weekly'|'monthly'|'yearly';reminder_days:number;active:boolean;created_at:string };
export type ScheduleInput=Omit<Schedule,'id'|'user_id'|'created_at'>;
export type Occurrence={id:string;user_id?:string;schedule_id:string;scheduled_date:string;status:'expected'|'created'|'skipped';transaction_id:string|null;created_at:string;description:string;category:string;amount_paisa:number;payment_method:PaymentMethod;notes:string;type:'income'|'expense'};
export type ReminderState={reminder_id:string;dismissed:boolean;snoozed_until:string|null};
export type Reminder={id:string;kind:'bill'|'udhar'|'income';title:string;description:string;date:string;amount_paisa:number;direction:'pay'|'receive';targetId:string;notify_date?:string};
export function addDays(date:string,days:number){const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}
export function validateSchedule(input:ScheduleInput){
 if(!['income','expense'].includes(input.type)||!['once','weekly','monthly','yearly'].includes(input.frequency))throw new Error('Choose a valid type and repeat frequency.');
 if(!validDate(input.start_date)||input.start_date>'9998-12-31'||input.end_date!==null&&(!validDate(input.end_date)||input.end_date<input.start_date))throw new Error('Choose a valid start date and an end date on or after it.');
 if(!Number.isSafeInteger(input.amount_paisa)||input.amount_paisa<=0||input.amount_paisa>99999999999)throw new Error('Enter a valid positive PKR amount.');
 if(!input.description.trim()||input.description.length>100||!input.category.trim()||input.category.length>60||input.notes.length>500)throw new Error('Check the description, category, and notes.');
 if(!paymentMethods.includes(input.payment_method)||![0,1,3,7].includes(input.reminder_days))throw new Error('Choose a valid method and reminder time.');
}
// Every month is calculated from the original anchor: Jan 31 -> Feb 28 -> Mar 31.
export function scheduledDate(rule:Pick<Schedule,'start_date'|'frequency'>,index:number){
 if(!Number.isInteger(index)||index<0)throw new Error('Invalid occurrence.');
 if(rule.frequency==='once')return index===0?rule.start_date:null;
 if(rule.frequency==='weekly')return addDays(rule.start_date,index*7);
 const [year,month,day]=rule.start_date.split('-').map(Number);
 const m=month-1+(rule.frequency==='monthly'?index:index*12);const y=year+Math.floor(m/12);if(y>9999)return null;
 const target=m%12;const last=new Date(Date.UTC(y,target+1,0)).getUTCDate();return `${String(y).padStart(4,'0')}-${String(target+1).padStart(2,'0')}-${String(Math.min(day,last)).padStart(2,'0')}`;
}
export function scheduleDates(rule:Schedule,through:string){
 const dates:string[]=[];if(!rule.active)return dates;
 for(let i=0;i<10000;i++){const date=scheduledDate(rule,i);if(!date||date>through||rule.end_date&&date>rule.end_date)break;dates.push(date);}
 return dates;
}
export function buildReminders(entries:Transaction[],loans:UdharLoan[],payments:UdharPayment[],occurrences:Occurrence[],asOf:string,days=7,schedules:Schedule[]=[]):Reminder[]{
 const until=addDays(asOf,days);
 const bills=entries.filter(e=>e.type==='expense'&&e.date<=until&&expenseRemaining(e,asOf)>0).map(e=>({id:`bill:${e.id}`,kind:'bill' as const,title:e.description,description:e.category,date:e.date,amount_paisa:expenseRemaining(e,asOf),direction:'pay' as const,targetId:e.id}));
 const debt=loans.filter(l=>l.due_date&&l.due_date<=until&&l.date<=asOf&&loanRemaining(l,payments.filter(p=>p.date<=asOf))>0).map(l=>({id:`udhar:${l.id}`,kind:'udhar' as const,title:l.person,description:l.direction==='given'?'Udhar to receive':'Udhar to repay',date:l.due_date!,amount_paisa:loanRemaining(l,payments.filter(p=>p.date<=asOf)),direction:l.direction==='given'?'receive' as const:'pay' as const,targetId:l.id}));
 const income=occurrences.filter(o=>o.type==='income'&&o.status==='expected'&&o.scheduled_date<=until).map(o=>({id:`income:${o.id}`,kind:'income' as const,title:o.description,description:o.category,date:o.scheduled_date,amount_paisa:o.amount_paisa,direction:'receive' as const,targetId:o.id}));
 return [...bills,...debt,...income].map(r=>{const occurrence=occurrences.find(o=>o.id===r.targetId||o.transaction_id===r.targetId);const rule=schedules.find(s=>s.id===occurrence?.schedule_id);return {...r,notify_date:addDays(r.date,-(rule?.reminder_days??3))};}).sort((a,b)=>a.date.localeCompare(b.date)||a.id.localeCompare(b.id));
}
export function visibleReminders(reminders:Reminder[],states:ReminderState[],asOf:string){return reminders.filter(r=>{const state=states.find(s=>s.reminder_id===r.id);return !state?.dismissed&&(!state?.snoozed_until||state.snoozed_until<=asOf);});}
export function calendarReminder(reminder:Reminder){
 const escape=(s:string)=>s.replace(/\\/g,'\\\\').replace(/\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
 return ['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Hisabivo//Reminders//EN','BEGIN:VEVENT',`UID:${reminder.id.replace(/:/g,'-')}@hisabivo`,`DTSTAMP:${new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'')}`,`DTSTART;VALUE=DATE:${reminder.date.replace(/-/g,'')}`,`DTEND;VALUE=DATE:${addDays(reminder.date,1).replace(/-/g,'')}`,`SUMMARY:${escape(reminder.title)}`,`DESCRIPTION:${escape(reminder.description+' — '+reminder.direction+' PKR '+(reminder.amount_paisa/100).toFixed(2))}`,'BEGIN:VALARM','TRIGGER:-PT9H','ACTION:DISPLAY',`DESCRIPTION:${escape(reminder.title)}`,'END:VALARM','END:VEVENT','END:VCALENDAR',''].join('\r\n');
}
