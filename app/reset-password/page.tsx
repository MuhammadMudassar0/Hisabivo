import PasswordReset from "@/components/password-reset";
import type { Metadata } from "next";
export const metadata: Metadata = { title: "Reset password | Hisabivo", robots: { index: false, follow: false } };
export default function ResetPassword() { return <PasswordReset />; }
