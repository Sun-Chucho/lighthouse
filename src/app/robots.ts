import type { MetadataRoute } from "next";

const publicSiteUrl = "https://www.lighthousemoshi.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/api/",
        "/dashboard/",
        "/login",
        "/manager",
        "/staff",
        "/bp",
        "/im",
        "/kp",
        "/rb",
      ],
    },
    sitemap: `${publicSiteUrl}/sitemap.xml`,
    host: publicSiteUrl,
  };
}
