import LedgerApp from "@/components/ledger-app";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Welcome to Hisabivo", robots: { index: false, follow: false } };
export default function Welcome() { return <LedgerApp mode="onboarding" />; }
