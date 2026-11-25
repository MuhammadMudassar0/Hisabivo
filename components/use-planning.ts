"use client";
import { useEffect,useRef,useState } from 'react';
import { createDemoId,normalizeEntry,today,validDate,type Transaction } from '@/lib/ledger';
import { addDays,scheduleDates,validateSchedule,type Schedule,type ScheduleInput,type Occurrence,type ReminderState } from '@/lib/planning';
import * as store from '@/lib/planning-store';
import {requestUuid} from '@/lib/ids';
type Data={schedules:Schedule[];occurrences:Occurrence[];states:ReminderState[]};
const empty=():Data=>({schedules:[],occurrences:[],states:[]});
const key='hisabivo.demo.planning.v1';
export function usePlanning(userId:string,demo:boolean,onDemoEntries:(change:(entries:Transaction[])=>Transaction[])=>void,onReload:()=>Promise<void>){
 const [data,setData]=useState<Data>(empty);const latest=useRef(data);const callbacks=useRef({onDemoEntries,onReload});callbacks.current={onDemoEntries,onReload};
 const [ready,setReady]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);const lock=useRef(false);const newRequest=useRef({key:"",id:""});
 function install(next:Data){latest.current=next;setData(next);}
 function prepareDemo(input:Data){
  const next={...input,occurrences:[...input.occurrences]};const entries:Transaction[]=[];
  for(const rule of next.schedules){for(const date of scheduleDates(rule,rule.frequency==='once'?rule.start_date:addDays(today(),30))){
   if(next.occurrences.some(o=>o.schedule_id===rule.id&&o.scheduled_date===date))continue;
   const id=`occ-${rule.id}-${date}`,txId=rule.type==='expense'?`scheduled-${rule.id}-${date}`:null;
   next.occurrences.push({...rule,id,schedule_id:rule.id,scheduled_date:date,status:rule.type==='expense'?'created':'expected',transaction_id:txId,created_at:new Date().toISOString()});
   if(txId)entries.push(normalizeEntry({...rule,id:txId,date,payments:[],expense_status:'expected',paid_date:null,created_at:new Date().toISOString()}));
  }}
  if(entries.length)callbacks.current.onDemoEntries(rows=>[...rows,...entries.filter(e=>!rows.some(r=>r.id===e.id))]);return next;
 }
 async function reload(){if(demo){const next=prepareDemo(latest.current);install(next);}else{const next=await store.fetchPlanning(userId,addDays(today(),30));await callbacks.current.onReload();install(next);}setReady(true);setError('');}
 useEffect(()=>{let active=true;setReady(false);setError('');
  (async()=>{await Promise.resolve();if(!active)return;try{if(demo){const raw=localStorage.getItem(key);const saved=raw?JSON.parse(raw):empty();if(!Array.isArray(saved.schedules)||!Array.isArray(saved.occurrences)||!Array.isArray(saved.states))throw new Error('Saved demo planning data is invalid. Clear demo records in Settings.');saved.schedules.forEach(validateSchedule);if(active)install(prepareDemo(saved));}else{const next=await store.fetchPlanning(userId,addDays(today(),30));if(active){await callbacks.current.onReload();if(active)install(next);}}if(active)setReady(true);}catch(e){if(active)setError(e&&typeof e==='object'&&'message'in e?String(e.message):'Could not load planning. Try again.');}})();return()=>{active=false;};
 // User-scoped lifecycle; stable callback refs prevent data reload loops.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[userId,demo,attempt]);
 useEffect(()=>{if(demo&&ready){try{localStorage.setItem(key,JSON.stringify(data));}catch{setError('Browser storage is full. Planning changes will last only for this visit.');}}},[data,demo,ready]);
 async function mutate(action:()=>Promise<void>){if(!ready)throw new Error(store.planningSetupMessage);if(lock.current)throw new Error('Wait for the current change to finish.');lock.current=true;setBusy(true);try{await action();}finally{lock.current=false;setBusy(false);}}
 async function save(input:ScheduleInput,id?:string){if(lock.current)throw new Error("Wait for the current change to finish.");validateSchedule(input);if(!id&&newRequest.current.key!==JSON.stringify(input))newRequest.current={key:JSON.stringify(input),id:requestUuid()};await mutate(async()=>{if(demo){const old=latest.current.schedules.find(s=>s.id===id);if(old&&latest.current.occurrences.some(o=>o.schedule_id===id)&&(old.start_date!==input.start_date||old.frequency!==input.frequency||old.type!==input.type))throw new Error('Create a new schedule to change the start date, frequency, or type.');const saved={...input,id:id||createDemoId(),created_at:old?.created_at||new Date().toISOString()};install(prepareDemo({...latest.current,schedules:id?latest.current.schedules.map(s=>s.id===id?saved:s):[...latest.current.schedules,saved]}));}else{await store.saveSchedule(userId,input,id,newRequest.current.id||undefined);await reload();}if(!id)newRequest.current={key:"",id:""};});}
 async function remove(id:string){await mutate(async()=>{if(demo)install({...latest.current,schedules:latest.current.schedules.filter(s=>s.id!==id),occurrences:latest.current.occurrences.filter(o=>o.schedule_id!==id)});else{await store.removeSchedule(userId,id);await reload();}});}
 async function receive(id:string,date:string){if(!validDate(date)||date>today())throw new Error('Choose today or the actual past receipt date.');await mutate(async()=>{if(demo){const item=latest.current.occurrences.find(o=>o.id===id);if(!item||item.type!=='income'||item.status!=='expected')throw new Error('This income has changed. Refresh to see its latest status.');const txId=createDemoId();callbacks.current.onDemoEntries(rows=>[...rows,normalizeEntry({...item,id:txId,date,expense_status:'paid',paid_date:null,created_at:new Date().toISOString()})]);install({...latest.current,occurrences:latest.current.occurrences.map(o=>o.id===id?{...o,status:'created',transaction_id:txId}:o)});}else{await store.confirmIncome(id,date);await reload();}});}
 async function skip(id:string){await mutate(async()=>{if(demo){const item=latest.current.occurrences.find(o=>o.id===id);if(!item||item.type!=='income'||item.status!=='expected')throw new Error('Only expected income can be skipped here.');install({...latest.current,occurrences:latest.current.occurrences.map(o=>o.id===id?{...o,status:'skipped'}:o)});}else{await store.skipOccurrence(id);await reload();}});}
 async function reminder(state:ReminderState){await mutate(async()=>{if(!demo)await store.saveReminderState(userId,state);install({...latest.current,states:[...latest.current.states.filter(s=>s.reminder_id!==state.reminder_id),state]});});}
 function clearDemo(){if(!demo)return;install(empty());localStorage.removeItem(key);setReady(true);setError('');}
 return {...data,ready,error,busy,loading:!ready&&!error,save,remove,receive,skip,reminder,clearDemo,retry:()=>setAttempt(n=>n+1),reload};
}
