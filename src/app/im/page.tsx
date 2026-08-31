import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Lighthouse Lodge Inventory Manager",
  description: "Inventory manager login page for Lighthouse Lodge.",
};

export default function InventoryManagerEntryPage() {
  return <RoleLoginPage role="inventory" />;
}
