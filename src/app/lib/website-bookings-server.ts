import { getLighthouseAdminDatabase } from "@/app/lib/firebase-admin-server";
import {
  STORAGE_WEBSITE_BOOKINGS,
  type WebsiteBookingPaymentStatus,
  type WebsiteBookingRecord,
} from "@/app/lib/website-booking-types";

const bookingsRef = () => getLighthouseAdminDatabase().ref(`lighthouse-v1/${STORAGE_WEBSITE_BOOKINGS}`);

export async function appendWebsiteBookingServer(booking: WebsiteBookingRecord) {
  await bookingsRef().transaction((value: WebsiteBookingRecord[] | null) => {
    const current = Array.isArray(value) ? value : [];
    return current.some((entry) => entry.bookingReference === booking.bookingReference)
      ? undefined
      : [booking, ...current];
  });
}

export async function updateWebsiteBookingPaymentServer(
  bookingReference: string,
  paymentStatus: WebsiteBookingPaymentStatus,
  gatewayState: string,
) {
  if (!bookingReference.trim()) return false;

  let changed = false;
  const checkedAt = new Date().toISOString();
  await bookingsRef().transaction((value: WebsiteBookingRecord[] | null) => {
    const current = Array.isArray(value) ? value : [];
    if (!current.some((booking) => booking.bookingReference === bookingReference)) return undefined;
    changed = true;
    return current.map((booking) => booking.bookingReference === bookingReference
      ? { ...booking, paymentStatus, paymentGatewayState: gatewayState, paymentCheckedAt: checkedAt }
      : booking);
  });

  return changed;
}
