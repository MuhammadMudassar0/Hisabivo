import {supabase} from './supabase';
import {validateEmployee,validPayrollMonth,type Employee,type EmployeeInput} from './salaries';
const setup='Run setup-salaries.sql in the Supabase SQL Editor to enable employee salary management.';
function check(error:{code?:string;message:string}|null){if(error)throw new Error(['PGRST202','PGRST205','42P01','42703'].includes(error.code||'')?setup:error.message);}
export async function fetchEmployees(userId:string):Promise<Employee[]>{const rows:Employee[]=[];for(let i=0;;i+=1000){const{data,error}=await supabase().from('ledger_employees').select('*').eq('user_id',userId).order('id').range(i,i+999);check(error);rows.push(...data as Employee[]);if(data!.length<1000)return rows;}}
export async function saveEmployee(input:EmployeeInput,id:string){validateEmployee(input);const{error}=await supabase().rpc('ledger_save_employee',{p_id:id,p_name:input.name.trim(),p_role:input.role.trim(),p_base:input.base_paisa,p_allowance:input.allowance_paisa,p_deduction:input.deduction_paisa,p_joining:input.joining_date,p_first_pay:input.first_pay_date,p_method:input.payment_method,p_notes:input.notes.trim()});check(error);}
export async function archiveEmployee(id:string,archived:boolean){const{error}=await supabase().rpc('ledger_archive_employee',{p_id:id,p_archived:archived});check(error);}
export async function preparePayroll(month:string){if(!validPayrollMonth(month))throw new Error('Choose a valid salary month.');const{error}=await supabase().rpc('ledger_prepare_salaries',{p_month:`${month}-01`});check(error);}
