import LedgerApp from "@/components/ledger-app";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Sign in | Hisabivo", robots: { index: false, follow: false } };
export default function Login() { return <LedgerApp mode="login" />; }
