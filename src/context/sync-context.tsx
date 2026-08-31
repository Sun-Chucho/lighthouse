import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "./auth-context";
import { firebaseApp } from "../lib/firebase";

export type BookingInquiryInput = {
  guestName: string;
  email: string;
  phone: string;
  checkIn: string;
  checkOut: string;
  guests: number;
  roomType: "luxury" | "classic";
  note: string;
};

type QueuedBookingInquiry = BookingInquiryInput & {
  id: string;
  queuedAt: string;
};

type SyncStatus = "online" | "offline" | "syncing" | "error";

type SyncContextValue = {
  status: SyncStatus;
  pendingCount: number;
  lastError: string | null;
  queueBookingInquiry: (inquiry: BookingInquiryInput) => Promise<string>;
  retrySync: () => Promise<void>;
};

const OUTBOX_KEY = "lighthouse:booking-inquiry-outbox:v1";
const SyncContext = createContext<SyncContextValue | null>(null);

function readOutbox(): QueuedBookingInquiry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(OUTBOX_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is QueuedBookingInquiry => (
      Boolean(item)
      && typeof item.id === "string"
      && typeof item.queuedAt === "string"
      && typeof item.guestName === "string"
      && typeof item.email === "string"
      && typeof item.phone === "string"
      && typeof item.checkIn === "string"
      && typeof item.checkOut === "string"
      && typeof item.guests === "number"
      && ["luxury", "classic"].includes(item.roomType)
      && typeof item.note === "string"
    ));
  } catch {
    return [];
  }
}

function writeOutbox(items: QueuedBookingInquiry[]) {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(items));
}

function createOutboxId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `request-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { ensureAnonymousSession } = useAuth();
  const [status, setStatus] = useState<SyncStatus>(() => navigator.onLine ? "online" : "offline");
  const [pendingCount, setPendingCount] = useState(() => readOutbox().length);
  const [lastError, setLastError] = useState<string | null>(null);
  const flushing = useRef(false);

  const flushOutbox = useCallback(async () => {
    if (flushing.current || !navigator.onLine) {
      if (!navigator.onLine) setStatus("offline");
      return;
    }

    const queued = readOutbox();
    if (queued.length === 0) {
      setPendingCount(0);
      setStatus("online");
      return;
    }

    flushing.current = true;
    setStatus("syncing");
    setLastError(null);

    try {
      await ensureAnonymousSession();
      const { getAuth } = await import("firebase/auth");
      const idToken = await getAuth(firebaseApp).currentUser?.getIdToken();
      if (!idToken) throw new Error("Guest authentication is unavailable.");
      for (const inquiry of queued) {
        const response = await fetch("/api/bookings", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${idToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
          fullName: inquiry.guestName,
          email: inquiry.email,
          phone: inquiry.phone,
          checkIn: inquiry.checkIn,
          checkOut: inquiry.checkOut,
          guests: inquiry.guests,
          roomType: inquiry.roomType,
          specialRequest: inquiry.note,
          formStartedAt: new Date(inquiry.queuedAt).getTime() - 5_000,
          checkoutAction: "reservation",
          }),
        });
        if (!response.ok) {
          const result = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(result.error ?? `Booking sync failed (${response.status}).`);
        }
        const remaining = readOutbox().filter((item) => item.id !== inquiry.id);
        writeOutbox(remaining);
        setPendingCount(remaining.length);
      }
      setStatus("online");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      setStatus(navigator.onLine ? "error" : "offline");
    } finally {
      flushing.current = false;
    }
  }, [ensureAnonymousSession]);

  useEffect(() => {
    const handleOnline = () => {
      setStatus("online");
      void flushOutbox();
    };
    const handleOffline = () => setStatus("offline");
    const handleFocus = () => {
      if (navigator.onLine && readOutbox().length > 0) void flushOutbox();
    };
    const retryInterval = window.setInterval(() => {
      if (navigator.onLine && readOutbox().length > 0) void flushOutbox();
    }, 30_000);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    window.addEventListener("focus", handleFocus);
    if (navigator.onLine) void flushOutbox();

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("focus", handleFocus);
      window.clearInterval(retryInterval);
    };
  }, [flushOutbox]);

  const queueBookingInquiry = useCallback(async (input: BookingInquiryInput) => {
    const inquiry: QueuedBookingInquiry = {
      id: createOutboxId(),
      queuedAt: new Date().toISOString(),
      guestName: input.guestName.trim().slice(0, 120),
      email: input.email.trim().toLowerCase().slice(0, 160),
      phone: input.phone.trim().slice(0, 40),
      checkIn: input.checkIn,
      checkOut: input.checkOut,
      guests: Math.max(1, Math.min(12, Math.round(input.guests))),
      roomType: input.roomType,
      note: input.note.trim().slice(0, 600),
    };
    const nextOutbox = [...readOutbox(), inquiry];
    writeOutbox(nextOutbox);
    setPendingCount(nextOutbox.length);
    if (navigator.onLine) void flushOutbox();
    else setStatus("offline");
    return inquiry.id;
  }, [flushOutbox]);

  const value = useMemo<SyncContextValue>(() => ({
    status,
    pendingCount,
    lastError,
    queueBookingInquiry,
    retrySync: flushOutbox,
  }), [flushOutbox, lastError, pendingCount, queueBookingInquiry, status]);

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const context = useContext(SyncContext);
  if (!context) throw new Error("useSync must be used inside SyncProvider.");
  return context;
}
