import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://contentradar.app",
      lastModified: new Date(),
    },
  ];
}
