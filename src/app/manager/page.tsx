import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Lighthouse Lodge | Manager Login",
  description: "Hotel manager login page for Lighthouse Lodge.",
};

export default function ManagerEntryPage() {
  return <RoleLoginPage role="manager" />;
}
