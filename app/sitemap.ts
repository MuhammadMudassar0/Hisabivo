import type { MetadataRoute } from "next";
import { getSiteOrigin } from "@/lib/seo";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const origin = getSiteOrigin();
  return origin ? [{ url: `${origin}/`, changeFrequency: "monthly", priority: 1 }] : [];
}
