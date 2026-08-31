export const STORAGE_LAUNDRY_RECORDS = "lighthouse-laundry-records";

export type LaundryPaymentStatus = "completed" | "credit";
export type LaundryPaymentMethod = "cash" | "card" | "mobile-money" | "credit";

export interface LaundryRecord {
  id: string;
  clientName: string;
  itemCount: number;
  totalAmount: number;
  status: LaundryPaymentStatus;
  paymentMethod: LaundryPaymentMethod;
  createdAt: number;
  bookingDate?: string;
  paymentDate?: string;
  paidAt?: number;
  recordedAt?: number;
  updatedAt?: number;
  createdBy?: string;
}

export function getLaundryDateTimestamp(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return 0;

  const timestamp = new Date(`${value}T12:00:00`).getTime();
  if (!Number.isFinite(timestamp)) return 0;

  // JavaScript normalizes impossible dates (for example 2026-02-31), so make
  // sure the parsed calendar date is exactly the date that was entered.
  const parsed = new Date(timestamp);
  const normalized = [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, "0"),
    String(parsed.getDate()).padStart(2, "0"),
  ].join("-");
  return normalized === value ? timestamp : 0;
}

export function getLaundryServiceTimestamp(
  record: Pick<LaundryRecord, "bookingDate" | "recordedAt" | "createdAt">,
) {
  const serviceDateTimestamp = getLaundryDateTimestamp(record.bookingDate);
  if (serviceDateTimestamp) return serviceDateTimestamp;

  // Older records stored the service date directly in createdAt.
  const createdAt = Number(record.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;

  const recordedAt = Number(record.recordedAt);
  return Number.isFinite(recordedAt) && recordedAt > 0 ? recordedAt : 0;
}

export function getLaundryPaymentTimestamp(
  record: Pick<LaundryRecord, "paymentDate" | "paidAt" | "createdAt" | "recordedAt">,
) {
  const paymentDateTimestamp = getLaundryDateTimestamp(record.paymentDate);
  if (paymentDateTimestamp) return paymentDateTimestamp;

  const paidAt = Number(record.paidAt);
  if (Number.isFinite(paidAt) && paidAt > 0) return paidAt;

  // Legacy completed records predate separate payment-date tracking. For
  // those records the service/created date is the least surprising fallback.
  const createdAt = Number(record.createdAt);
  if (Number.isFinite(createdAt) && createdAt > 0) return createdAt;

  const recordedAt = Number(record.recordedAt);
  return Number.isFinite(recordedAt) && recordedAt > 0 ? recordedAt : 0;
}

export function getLaundryBusinessTimestamp(record: LaundryRecord) {
  // Laundry reports are recognized on the booking/service date. Payment Date
  // remains separate settlement metadata and must not move revenue between
  // reporting periods.
  return getLaundryServiceTimestamp(record);
}
