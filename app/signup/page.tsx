import LedgerApp from "@/components/ledger-app";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Create an account | Hisabivo", robots: { index: false, follow: false } };
export default function Signup() { return <LedgerApp mode="signup" />; }
