"use client";
import {CalendarDays,ArrowUpRight} from 'lucide-react';
import {useMemo} from 'react';
import {money,type Transaction} from '@/lib/ledger';
import {filterTransactions} from '@/lib/transaction-filters';
import {displayDate} from '@/lib/urdu-labels';
import {usePakistanDate} from './use-pakistan-date';
import {useLocale} from './locale-provider';
import {Button} from './ui/button';
import '@/app/spending-filters.css';
export default function TodaySpending({entries,loading,onView}:{entries:Transaction[];loading:boolean;onView:()=>void}){
 const day=usePakistanDate(),{t,locale}=useLocale();
 const totals=useMemo(()=>filterTransactions(entries,{range:{start:day,end:day},asOf:day,type:'expense'}),[entries,day]);
 const count=totals.cashRows.length;
 return <section className="today-spending" aria-label={t("Today's spending","آج کے اخراجات")}><span className="today-spending-icon"><CalendarDays size={22}/></span><div className="today-spending-copy"><span>{t('Spent today','آج ادا شدہ خرچ')}</span><strong aria-live="polite">{loading?'—':money(totals.expense)}</strong><p>{displayDate(day,locale)} · {t('Pakistan time','پاکستانی وقت')}{!loading&&` · ${count} ${t(count===1?'expense payment':'expense payments',count===1?'ادائیگی':'ادائیگیاں')}`}</p></div><Button variant="outline" onClick={onView}>{t("View today's expenses","آج کے اخراجات دیکھیں")}<ArrowUpRight size={16}/></Button></section>;
}
