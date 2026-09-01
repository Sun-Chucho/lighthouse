import type { MetadataRoute } from "next";

const publicSiteUrl = "https://www.lighthousemoshi.com";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: publicSiteUrl,
      lastModified: new Date(),
      changeFrequency: "weekly",
      priority: 1,
    },
  ];
}
