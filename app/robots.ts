import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/seo";

export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const origin = getSiteOrigin();
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/login", "/signup", "/onboarding", "/dashboard", "/reset-password", "/auth", "/account", "/api/"],
    },
    ...(origin ? { sitemap: `${origin}/sitemap.xml` } : {}),
  };
}
