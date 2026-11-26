import test from "node:test";
import assert from "node:assert/strict";
import { accountBalances, accountCashMovements, accountPeriodSummary, sameTransfer, totalRecordedCash, UNASSIGNED_ACCOUNT, validateAccount, validateTransfer, type Account, type AccountLoan, type AccountLoanPayment, type AccountTransaction, type AccountTransfer } from "../lib/accounts";
import { buildCashForecast } from "../lib/forecast";
import type { Occurrence, Schedule } from "../lib/planning";

const cash: Account = { id: "cash",user_id:"owner",name:"Everyday cash",kind:"cash",opening_balance_paisa:100000,opening_date:"2026-10-01",archived:false,created_at:"2026-10-01T12:00:00Z" };
const bank: Account = {...cash,id:"bank",name:"Bank",kind:"bank",opening_balance_paisa:500000,opening_date:"2026-11-01"};
const entry=(id:string,type:"income"|"expense",amount:number,date="2026-11-27",account_id:string|null=null):AccountTransaction=>({id,type,amount_paisa:amount,date,account_id,category:type==="income"?"Salary":"Groceries",description:id,payment_method:"Cash",notes:"",created_at:`${date}T12:00:00Z`});
const loan=(id:string,direction:"given"|"taken",amount:number,date="2026-11-01",account_id:string|null=null,due_date:string|null="2026-11-30"):AccountLoan=>({id,direction,amount_paisa:amount,date,account_id,due_date,person:id,payment_method:"Cash",notes:"",created_at:`${date}T12:00:00Z`});
const transfer:AccountTransfer={id:"t",request_id:"t",from_account_id:"cash",to_account_id:"bank",amount_paisa:15000,date:"2026-11-27",notes:"ATM",created_at:"2026-11-27T12:00:00Z"};
const installment=(id:string,amount:number,account_id:string|null,date="2026-11-27")=>({id,expense_id:"bill",amount_paisa:amount,account_id,date,payment_method:"Cash" as const,notes:"",created_at:`${date}T12:00:00Z`});

test("per-account cash includes actual installments/Udhar and conserves transfers",()=>{
 const bill={...entry("bill","expense",100000,"2026-11-27","cash"),payment_tracking:true,payments:[installment("p1",25000,"cash"),installment("p2",35000,"bank"),{...installment("credit",10000,null),advance_id:"advance"}]};
 const loans=[loan("given","given",30000,"2026-11-01","cash"),loan("taken","taken",40000,"2026-11-01","bank")];
 const repayments:AccountLoanPayment[]=[{id:"recover",loan_id:"given",amount_paisa:10000,date:"2026-11-27",account_id:"bank",payment_method:"Cash",notes:"",created_at:"2026-11-27T12:00:00Z"}];
 const movements=accountCashMovements([entry("salary","income",20000,"2026-11-27","cash"),bill,entry("legacy","expense",10000),entry("advance","expense",10000,"2026-11-25","bank")],loans,repayments,[transfer]);
 const balances=accountBalances([cash,bank],movements,"2026-11-27");
 assert.equal(balances.get("cash"),50000);assert.equal(balances.get("bank"),520000);assert.equal(balances.get(UNASSIGNED_ACCOUNT),-10000);assert.equal(totalRecordedCash([cash,bank],movements,"2026-11-27"),560000);
 assert.equal(movements.filter(m=>m.kind==="transfer").reduce((s,m)=>s+m.signed_paisa,0),0);
 assert.equal(movements.some(m=>m.id==="expense-payment:credit"),false);
});
test("missing account stays Unassigned even if payment method or bill suggests a bank",()=>{
 const income={...entry("banklike","income",10000),payment_method:"Bank transfer" as const};
 const bill={...entry("bill","expense",10000,"2026-11-27","bank"),payment_tracking:true,payments:[installment("unassigned",3000,null)]};
 const balances=accountBalances([bank],accountCashMovements([income,bill]),"2026-11-27");
 assert.equal(balances.get("bank"),bank.opening_balance_paisa);assert.equal(balances.get(UNASSIGNED_ACCOUNT),7000);
});
test("starting balances enter once, including accounts opened mid-month",()=>{
 const opened={...bank,opening_date:"2026-11-10"};
 const movements=accountCashMovements([entry("prior","income",5000,"2026-10-15","cash"),entry("new","income",20000,"2026-11-11","bank")],[],[],[transfer]);
 const november=accountPeriodSummary([cash,opened],movements,"2026-11-01","2026-11-30");
 assert.deepEqual(november,{opening:105000,startingAdjustments:500000,movementNet:20000,closing:625000});
 const december=accountPeriodSummary([cash,opened],movements,"2026-12-01","2026-12-31");assert.equal(december.opening,625000);assert.equal(december.startingAdjustments,0);assert.equal(december.closing,625000);
 assert.equal(november.closing,totalRecordedCash([cash,opened],movements,"2026-11-30"));
});
test("snapshots exclude pre-opening named activity and future movements",()=>{
 const movements=accountCashMovements([entry("before","income",9000,"2026-09-30","cash"),entry("future","income",8000,"2026-12-01","cash")]);
 assert.equal(totalRecordedCash([cash],movements,"2026-11-27"),100000);
 assert.equal(totalRecordedCash([cash],movements,"2026-12-01"),108000);
});
test("archiving retains balances and old transfers, and soft-deleted cash is excluded",()=>{
 const movements=accountCashMovements([{...entry("deleted","income",999999,"2026-11-27","cash"),deleted_at:"2026-11-28"}], [{...loan("deleted-loan","taken",999999),deleted_at:"2026-11-28"}],[],[transfer]);
 assert.equal(totalRecordedCash([{...cash,archived:true},bank],movements,"2026-11-27"),600000);
 assert.equal(accountBalances([cash,bank],movements,"2026-11-27").get("cash"),85000);
});
test("transfer validation rejects same/foreign/archived/pre-opening/future/invalid amounts",()=>{
 const asOf="2026-11-27";
 validateTransfer(transfer,[cash,bank],asOf);
 for(const bad of [{...transfer,to_account_id:"cash"},{...transfer,amount_paisa:0},{...transfer,amount_paisa:1.2},{...transfer,date:"2026-11-28"},{...transfer,date:"2026-10-31"}])assert.throws(()=>validateTransfer(bad,[cash,bank],asOf));
 assert.throws(()=>validateTransfer(transfer,[cash,{...bank,user_id:"another"}],asOf));assert.throws(()=>validateTransfer(transfer,[cash,{...bank,archived:true}],asOf));
 assert.equal(sameTransfer(transfer,{...transfer,notes:" ATM "}),true);assert.equal(sameTransfer(transfer,{...transfer,amount_paisa:15001}),false);
 validateAccount({...cash,opening_balance_paisa:-10000},asOf);assert.throws(()=>validateAccount({...cash,opening_date:"2026-11-28"},asOf));
});

