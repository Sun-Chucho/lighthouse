import { getLighthouseAdminDatabase } from "@/app/lib/firebase-admin-server";
import { sanitizeForStorage } from "@/app/lib/storage-sanitize";
import {
  STORAGE_WEBSITE_BOOKINGS,
  type WebsiteBookingPaymentStatus,
  type WebsiteBookingRecord,
} from "@/app/lib/website-booking-types";

const bookingsRef = () => getLighthouseAdminDatabase().ref(`lighthouse-v1/${STORAGE_WEBSITE_BOOKINGS}`);

export async function appendWebsiteBookingServer(booking: WebsiteBookingRecord) {
  const cleanBooking = sanitizeForStorage(booking);
  await bookingsRef().transaction((value: WebsiteBookingRecord[] | null) => {
    const current = Array.isArray(value) ? value : [];
    return current.some((entry) => entry.bookingReference === cleanBooking.bookingReference)
      ? undefined
      : [cleanBooking, ...current];
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
