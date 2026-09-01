import type { Metadata } from "next";
import { PublicMenu } from "@/components/public-menu";

export const metadata: Metadata = {
  title: "Food & Drinks Menu | Lighthouse Lodge",
  description: "Browse the Lighthouse Lodge kitchen and bar menu and send an order request.",
  alternates: { canonical: "/menu" },
};

export default function MenuPage() {
  return <PublicMenu />;
}
