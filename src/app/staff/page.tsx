import type { Metadata } from "next";
import HotelTabs from "@/app/components/HotelTabs";

export const metadata: Metadata = {
  title: "Staff Login | Lighthouse Lodge",
  description: "Choose a secure Lighthouse Lodge staff workspace.",
};

export default function StaffPortalPage() {
  return <HotelTabs />;
}
