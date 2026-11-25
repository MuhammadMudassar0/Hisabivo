import LandingPage from "@/components/landing-page";
import type { Metadata } from "next";
import { getSiteOrigin, homepageDescription, homepageTitle } from "@/lib/seo";

const origin = getSiteOrigin();
const homepage = origin ? `${origin}/` : undefined;
const socialImage = origin ? `${origin}/og-image.png` : undefined;

export const metadata: Metadata = {
  title: homepageTitle,
  description: homepageDescription,
  applicationName: "Hisabivo",
  ...(homepage ? { alternates: { canonical: homepage } } : {}),
  openGraph: {
    type: "website",
    siteName: "Hisabivo",
    locale: "en_PK",
    title: homepageTitle,
    description: homepageDescription,
    ...(homepage ? { url: homepage } : {}),
    ...(socialImage ? { images: [{ url: socialImage, width: 1200, height: 630, alt: "Hisabivo — Every rupee. A little clearer." }] } : {}),
  },
  twitter: {
    card: "summary_large_image",
    title: homepageTitle,
    description: homepageDescription,
    ...(socialImage ? { images: [{ url: socialImage, alt: "Hisabivo — Every rupee. A little clearer." }] } : {}),
  },
  robots: { index: true, follow: true },
};

export default function Home() {
  return <LandingPage />;
}
