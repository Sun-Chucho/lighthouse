import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Lighthouse Lodge Bar & POS",
  description: "Bar POS login page for Lighthouse Lodge.",
  manifest: "/api/pwa-manifest/barista",
};

export default function BaristaPosEntryPage() {
  return <RoleLoginPage role="barista" />;
}