const schedule=(id:string,type:"income"|"expense",amount:number,start_date:string,frequency:Schedule["frequency"]="monthly"):Schedule=>({id,type,amount_paisa:amount,start_date,end_date:null,frequency,description:id,category:type==="income"?"Salary":"Payroll",notes:"",payment_method:"Cash",reminder_days:3,active:true,created_at:"2026-11-01T12:00:00Z"});
const occurrence=(id:string,schedule_id:string,type:"income"|"expense",amount:number,date:string,status:Occurrence["status"]="expected",transaction_id:string|null=null):Occurrence=>({id,schedule_id,type,amount_paisa:amount,scheduled_date:date,status,transaction_id,description:id,category:type==="income"?"Salary":"Payroll",payment_method:"Cash",notes:"",created_at:"2026-11-01T12:00:00Z"});
const forecastBase={accounts:[],transfers:[],entries:[] as AccountTransaction[],loans:[] as AccountLoan[],payments:[] as AccountLoanPayment[],asOf:"2026-11-27",days:7 as const};
test("forecast starts at actual dated cash; bills, Payroll and loans are due once",()=>{
 const partial={...entry("bill","expense",30000,"2026-11-28"),payment_tracking:true,payments:[installment("part",10000,null)]};
 const result=buildCashForecast({...forecastBase,entries:[entry("salary","income",100000),partial],loans:[loan("taken","taken",20000),loan("given","given",10000,"2026-11-01",null,"2026-11-29")],schedules:[schedule("bill-rule","expense",30000,"2026-11-28"),schedule("payroll","expense",25000,"2026-12-01"),schedule("incoming","income",50000,"2026-11-29")],occurrences:[occurrence("bill-o","bill-rule","expense",30000,"2026-11-28","created","bill"),occurrence("income-o","incoming","income",50000,"2026-11-29")]});
 assert.equal(result.currentPaisa,100000);assert.equal(result.duePaisa,65000);assert.equal(result.endingPaisa,35000);assert.equal(result.possibleReceiptsPaisa,60000);assert.equal(result.endingWithReceiptsPaisa,95000);
 assert.equal(result.items.filter(item=>item.description==="bill"||item.description==="bill-o").length,1);
});
test("expected income and loan recoveries never hide a conservative shortfall",()=>{
 const result=buildCashForecast({...forecastBase,entries:[entry("cash","income",50000),{...entry("due","expense",60000,"2026-11-28"),expense_status:"expected"}],occurrences:[occurrence("future","incoming","income",500000,"2026-11-28")]});
 assert.equal(result.currentPaisa,50000);assert.equal(result.endingPaisa,-10000);assert.equal(result.shortfallPaisa,10000);assert.equal(result.firstShortfallDate,"2026-11-28");assert.equal(result.endingWithReceiptsPaisa,490000);
});
test("salary advance cash is counted once while its credit reduces the remaining bill",()=>{
 const bill={...entry("salary-bill","expense",30000,"2026-11-30"),payment_tracking:true,payments:[installment("cash-paid",10000,null),{...installment("advance-applied",10000,null),advance_id:"advance-row"}]};
 const result=buildCashForecast({...forecastBase,entries:[entry("cash","income",100000),entry("advance-paid","expense",10000),bill]});
 assert.equal(result.currentPaisa,80000);assert.equal(result.duePaisa,10000);assert.equal(result.endingPaisa,70000);
});
test("overdue payments count today; untimed loans are disclosed, not assigned fake dates",()=>{
 const result=buildCashForecast({...forecastBase,entries:[entry("cash","income",5000),{...entry("late","expense",8000,"2026-11-20"),expense_status:"expected"}],loans:[loan("undated","taken",1000,"2026-11-01",null,null)]});
 assert.equal(result.days[0].due_paisa,8000);assert.equal(result.firstShortfallDate,"2026-11-27");assert.equal(result.undatedLoans,1);assert.equal(result.items.find(item=>item.description==="late")?.original_date,"2026-11-20");
});
test("recurring skipped/created/deleted instances are never regenerated or double counted",()=>{
 const rules=[schedule("skip","expense",10000,"2026-11-29","once"),schedule("deleted","expense",10000,"2026-11-29","once"),schedule("linked","expense",10000,"2026-11-29","once")];
 const result=buildCashForecast({...forecastBase,entries:[{...entry("real","expense",10000,"2026-11-29"),expense_status:"expected"}],schedules:rules,occurrences:[occurrence("s","skip","expense",10000,"2026-11-29","skipped"),occurrence("d","deleted","expense",10000,"2026-11-29","created",null),occurrence("l","linked","expense",10000,"2026-11-29","expected","real")]});
 assert.equal(result.items.length,1);assert.equal(result.duePaisa,10000);
});
test("recurrence preserves month end and handles old weekly anchors without truncation",()=>{
 const anchored=buildCashForecast({...forecastBase,asOf:"2027-01-30",days:90,schedules:[schedule("end","expense",100,"2027-01-31")]});assert.deepEqual(anchored.items.map(item=>item.date),["2027-01-31","2027-02-28","2027-03-31","2027-04-30"]);
 const old=buildCashForecast({...forecastBase,asOf:"2200-01-01",schedules:[schedule("old","expense",100,"1900-01-01","weekly")]});assert.equal(old.items.length,1);assert.ok(old.items[0].date>"2200-01-01");
});
test("forecast respects exact window, paused/end dates and soft deletion",()=>{
 const result=buildCashForecast({...forecastBase,entries:[{...entry("edge","expense",100,"2026-12-04"),expense_status:"expected"},{...entry("outside","expense",200,"2026-12-05"),expense_status:"expected"},{...entry("removed","income",99999),deleted_at:"2026-11-27"}],schedules:[{...schedule("paused","expense",900,"2026-11-28"),active:false},{...schedule("ended","expense",900,"2026-11-28"),end_date:"2026-11-28",frequency:"weekly"}],loans:[{...loan("removed-loan","taken",99999),deleted_at:"2026-11-27"}]});
 assert.equal(result.currentPaisa,0);assert.equal(result.duePaisa,1000);assert.equal(result.items.length,2);assert.equal(result.until,"2026-12-04");
});
test("forecasts preserve total cash across transfers and never mutate the input",()=>{
 const entries=[entry("cash","income",30000)];const before=JSON.stringify(entries);
 const a=buildCashForecast({...forecastBase,accounts:[cash,bank],entries,transfers:[transfer]});const b=buildCashForecast({...forecastBase,accounts:[cash,bank],entries});assert.equal(a.currentPaisa,b.currentPaisa);assert.equal(a.endingPaisa,b.endingPaisa);assert.equal(JSON.stringify(entries),before);
 assert.throws(()=>buildCashForecast({...forecastBase,asOf:"2026-02-30"}));
});
