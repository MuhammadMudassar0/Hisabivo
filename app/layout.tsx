import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hisabivo — Your money, made clear",
  icons: { icon: "/brand-icon.svg" },
  description: "Track income and everyday expenses in PKR. Keep private records and download monthly PDF statements.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
