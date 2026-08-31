import { readJson, writeJson } from "@/app/lib/storage";
import {
  STORAGE_WEBSITE_BOOKINGS,
  type WebsiteBookingRecord,
} from "@/app/lib/website-booking-types";

export {
  STORAGE_WEBSITE_BOOKINGS,
  type WebsiteBookingBackendSyncStatus,
  type WebsiteBookingPaymentStatus,
  type WebsiteBookingRecord,
  type WebsiteBookingStatus,
  type WebsiteRoomType,
} from "@/app/lib/website-booking-types";

export function readWebsiteBookings() {
  const value = readJson<WebsiteBookingRecord[]>(STORAGE_WEBSITE_BOOKINGS);
  return Array.isArray(value) ? value : [];
}

export function writeWebsiteBookings(bookings: WebsiteBookingRecord[]) {
  writeJson(STORAGE_WEBSITE_BOOKINGS, bookings);
}

export function markWebsiteBookingsSeen(bookings: WebsiteBookingRecord[], bookingIds?: string[]) {
  const targetIds = bookingIds ? new Set(bookingIds) : null;
  const seenAt = new Date().toISOString();

  return bookings.map((booking) => {
    if (booking.status === "seen") {
      return booking;
    }

    if (targetIds && !targetIds.has(booking.id)) {
      return booking;
    }

    return {
      ...booking,
      status: "seen" as const,
      receptionistSeenAt: seenAt,
    };
  });
}
