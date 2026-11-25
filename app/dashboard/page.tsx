import LedgerApp from "@/components/ledger-app";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Your dashboard | Hisabivo", robots: { index: false, follow: false } };
export default function Dashboard() { return <LedgerApp mode="dashboard" />; }
