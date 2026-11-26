import { expensePaid, expenseRemaining, monthEnd, paymentMethods, validDate, type PaymentMethod, type Transaction } from './ledger';
import { scheduledDate, type Schedule, type ScheduleInput, type Occurrence } from './planning';
export type Employee = { id:string;user_id?:string;name:string;role:string;base_paisa:number;allowance_paisa:number;deduction_paisa:number;joining_date:string;notes:string;schedule_id:string;archived_at:string|null;created_at:string };
export type EmployeeInput = Pick<Employee,'name'|'role'|'base_paisa'|'allowance_paisa'|'deduction_paisa'|'joining_date'|'notes'> & {first_pay_date:string;payment_method:PaymentMethod};
export function netSalary(input:Pick<Employee,'base_paisa'|'allowance_paisa'|'deduction_paisa'>){return input.base_paisa+input.allowance_paisa-input.deduction_paisa;}
export function validateEmployee(input:EmployeeInput){
 if(!input.name.trim()||input.name.length>80||input.role.length>80||input.notes.length>300)throw new Error('Enter an employee name up to 80 characters, a role up to 80 characters, and notes up to 300 characters.');
 if(![input.base_paisa,input.allowance_paisa,input.deduction_paisa].every(v=>Number.isSafeInteger(v)&&v>=0&&v<=99999999999)||input.base_paisa<=0||netSalary(input)<=0||netSalary(input)>99999999999)throw new Error('Base salary and net pay must be positive. Deductions cannot consume the full salary. Maximum net pay is Rs 999,999,999.99.');
 if(!validDate(input.joining_date)||!validDate(input.first_pay_date)||input.first_pay_date<input.joining_date||input.first_pay_date>'9998-12-31')throw new Error('The first salary date must be on or after joining, and no later than 9998-12-31.');
 if(!paymentMethods.includes(input.payment_method))throw new Error('Choose a payment method.');
}
export function salarySchedule(input:EmployeeInput):ScheduleInput{
 validateEmployee(input);
 return {type:'expense',description:`Salary — ${input.name.trim()}`,category:'Payroll',amount_paisa:netSalary(input),payment_method:input.payment_method,notes:`Base PKR ${(input.base_paisa/100).toFixed(2)} | Allowances PKR ${(input.allowance_paisa/100).toFixed(2)} | Manual deductions PKR ${(input.deduction_paisa/100).toFixed(2)}${input.notes?`\n${input.notes}`:''}`,start_date:input.first_pay_date,end_date:null,frequency:'monthly',reminder_days:3,active:true};
}
export function salaryDateInMonth(schedule:Schedule,month:string){
 const index=(Number(month.slice(0,4))-Number(schedule.start_date.slice(0,4)))*12+Number(month.slice(5,7))-Number(schedule.start_date.slice(5,7));
 if(index<0)return null;const date=scheduledDate(schedule,index);return date&&(!schedule.end_date||date<=schedule.end_date)?date:null;
}
export function payrollRows(employees:Employee[],occurrences:Occurrence[],entries:Transaction[],month:string){
 const bySchedule=new Map(employees.map(e=>[e.schedule_id,e]));const byEntry=new Map(entries.map(e=>[e.id,e]));
 return occurrences.filter(o=>o.type==='expense'&&o.scheduled_date.slice(0,7)===month&&bySchedule.has(o.schedule_id)).map(o=>({employee:bySchedule.get(o.schedule_id)!,occurrence:o,entry:o.transaction_id?byEntry.get(o.transaction_id):undefined})).sort((a,b)=>a.employee.name.localeCompare(b.employee.name));
}
export function payrollSummary(rows:ReturnType<typeof payrollRows>){return rows.reduce((s,r)=>{if(!r.entry)return s;const amount=r.entry.amount_paisa,paid=expensePaid(r.entry),remaining=expenseRemaining(r.entry);s.total+=amount;s.paid+=paid;s.remaining+=remaining;s.count++;if(!remaining)s.settled++;return s;},{total:0,paid:0,remaining:0,count:0,settled:0});}
export function validPayrollMonth(month:string){return /^\d{4}-(0[1-9]|1[0-2])$/.test(month)&&month>='1900-01'&&month<='9998-12'&&validDate(monthEnd(month));}
