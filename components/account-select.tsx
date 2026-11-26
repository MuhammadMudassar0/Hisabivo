"use client";
import { ChevronDown } from "lucide-react";
import type { Account } from "@/lib/accounts";

export default function AccountSelect({accounts,value,onChange,initialAccountId=null,label="Money account",disabled=false}:{accounts:Account[];value?:string;onChange?:(value:string)=>void;initialAccountId?:string|null;label?:string;disabled?:boolean}){
 const currentId=value===undefined?initialAccountId||"":value;
 const choices=accounts.filter(account=>!account.archived||account.id===currentId).sort((a,b)=>a.name.localeCompare(b.name));
 return <label>{label}<div className="select-wrap"><select name="account_id" aria-label={label} value={value} defaultValue={value===undefined?currentId:undefined} onChange={event=>onChange?.(event.target.value)} disabled={disabled}><option value="">Unassigned</option>{currentId&&!choices.some(account=>account.id===currentId)&&<option value={currentId}>Current account · unavailable</option>}{choices.map(account=><option value={account.id} key={account.id}>{account.name}{account.archived?" · archived":""}</option>)}</select><ChevronDown size={16}/></div><span className="field-optional">Choose explicitly. A payment method doesn’t select an account.</span></label>;
}
