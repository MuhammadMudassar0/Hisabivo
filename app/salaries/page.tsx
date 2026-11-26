import LedgerApp from '@/components/ledger-app';
import type {Metadata} from 'next';
export const metadata:Metadata={title:'Employee salaries | Hisabivo',robots:{index:false,follow:false}};
export default function SalariesPage(){return <LedgerApp mode="salaries"/>;}
