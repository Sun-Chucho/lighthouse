import type { MetadataRoute } from "next";

const publicSiteUrl = "https://www.lighthousemoshi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: publicSiteUrl,
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: `${publicSiteUrl}/menu`,
      lastModified,
      changeFrequency: "daily",
      priority: 0.9,
    },
  ];
}
