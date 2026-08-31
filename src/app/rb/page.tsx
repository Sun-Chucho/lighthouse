import type { Metadata } from "next";
import { RoleLoginPage } from "@/components/auth/role-login-page";

export const metadata: Metadata = {
  title: "Lighthouse Lodge Reception Booking",
  description: "Reception booking login page for Lighthouse Lodge.",
};

export default function ReceptionBookingEntryPage() {
  return <RoleLoginPage role="cashier" />;
}
