"use client";

import {useMemo} from 'react';
import {ArrowUpRight,Banknote,Landmark,LoaderCircle,RefreshCw,Smartphone,Wallet} from 'lucide-react';
import {accountBalanceSummary,accountCashMovements,type Account,type AccountLoan,type AccountLoanPayment,type AccountTransaction,type AccountTransfer} from '@/lib/accounts';
import {money} from '@/lib/ledger';
import {displayDate} from '@/lib/urdu-labels';
import {usePakistanDate} from './use-pakistan-date';
import {useLocale} from './locale-provider';
import {Button} from './ui/button';
import '@/app/money-balances.css';

type Props={accounts:Account[];entries:AccountTransaction[];loans:AccountLoan[];payments:AccountLoanPayment[];transfers:AccountTransfer[];loading?:boolean;error?:string;onManage?:()=>void;onRetry?:()=>void};
export default function MoneyBalances({accounts,entries,loans,payments,transfers,loading=false,error='',onManage,onRetry}:Props){
 const{t,locale}=useLocale(),day=usePakistanDate();
 const summary=useMemo(()=>accountBalanceSummary(accounts,accountCashMovements(entries,loans,payments,transfers),day),[accounts,entries,loans,payments,transfers,day]);
 const available=!loading&&!error;
 const groups=[{key:'cash',title:t('Cash in hand','نقد رقم'),amount:summary.cash,count:summary.cashAccounts,icon:Banknote,detail:t('Your cash accounts','آپ کے نقد اکاؤنٹس')},
  {key:'bank',title:t('In bank accounts','بینک اکاؤنٹس میں'),amount:summary.bank,count:summary.bankAccounts,icon:Landmark,detail:t('All recorded bank balances','تمام درج شدہ بینک بیلنس')},
  {key:'wallets',title:t('In mobile wallets','موبائل والٹس میں'),amount:summary.wallets,count:summary.walletAccounts,icon:Smartphone,detail:t('Easypaisa + JazzCash','ایزی پیسہ اور جاز کیش')}];
 return <section className="money-balances" aria-label={t('Current money balances','موجودہ رقم کا حساب')} aria-busy={loading&&!error}>
  <header className="mb-heading"><div><span className="mb-eyebrow">{t('WHERE YOUR MONEY STANDS','آپ کی رقم کا حساب')}</span><h2>{t('What you should have now','اس وقت آپ کے پاس کتنی رقم ہونی چاہیے')}</h2><p>{t('This workspace','یہ ورک اسپیس')} · {displayDate(day,locale)} · {t('Pakistan time','پاکستانی وقت')}</p></div>{onManage&&<Button variant="outline" onClick={onManage}>{t('View accounts','اکاؤنٹس دیکھیں')}<ArrowUpRight size={16}/></Button>}</header>
  {error?<div className="mb-error" role="alert"><strong>{t('Your balance is not ready yet.','آپ کا بیلنس ابھی دستیاب نہیں۔')}</strong><p>{error}</p>{onRetry&&<Button variant="outline" size="sm" onClick={onRetry}><RefreshCw size={15}/>{t('Try again','دوبارہ کوشش کریں')}</Button>}</div>:<>
   <div className="mb-total"><span className="mb-total-icon"><Wallet size={24}/></span><div><span>{t('Total you should have','آپ کے پاس کل رقم')}</span><strong aria-live="polite" data-negative={available&&summary.total<0?true:undefined}>{available?<bdi>{money(summary.total,true)}</bdi>:<span className="mb-loading"><LoaderCircle className="animate-spin" size={20}/>{t('Loading balances…','بیلنس لوڈ ہو رہے ہیں…')}</span>}</strong><p>{t('Cash + banks + wallets + unassigned balance','نقد، بینک، والٹس اور غیر مختص بیلنس کا مجموعہ')}</p></div></div>
   <div className="mb-groups">{groups.map(group=><div className="mb-group" key={group.key}><span className="mb-group-label"><group.icon size={18}/>{group.title}</span><strong className={available&&!group.count?'mb-not-set':''} data-negative={available&&group.amount<0?true:undefined}>{!available?'—':group.count?<bdi>{money(group.amount,true)}</bdi>:t('Not set up','ابھی شامل نہیں')}</strong><p>{group.count?`${group.count} ${t(group.count===1?'account':'accounts',group.count===1?'اکاؤنٹ':'اکاؤنٹس')} · ${group.detail}`:t('Add an account to track this balance.','یہ بیلنس دیکھنے کے لیے اکاؤنٹ شامل کریں۔')}</p></div>)}</div>
   {available&&summary.unassignedCount>0&&<div className="mb-unassigned"><div><strong>{t('Unassigned balance','غیر مختص بیلنس')}<bdi>{money(summary.unassigned,true)}</bdi></strong><p>{t('Included in your total. These records have no money account, so we cannot tell whether this is cash, bank money, or a wallet balance. Choose the account on the original entry or payment.','یہ رقم کل میں شامل ہے۔ ان ریکارڈز کا اکاؤنٹ منتخب نہیں، اس لیے نقد، بینک یا والٹ کا تعین نہیں ہو سکتا۔ اصل اندراج یا ادائیگی میں اکاؤنٹ منتخب کریں۔')}</p></div></div>}
   {available&&!accounts.length&&<p className="mb-setup-note">{t('Start in Accounts & transfers: add Cash in hand, your bank, or a wallet. Enter the balance at the beginning of your chosen starting date; use a date before the transactions you want to track.','اکاؤنٹس اور منتقلی میں نقد، بینک یا والٹ شامل کریں۔ شروع کی تاریخ کے آغاز کا بیلنس درج کریں اور ایسی تاریخ چنیں جو متعلقہ لین دین سے پہلے ہو۔')}</p>}
  </>}
  <footer className="mb-explanation"><p>{t('Based on starting balances and money actually received or paid, including Udhar. Internal transfers keep the total unchanged. Expected income and unpaid bills do not change money you have now.','یہ حساب ابتدائی بیلنس اور ادھار سمیت وصول یا ادا شدہ رقم پر مبنی ہے۔ اکاؤنٹس کے درمیان منتقلی سے کل رقم نہیں بدلتی۔ متوقع آمدن اور بقایا بل موجودہ رقم میں شامل نہیں۔')}</p>{available&&summary.archivedAccounts>0&&<span>{t('Archived account balances are included.','محفوظ شدہ اکاؤنٹس کے بیلنس بھی شامل ہیں۔')}</span>}<span>{t('Your recorded balance; bank balances are not synced automatically.','یہ درج شدہ بیلنس ہے؛ بینک بیلنس خودکار طور پر حاصل نہیں ہوتا۔')}</span></footer>
 </section>;
}
