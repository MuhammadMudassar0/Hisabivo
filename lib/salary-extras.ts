import {supabase} from './supabase';
import {type Transaction,type PaymentMethod,expensePaid,expenseRemaining,money,dateLabel,paymentMethods,today,validDate} from './ledger';
import {parsePkrAmount} from './amount';
import type {Employee} from './salaries';
import {containsUrduText,embedFont,fetchPdfFont,PDF_FONT_FAMILY,pdfTextOptions,shapePdfText} from './pdf-font';
export type SalaryAdvance={id:string;user_id?:string;employee_id:string;transaction_id:string;amount_paisa:number;date:string;notes:string;created_at:string};
export type SalaryStatement={id:string;user_id?:string;expense_id:string;employee_id:string;period:string;name_snapshot:string;base_paisa:number|null;allowance_paisa:number|null;deduction_paisa:number|null;net_paisa:number;notes:string;created_at:string};
export type AdvanceInput={employee_id:string;amount_paisa:number;date:string;payment_method:PaymentMethod;account_id?:string|null;notes:string};
export function validateSalaryAdvance(input:AdvanceInput,employee:Employee|undefined){
 if(!employee||employee.archived_at)throw new Error('Choose an active employee.');
 if(!Number.isSafeInteger(input.amount_paisa)||input.amount_paisa<=0||input.amount_paisa>99999999999)throw new Error('Enter a positive amount up to Rs 999,999,999.99.');
 if(!validDate(input.date)||input.date>today()||input.date<employee.joining_date)throw new Error('Use the actual advance date, today or earlier and on or after joining.');
 if(!paymentMethods.includes(input.payment_method)||typeof input.notes!=='string'||input.notes.length>300)throw new Error('Choose a payment method and keep notes to 300 characters.');
}
/** Derive historical figures only from the immutable bill text, never today’s employee pay. */
export function salarySnapshot(entry:Transaction,employeeId:string):SalaryStatement{
 const match=entry.notes.match(/^Base PKR (\d+\.\d{2}) \| Allowances PKR (\d+\.\d{2}) \| Manual deductions PKR (\d+\.\d{2})(?=\n|$)/);
 let base:number|null=null,allowance:number|null=null,deduction:number|null=null;
 if(match){try{const values=match.slice(1).map(value=>parsePkrAmount(value,{allowZero:true}));if(values[0]>0&&values[0]+values[1]-values[2]===entry.amount_paisa){[base,allowance,deduction]=values;}}catch{/* Preserve a null historical breakdown if the original text is invalid. */}}
 return{id:`salary-statement:${entry.id}`,user_id:entry.user_id,expense_id:entry.id,employee_id:employeeId,period:`${entry.date.slice(0,7)}-01`,name_snapshot:entry.description.startsWith('Salary — ')?entry.description.slice('Salary — '.length):entry.description,base_paisa:base,allowance_paisa:allowance,deduction_paisa:deduction,net_paisa:entry.amount_paisa,notes:entry.notes,created_at:entry.created_at};
}
function check(error:{code?:string;message:string}|null){if(error)throw new Error(['PGRST202','PGRST205','42703'].includes(error.code||'')?'Run setup-suite.sql to enable salary advances and statements.':error.message);}
async function all<T>(table:string,owner:string):Promise<T[]>{const rows:T[]=[];for(let i=0;;i+=1000){const{data,error}=await supabase().from(table).select('*').eq('user_id',owner).order('id').range(i,i+999);check(error);rows.push(...data as T[]);if(data!.length<1000)return rows;}}
export async function fetchSalaryExtras(owner:string){const[advances,statements]=await Promise.all([all<SalaryAdvance>('ledger_salary_advances',owner),all<SalaryStatement>('ledger_salary_statements',owner)]);return{advances,statements};}
export function advanceUnused(advance:SalaryAdvance,entries:Transaction[]){return Math.max(0,advance.amount_paisa-entries.reduce((sum,e)=>sum+(e.payments||[]).filter(p=>p.advance_id===advance.id).reduce((s,p)=>s+p.amount_paisa,0),0));}
export async function grantAdvance(input:AdvanceInput,id:string){const{error}=await supabase().rpc('ledger_grant_salary_advance',{p_id:id,p_employee:input.employee_id,p_amount:input.amount_paisa,p_date:input.date,p_account:input.account_id||null,p_method:input.payment_method,p_notes:input.notes});check(error);}
export async function applyAdvance(advance:string,expense:string,amount:number,date:string,id:string){const{error}=await supabase().rpc('ledger_apply_salary_advance',{p_advance:advance,p_expense:expense,p_amount:amount,p_date:date,p_request:id});check(error);}
export async function downloadSalaryStatement(statement:SalaryStatement,entry:Transaction){
 const[{jsPDF},{default:autoTable}]=await Promise.all([import('jspdf'),import('jspdf-autotable')]);const doc=new jsPDF();
 const needsUnicode=containsUrduText([statement.name_snapshot,statement.notes,entry.description,...(entry.payments||[]).map(payment=>payment.notes)].join(' '));
 let font='helvetica';if(needsUnicode){const fonts=await fetchPdfFont();embedFont(doc,fonts.regular,fonts.bold);font=PDF_FONT_FAMILY;}
 const green:[number,number,number]=[24,88,68];doc.setFillColor(...green);doc.rect(0,0,210,40,'F');doc.setTextColor(255,255,255);doc.setFontSize(21);doc.text('Hisabivo | Salary statement',16,23);doc.setTextColor(40,65,46);doc.setFontSize(13);
 const name=doc.splitTextToSize(shapePdfText(doc,statement.name_snapshot),178);const rtl=containsUrduText(statement.name_snapshot);doc.text(name,rtl?194:16,53,{...pdfTextOptions(statement.name_snapshot),align:rtl?'right':'left'});let y=53+name.length*7;doc.setFontSize(10);doc.text(`Salary period: ${statement.period.slice(0,7)} | Currency: PKR`,16,y);doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`,16,y+7);
 const breakdown:string[][]=statement.base_paisa===null?[["Historical breakdown","Not available in the original record"],["Original bill total",money(statement.net_paisa,true)]]:[["Original base salary",money(statement.base_paisa,true)],["Original allowances",money(statement.allowance_paisa||0,true)],["Original manual deductions",money(statement.deduction_paisa||0,true)],["Original net salary",money(statement.net_paisa,true)]];
 if(entry.amount_paisa!==statement.net_paisa)breakdown.push(['Later bill adjustment',money(entry.amount_paisa-statement.net_paisa,true)]);breakdown.push(['Current salary bill',money(entry.amount_paisa,true)],['Paid / advance credits',money(expensePaid(entry),true)],['Remaining',money(expenseRemaining(entry),true)]);
 const tableStyles={font,fontSize:10,cellPadding:4};
 autoTable(doc,{startY:y+17,head:[['Salary detail','Amount']],body:breakdown,styles:tableStyles,headStyles:{fillColor:green,font},columnStyles:{1:{halign:'right'}},margin:{left:16,right:16,bottom:22}});
 if(statement.notes){autoTable(doc,{startY:(doc as typeof doc&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+12,head:[['Original bill notes']],body:[[shapePdfText(doc,statement.notes)]],styles:tableStyles,headStyles:{fillColor:green,font},margin:{left:16,right:16,bottom:22},didParseCell:cell=>{if(containsUrduText(cell.cell.text.join(' ')))cell.cell.styles.halign='right';}});}
 doc.addPage();doc.setFontSize(16);doc.text('Payment history',16,22);autoTable(doc,{startY:32,head:[['Date','Amount','Details']],body:(entry.payments||[]).length?[...(entry.payments||[])].sort((a,b)=>a.date.localeCompare(b.date)||a.created_at.localeCompare(b.created_at)).map(p=>[dateLabel(p.date),money(p.amount_paisa,true),shapePdfText(doc,p.advance_id?'Salary advance credit applied (no additional cash outflow)':`${p.payment_method}${p.notes?' | '+p.notes:''}`)]):[[entry.paid_date?dateLabel(entry.paid_date):'-',entry.expense_status==='paid'?money(entry.amount_paisa,true):'-',entry.expense_status==='paid'?'Recorded paid expense':'No payments recorded']],styles:tableStyles,headStyles:{fillColor:green,font},columnStyles:{1:{halign:'right'}},margin:{left:16,right:16,bottom:22},didParseCell:cell=>{if(containsUrduText(cell.cell.text.join(' ')))cell.cell.styles.halign='right';}});
 const pages=doc.getNumberOfPages();for(let page=1;page<=pages;page++){doc.setPage(page);doc.setFontSize(8);doc.setTextColor(108,120,104);doc.text('Manual deductions are entered amounts, not statutory payroll calculations.',16,284);doc.text(`${page} / ${pages}`,194,284,{align:'right'});}doc.save(`hisabivo-salary-${statement.period.slice(0,7)}.pdf`);
}
