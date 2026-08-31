export const STORAGE_WEBSITE_BOOKINGS = "lighthouse-website-bookings";

export type WebsiteBookingStatus = "new" | "seen";
export type WebsiteRoomType = "luxury" | "classic";
export type WebsiteBookingBackendSyncStatus = "synced" | "pending" | "failed";
export type WebsiteBookingPaymentStatus = "pending" | "paid" | "failed" | "cancelled" | "not_started";

export interface WebsiteBookingRecord {
  id: string;
  bookingReference: string;
  fullName: string;
  email: string;
  phone: string;
  roomType: WebsiteRoomType;
  checkIn: string;
  checkOut: string;
  guests: number;
  nights: number;
  pricePerNight: number;
  totalAmount: number;
  currency: "TZS";
  specialRequest: string;
  source: "website";
  status: WebsiteBookingStatus;
  backendSyncStatus: WebsiteBookingBackendSyncStatus;
  backendSyncError: string | null;
  paymentStatus?: WebsiteBookingPaymentStatus;
  paymentProvider?: "ngenius";
  paymentOrderReference?: string | null;
  paymentUrl?: string | null;
  paymentGatewayState?: string | null;
  paymentCheckedAt?: string | null;
  createdAt: string;
  receptionistSeenAt: string | null;
}
