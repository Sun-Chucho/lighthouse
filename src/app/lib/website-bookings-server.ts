import { readServerSyncedStorageValue, writeServerSyncedStorageValue } from "@/app/lib/firebase-server";
import {
  STORAGE_WEBSITE_BOOKINGS,
  type WebsiteBookingPaymentStatus,
  type WebsiteBookingRecord,
} from "@/app/lib/website-booking-types";

export async function appendWebsiteBookingServer(booking: WebsiteBookingRecord) {
  const current = (await readServerSyncedStorageValue<WebsiteBookingRecord[]>(STORAGE_WEBSITE_BOOKINGS)) ?? [];
  if (current.some((entry) => entry.bookingReference === booking.bookingReference)) {
    return;
  }

  await writeServerSyncedStorageValue(STORAGE_WEBSITE_BOOKINGS, [booking, ...current]);
}

export async function updateWebsiteBookingPaymentServer(
  bookingReference: string,
  paymentStatus: WebsiteBookingPaymentStatus,
  gatewayState: string,
) {
  if (!bookingReference.trim()) return false;

  const current = (await readServerSyncedStorageValue<WebsiteBookingRecord[]>(STORAGE_WEBSITE_BOOKINGS)) ?? [];
  let changed = false;
  const checkedAt = new Date().toISOString();
  const next = current.map((booking) => {
    if (booking.bookingReference !== bookingReference) return booking;
    changed = true;
    return {
      ...booking,
      paymentStatus,
      paymentGatewayState: gatewayState,
      paymentCheckedAt: checkedAt,
    };
  });

  if (changed) {
    await writeServerSyncedStorageValue(STORAGE_WEBSITE_BOOKINGS, next);
  }

  return changed;
}
