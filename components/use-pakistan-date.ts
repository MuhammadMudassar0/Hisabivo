"use client";
import {useEffect,useState} from 'react';
import {pakistanToday} from '@/lib/transaction-filters';
export function usePakistanDate(){
 const[day,setDay]=useState(pakistanToday);
 useEffect(()=>{const update=()=>setDay(pakistanToday());const timer=window.setInterval(update,60000);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);update();return()=>{window.clearInterval(timer);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
 return day;
}
