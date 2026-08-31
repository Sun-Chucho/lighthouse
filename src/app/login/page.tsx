import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Director Login | Lighthouse Lodge",
  description: "Private Lighthouse Lodge director access.",
};

export default function DirectorLoginPage() {
  return <RoleLoginPage role="director" />;
}
