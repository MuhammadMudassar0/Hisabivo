import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMonthlyPdf } from "../lib/pdf";
import { PDF_FONT_FAMILY } from "../lib/pdf-font";
import type { Account, AccountTransfer } from "../lib/accounts";
import type { Transaction } from "../lib/ledger";

const account=(id:string,name:string,amount:number,date:string):Account=>({id,name,kind:"cash",opening_balance_paisa:amount,opening_date:date,archived:false,created_at:`${date}T12:00:00Z`});
const entry=(id:string,type:"income"|"expense",amount:number,date:string,account_id:string|null):Transaction=>({id,type,amount_paisa:amount,date,account_id,category:type==="income"?"Salary":"Groceries",description:id,payment_method:"Cash",notes:"",created_at:`${date}T12:00:00Z`});
const pages=(doc:ReturnType<typeof createMonthlyPdf>)=>(doc.internal as unknown as {pages:string[][]}).pages.slice(1).map(page=>page.join("\n"));
const accounts=[account("cash","Everyday cash",100000,"2026-10-01"),account("bank","Bank account",500000,"2026-11-10")];
const transfers:AccountTransfer[]=[{id:"transfer",request_id:"transfer",from_account_id:"cash",to_account_id:"bank",amount_paisa:20000,date:"2026-11-14",notes:"ATM MOVEMENT ONLY",created_at:"2026-11-14T12:00:00Z"}];

test("account PDF reconciles snapshots once, Udhar, transfer neutrality and per-account balances",()=>{
 const rows=[entry("Salary paid","income",200000,"2026-11-11","bank"),entry("Paid groceries","expense",30000,"2026-11-12","cash")];
 const udhar={loans:[{id:"taken",direction:"taken" as const,person:"Ali",amount_paisa:50000,date:"2026-11-13",due_date:null,account_id:"cash",payment_method:"Cash" as const,notes:"",created_at:"2026-11-13T12:00:00Z"}],payments:[]};
 const report=pages(createMonthlyPdf(rows,"2026-11","owner@example.com",false,udhar,[],{accounts,transfers}));
 assert.match(report[0],/Rs 8,200.00/);assert.match(report[0],/Rs 5,000.00/);
 const movements=report.find(page=>page.includes("Cash movement details"))!;
 assert.match(movements,/Starting balance: Bank/);assert.match(movements,/\(account\)/);assert.match(movements,/Rs 8,200.00/);assert.doesNotMatch(movements,/ATM MOVEMENT ONLY/);
 const accountPage=report.find(page=>page.includes("Money accounts at month end"))!;assert.match(accountPage,/Rs 7,200.00/);assert.match(accountPage,/Unassigned/);
 const transferPage=report.find(page=>page.includes("Account transfers"))!;assert.match(transferPage,/ATM MOVEMENT ONLY/);assert.match(transferPage,/Rs 200.00/);
 const december=pages(createMonthlyPdf(rows,"2026-12","owner@example.com",false,udhar,[],{accounts,transfers}));assert.match(december[0],/Rs 8,200.00/);assert.doesNotMatch(december.find(page=>page.includes("Cash movement details"))!,/Starting balance: Bank account/);
});
test("cash PDF excludes advance application credits and soft-deleted entries",()=>{
 const bill={...entry("Salary balance","expense",30000,"2026-11-30",null),payment_tracking:true,payments:[{id:"cash-payment",expense_id:"bill",amount_paisa:10000,date:"2026-11-25",payment_method:"Cash" as const,notes:"Cash installment",account_id:null,created_at:"2026-11-25T12:00:00Z"},{id:"credit",expense_id:"bill",advance_id:"advance",amount_paisa:10000,date:"2026-11-25",payment_method:"Cash" as const,notes:"CREDIT APPLICATION MUST NOT BE CASH",account_id:null,created_at:"2026-11-25T12:00:00Z"}]};
 const rows=[entry("Income","income",100000,"2026-11-01",null),entry("Advance issued","expense",10000,"2026-11-20",null),bill,{...entry("REMOVED ENTRY","expense",999999,"2026-11-25",null),deleted_at:"2026-11-26T12:00:00Z"}];
 const report=pages(createMonthlyPdf(rows,"2026-11","owner",false,undefined,[],{accounts:[],transfers:[]}));
 assert.match(report[0],/Rs 800.00/);const cash=report.find(page=>page.includes("Transaction details"))!;assert.doesNotMatch(cash,/CREDIT APPLICATION/);assert.equal((cash.match(/Advance issued/g)||[]).length,1);assert.doesNotMatch(report.join("\n"),/REMOVED ENTRY/);assert.match(report.find(page=>page.includes("Expected expenses - unpaid at month end"))!,/Rs 100.00/);
});
test("Urdu PDF requires embedded fonts and uses them for all text and table cells",()=>{
 const rows=[{...entry("علی کی تنخواہ","income",250000,"2026-11-01",null),category:"آمدنی",notes:"ماہانہ آمدنی کا ریکارڈ"}];
 assert.throws(()=>createMonthlyPdf(rows,"2026-11","احمد",false),/embedded PDF font/);
 const fonts={regular:readFileSync(new URL("../public/fonts/NotoNaskhArabic-Regular.ttf",import.meta.url)).toString("base64"),bold:readFileSync(new URL("../public/fonts/NotoNaskhArabic-Bold.ttf",import.meta.url)).toString("base64")};
 const doc=createMonthlyPdf(rows,"2026-11","احمد",false,undefined,[],{accounts:[account("cash","نقد رقم",10000,"2026-11-01")],transfers:[]},fonts);
 assert.deepEqual(doc.getFontList()[PDF_FONT_FAMILY],["normal","bold"]);
 const body=pages(doc).join("\n");
 doc.setFont(PDF_FONT_FAMILY,"normal");const normalId=String(doc.getFont().id);
 doc.setFont(PDF_FONT_FAMILY,"bold");const boldId=String(doc.getFont().id);
 const ids=new Set([normalId,boldId]);
 const used=[...body.matchAll(/\/(F\d+) [\d.]+ Tf/g)].map(match=>match[1]);assert.ok(used.length>10);assert.ok(used.every(id=>ids.has(id)),"Every report/table text run uses an embedded Unicode font");
 const pdf=doc.output();assert.match(pdf,/\/ToUnicode/);assert.match(pdf,/\/FontFile2/);assert.ok(pdf.length>50000);
});
