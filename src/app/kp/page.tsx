import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Lighthouse Lodge Kitchen POS",
  description: "Kitchen POS login page for Lighthouse Lodge.",
  manifest: "/api/pwa-manifest/kitchen",
};

export default function KitchenPosEntryPage() {
  return <RoleLoginPage role="kitchen" />;
}
