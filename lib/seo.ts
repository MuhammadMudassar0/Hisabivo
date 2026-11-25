type SiteEnvironment = {
  NEXT_PUBLIC_SITE_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

/** Use the real configured origin. Omit URL metadata until a deployment is known. */
export function getSiteOrigin(environment: SiteEnvironment = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  VERCEL_PROJECT_PRODUCTION_URL: process.env.VERCEL_PROJECT_PRODUCTION_URL,
  VERCEL_URL: process.env.VERCEL_URL,
}): string | null {
  const configured = environment.NEXT_PUBLIC_SITE_URL?.trim();
  const vercelHost = environment.VERCEL_PROJECT_PRODUCTION_URL?.trim() || environment.VERCEL_URL?.trim();
  const candidate = configured || (vercelHost ? `https://${vercelHost}` : null);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || !url.hostname || url.username || url.password) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export const homepageTitle = "Hisabivo — Income & Expense Tracker in PKR";
export const homepageDescription = "Track daily expenses and income in Pakistani rupees. Organize personal and business spending, keep private records, and download monthly PDF reports with Hisabivo.";
