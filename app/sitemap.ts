import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
  return SITE_URL ? [{ url: SITE_URL, changeFrequency: "weekly", priority: 1 }, { url: `${SITE_URL}/media`, changeFrequency: "monthly", priority: 0.5 }] : [];
}
