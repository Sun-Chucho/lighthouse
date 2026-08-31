import { NextRequest, NextResponse } from "next/server";

const ROLE_MANIFESTS = {
  manager: {
    name: "LIGHTHOUSE Manager",
    short_name: "LIGHTHOUSE Manager",
    start_url: "/manager",
    id: "/manager",
    description: "LIGHTHOUSE manager login and dashboard entry point.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
  director: {
    name: "LIGHTHOUSE MD Dashboard",
    short_name: "LIGHTHOUSE MD",
    start_url: "/login?source=pwa",
    scope: "/",
    id: "/lighthouse-director-dashboard",
    description: "LIGHTHOUSE managing director mobile dashboard.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
  inventory: {
    name: "LIGHTHOUSE Inventory",
    short_name: "LIGHTHOUSE Inventory",
    start_url: "/im",
    id: "/im",
    description: "LIGHTHOUSE inventory login and stock control entry point.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
  cashier: {
    name: "LIGHTHOUSE Reception",
    short_name: "LIGHTHOUSE Reception",
    start_url: "/rb",
    id: "/rb",
    description: "LIGHTHOUSE reception booking login and dashboard entry point.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
  kitchen: {
    name: "LIGHTHOUSE Kitchen POS",
    short_name: "LIGHTHOUSE Kitchen",
    start_url: "/kp",
    id: "/kp",
    description: "LIGHTHOUSE kitchen POS login and dashboard entry point.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
  barista: {
    name: "LIGHTHOUSE Bar & POS",
    short_name: "LIGHTHOUSE Bar",
    start_url: "/bp",
    id: "/bp",
    description: "LIGHTHOUSE bar POS login and dashboard entry point.",
    theme_color: "#1d110a",
    background_color: "#140c07",
  },
} as const;

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ role: string }> },
) {
  const { role } = await context.params;
  const manifest = ROLE_MANIFESTS[role as keyof typeof ROLE_MANIFESTS];

  if (!manifest) {
    return NextResponse.json({ error: "Manifest not found." }, { status: 404 });
  }



  return new NextResponse(
    JSON.stringify({
      ...manifest,
      name: manifest.name,
      short_name: manifest.short_name,
      display: "standalone",
      display_override: ["standalone", "minimal-ui"],
      start_url: manifest.start_url,
      scope: "/",
      id: manifest.id,
      background_color: manifest.background_color,
      theme_color: manifest.theme_color,
      categories: ["business", "productivity"],
      prefer_related_applications: false,
      orientation: "portrait-primary",
      icons: [
        {
          src: "/logo.jpeg",
          sizes: "192x192",
          type: "image/jpeg",
          purpose: "any maskable",
        },
        {
          src: "/logo.jpeg",
          sizes: "512x512",
          type: "image/jpeg",
          purpose: "any maskable",
        },
      ],
    }),
    {
      headers: {
        "Content-Type": "application/manifest+json",
        "Cache-Control": "public, max-age=3600",
      },
    },
  );
}
