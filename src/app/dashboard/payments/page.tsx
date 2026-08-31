"use client";

import { useEffect, useMemo, useState } from "react";
import { readStoredRole } from "@/app/lib/auth";
import { getLighthouseRoomPrice, Role } from "@/app/lib/mock-data";
import { getActiveBaristaStateKey, getActiveKitchenStateKey, readCashierState, readPosState, writeCashierState, writePosState } from "@/app/lib/storage";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Receipt } from "lucide-react";
import { useIsDirector } from "@/hooks/use-is-director";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";

type PaymentsTab = "reception" | "kitchen" | "barista";
type PaymentDateFilter = "all" | "date";
type PaymentMethod = "cash" | "card" | "mobile-money" | "credit";
type KitchenPaymentMethod = "cash" | "card" | "mobile" | "credit";
type BaristaPaymentMethod = "cash" | "card" | "mobile" | "credit";
type TransactionStatus = "completed" | "credit" | "checked-out";
type KitchenPaymentStatus = "completed" | "credit";
type BaristaPaymentStatus = "completed" | "credit";
type RoomType = "lighthouse";

interface BookingPaymentBreakdownItem {
  method: Exclude<PaymentMethod, "credit">;
  nights: number;
  amount: number;
}

interface BookingRecord {
  id: string;
  receiptNo: string;
  createdAt: number;
  guestName: string;
  phone: string;
  roomType: RoomType;
  roomNumber: string;
  payment: PaymentMethod;
  checkInDate: string;
  checkOutDate: string;
  checkOutTime: string;
  nights: number;
  ratePerNight?: number;
  total: number;
  status: TransactionStatus;
  paymentBreakdown?: BookingPaymentBreakdownItem[];
  paymentMethodEditedAt?: number;
  updatedAt?: number;
}

interface KitchenPaymentRecord {
  id: string;
  ticketId: string;
  code: string;
  createdAt: number;
  mode: "restaurant" | "room-service" | "take-away";
  destination: string;
  roomNumber?: string;
  total: number;
  status: KitchenPaymentStatus;
  method: KitchenPaymentMethod;
  paymentMethodEditedAt?: number;
  updatedAt?: number;
}

interface BaristaPaymentRecord {
  id: string;
  ticketId: string;
  code: string;
  createdAt: number;
  mode: "restaurant" | "room-service" | "take-away";
  destination: string;
  roomNumber?: string;
  total: number;
  status: BaristaPaymentStatus;
  method: BaristaPaymentMethod;
  lines?: Array<{ name: string; qty: number }>;
  paymentMethodEditedAt?: number;
  updatedAt?: number;
}

interface PaymentRow {
  source: "booking" | "kitchen" | "barista";
  id: string;
  ref: string;
  payer: string;
  context: string;
  roomNumber: string;
  dateLabel: string;
  dateDetail?: string;
  method: string;
  amount: number;
  createdAt: number;
  updatedAt?: number;
  status: "completed" | "credit";
}

const STORAGE_BOOKING_TX = "lighthouse-cashier-transactions";
const STORAGE_KITCHEN_PAYMENTS = "lighthouse-kitchen-payments";
const STORAGE_BARISTA_PAYMENTS = "lighthouse-barista-payments";

function formatAgo(timestamp: number): string {
  const mins = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m ago`;
}

function formatDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function asNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toDayKey(value: number) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
}

function getPaymentRevision(createdAt: number, updatedAt?: number) {
  const revision = asNumber(updatedAt);
  return revision > createdAt ? revision : createdAt;
}

function getUpdatedPaymentDetail(createdAt: number, updatedAt?: number) {
  const revision = asNumber(updatedAt);
  if (revision <= createdAt) return undefined;
  return `Updated ${new Date(revision).toLocaleString()}`;
}

function daysBetween(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00`);
  const endDate = new Date(`${end}T00:00:00`);
  if (!Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) return 0;
  return Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
}

function matchesPaymentDateFilter(createdAt: number, filter: PaymentDateFilter, selectedDate: string) {
  if (filter === "all") return true;

  const createdDate = new Date(createdAt);
  if (!Number.isFinite(createdDate.getTime())) return false;
  return Boolean(selectedDate) && toDayKey(createdDate.getTime()) === selectedDate;
}

function getBookingPaymentLabel(tx: BookingRecord) {
  if (Array.isArray(tx.paymentBreakdown) && tx.paymentBreakdown.length > 0) {
    return tx.paymentBreakdown
      .map((entry) => `${entry.nights} night${entry.nights === 1 ? "" : "s"} ${entry.method}`)
      .join(" / ");
  }

  if (tx.payment === "credit") {
    return tx.status === "credit" ? "pending" : "unassigned";
  }
  return tx.payment;
}

function formatPaymentItems(lines: Array<{ name: string; qty: number }> | undefined) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return lines.map((line) => `${line.name} x${line.qty}`).join(" | ");
}

function getPosRoomNumber(payment: { mode: string; destination: string; roomNumber?: string }) {
  if (typeof payment.roomNumber === "string" && payment.roomNumber.trim()) return payment.roomNumber.trim();
  if (payment.mode !== "room-service") return "-";
  const legacyRoomMatch = payment.destination.trim().match(/^room\s+(.+)$/i);
  return legacyRoomMatch?.[1]?.trim() || "-";
}

export default function PaymentsPage() {
  const isDirector = useIsDirector();
  const [role, setRole] = useState<Role>("manager");
  const [paymentsTab, setPaymentsTab] = useState<PaymentsTab>("reception");
  const [paymentDateFilter, setPaymentDateFilter] = useState<PaymentDateFilter>("all");
  const [selectedPaymentDate, setSelectedPaymentDate] = useState("");
  const [bookingTransactions, setBookingTransactions] = useState<BookingRecord[]>([]);
  const [kitchenPayments, setKitchenPayments] = useState<KitchenPaymentRecord[]>([]);
  const [baristaPayments, setBaristaPayments] = useState<BaristaPaymentRecord[]>([]);

  const [selectedCredit, setSelectedCredit] = useState<{ source: "booking" | "kitchen" | "barista"; id: string } | null>(null);
  const [showMethodPopup, setShowMethodPopup] = useState(false);
  const [savingCreditPayment, setSavingCreditPayment] = useState(false);
  const [creditPaymentFeedback, setCreditPaymentFeedback] = useState<string | null>(null);
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [payerNameDraft, setPayerNameDraft] = useState("");
  const [roomNumberDraft, setRoomNumberDraft] = useState("");
  const [checkInDateDraft, setCheckInDateDraft] = useState("");
  const [checkOutDateDraft, setCheckOutDateDraft] = useState("");
  const [paymentMethodDraft, setPaymentMethodDraft] = useState<PaymentMethod>("cash");
  const [savingEditedPayment, setSavingEditedPayment] = useState(false);
  const [editPaymentFeedback, setEditPaymentFeedback] = useState<string | null>(null);
  const adjustedNights = daysBetween(checkInDateDraft, checkOutDateDraft);
  const adjustedRate = roomNumberDraft.trim() ? getLighthouseRoomPrice(roomNumberDraft.trim()) : 0;
  const adjustedTotal = adjustedNights > 0 ? adjustedNights * adjustedRate : 0;

  useEffect(() => {
    const savedRole = readStoredRole();
    if (savedRole) {
      setRole(savedRole);
      setPaymentsTab(savedRole === "kitchen" ? "kitchen" : savedRole === "barista" ? "barista" : "reception");
    }
  }, []);

  useEffect(() => {
    const activeKitchenKey = getActiveKitchenStateKey();
    const activeBaristaKey = getActiveBaristaStateKey();

    const refreshPayments = () => {
      const cashierSnapshot = readCashierState<BookingRecord>(STORAGE_BOOKING_TX, "lighthouse-cashier-seq", 1);
      const kitchenSnapshot = readPosState<unknown, KitchenPaymentRecord, unknown>(
        activeKitchenKey,
        "lighthouse-kitchen-tickets",
        "lighthouse-kitchen-seq",
        STORAGE_KITCHEN_PAYMENTS,
        "lighthouse-kitchen-menu",
        1,
      );
      const baristaSnapshot = readPosState<unknown, BaristaPaymentRecord, unknown>(
        activeBaristaKey,
        "lighthouse-barista-orders",
        "lighthouse-barista-seq",
        STORAGE_BARISTA_PAYMENTS,
        "lighthouse-barista-menu",
        1,
      );

      const normalizedBookingTransactions: BookingRecord[] = cashierSnapshot.transactions.map((tx): BookingRecord => {
        const fallbackMethod =
          tx.status !== "credit" && (!tx.payment || tx.payment === "credit") ? "cash" : tx.payment;
        return {
          ...tx,
          payment: fallbackMethod,
          status: tx.status === "credit" || tx.status === "checked-out" ? tx.status : "completed",
        };
      });

      setBookingTransactions(normalizedBookingTransactions);
      setKitchenPayments(kitchenSnapshot.payments.map((tx) => ({ ...tx, status: tx.status === "credit" ? "credit" : "completed" })));
      setBaristaPayments(baristaSnapshot.payments.map((tx) => ({ ...tx, status: tx.status === "credit" ? "credit" : "completed" })));
    };

    refreshPayments();

    void Promise.all([
      hydrateStorageKeyFromFirebase("lighthouse-cashier-state", true),
      hydrateStorageKeyFromFirebase(activeKitchenKey, true),
      hydrateStorageKeyFromFirebase(activeBaristaKey, true),
    ]).finally(refreshPayments);

    const unsubscribeCashier = subscribeToSyncedStorageKey("lighthouse-cashier-state", refreshPayments);
    const unsubscribeKitchen = subscribeToSyncedStorageKey(activeKitchenKey, refreshPayments);
    const unsubscribeBarista = subscribeToSyncedStorageKey(activeBaristaKey, refreshPayments);

    return () => {
      unsubscribeCashier();
      unsubscribeKitchen();
      unsubscribeBarista();
    };
  }, []);

  const bookingRows = useMemo<PaymentRow[]>(
    () =>
      bookingTransactions.map((tx) => ({
        source: "booking",
        id: tx.id,
        ref: tx.receiptNo,
        payer: tx.guestName,
        context: `Room ${tx.roomNumber}`,
        roomNumber: tx.roomNumber || "-",
        dateLabel: `${formatDate(tx.checkInDate)} - ${formatDate(tx.checkOutDate)}`,
        dateDetail: [
          `${tx.nights} night${tx.nights === 1 ? "" : "s"}`,
          getUpdatedPaymentDetail(tx.createdAt, tx.updatedAt ?? tx.paymentMethodEditedAt),
        ].filter(Boolean).join(" • "),
        method: getBookingPaymentLabel(tx),
        amount: asNumber(tx.total),
        createdAt: asNumber(tx.createdAt),
        updatedAt: asNumber(tx.updatedAt ?? tx.paymentMethodEditedAt) || undefined,
        status: tx.status === "credit" ? "credit" : "completed",
      })),
    [bookingTransactions],
  );

  const kitchenRows = useMemo<PaymentRow[]>(
    () =>
      kitchenPayments.map((tx) => ({
        source: "kitchen",
        id: tx.id,
        ref: tx.code,
        payer: "Kitchen Order",
        context: tx.destination,
        roomNumber: getPosRoomNumber(tx),
        dateLabel: formatDate(new Date(tx.createdAt).toISOString()),
        dateDetail: getUpdatedPaymentDetail(tx.createdAt, tx.updatedAt ?? tx.paymentMethodEditedAt),
        method: tx.method,
        amount: asNumber(tx.total),
        createdAt: asNumber(tx.createdAt),
        updatedAt: asNumber(tx.updatedAt ?? tx.paymentMethodEditedAt) || undefined,
        status: tx.status,
      })),
    [kitchenPayments],
  );

  const baristaRows = useMemo<PaymentRow[]>(
    () =>
      baristaPayments.map((tx) => ({
        source: "barista",
        id: tx.id,
        ref: tx.code,
        payer: "Barista Order",
        context: formatPaymentItems(tx.lines) || tx.destination,
        roomNumber: getPosRoomNumber(tx),
        dateLabel: formatDate(new Date(tx.createdAt).toISOString()),
        dateDetail: getUpdatedPaymentDetail(tx.createdAt, tx.updatedAt ?? tx.paymentMethodEditedAt),
        method: tx.method,
        amount: asNumber(tx.total),
        createdAt: asNumber(tx.createdAt),
        updatedAt: asNumber(tx.updatedAt ?? tx.paymentMethodEditedAt) || undefined,
        status: tx.status,
      })),
    [baristaPayments],
  );

  const activePaymentRows = useMemo(
    () =>
      paymentsTab === "reception"
        ? bookingRows
        : paymentsTab === "kitchen"
        ? kitchenRows
        : baristaRows,
    [baristaRows, bookingRows, kitchenRows, paymentsTab],
  );
  const completedPayments = useMemo(() => activePaymentRows.filter((tx) => tx.status === "completed"), [activePaymentRows]);
  const creditPayments = useMemo(() => activePaymentRows.filter((tx) => tx.status === "credit"), [activePaymentRows]);

  const totalCompleted = completedPayments.reduce((sum, tx) => sum + tx.amount, 0);
  const totalCredit = creditPayments.reduce((sum, tx) => sum + tx.amount, 0);

  const openPaidFlow = (row: PaymentRow) => {
    if (isDirector) return;
    setCreditPaymentFeedback(null);
    setSelectedCredit({ source: row.source, id: row.id });
    setShowMethodPopup(true);
  };

  const openEditPayerDialog = (row: PaymentRow) => {
    if (isDirector || row.source !== "booking") return;
    const booking = bookingTransactions.find((tx) => tx.id === row.id);
    if (!booking) return;
    setEditingBookingId(row.id);
    setPayerNameDraft(booking.guestName);
    setRoomNumberDraft(booking.roomNumber);
    setCheckInDateDraft(booking.checkInDate);
    setCheckOutDateDraft(booking.checkOutDate);
    setPaymentMethodDraft(booking.status === "credit" ? "credit" : booking.payment);
    setEditPaymentFeedback(null);
  };

  const closeEditPayerDialog = () => {
    setEditingBookingId(null);
    setPayerNameDraft("");
    setRoomNumberDraft("");
    setCheckInDateDraft("");
    setCheckOutDateDraft("");
    setPaymentMethodDraft("cash");
    setEditPaymentFeedback(null);
  };

  const saveEditedPayer = async () => {
    if (!editingBookingId || savingEditedPayment) return;
    const nextName = payerNameDraft.trim();
    const nextRoomNumber = roomNumberDraft.trim();
    const nextNights = daysBetween(checkInDateDraft, checkOutDateDraft);
    if (!nextName || !nextRoomNumber || nextNights < 1) return;

    const snapshot = readCashierState<BookingRecord>(STORAGE_BOOKING_TX, "lighthouse-cashier-seq", 1);
    const updatedAt = Date.now();
    const nextTransactions = snapshot.transactions.map((tx) =>
      tx.id === editingBookingId
        ? {
            ...tx,
            guestName: nextName,
            roomNumber: nextRoomNumber,
            checkInDate: checkInDateDraft,
            checkOutDate: checkOutDateDraft,
            nights: nextNights,
            ratePerNight: adjustedRate,
            total: nextNights * adjustedRate,
            payment: paymentMethodDraft,
            status:
              paymentMethodDraft === "credit"
                ? "credit" as const
                : tx.status === "checked-out"
                  ? "checked-out" as const
                  : "completed" as const,
            paymentBreakdown: undefined,
            paymentMethodEditedAt: updatedAt,
            updatedAt,
          }
        : tx,
    );
    setSavingEditedPayment(true);
    setEditPaymentFeedback(null);
    try {
      const saved = await writeCashierState(nextTransactions, snapshot.receiptSeq);
      if (!saved) {
        setEditPaymentFeedback("The payment update is saved on this device but has not reached the cloud. Check the connection and try Update again.");
        return;
      }
      setBookingTransactions(nextTransactions);
      closeEditPayerDialog();
    } finally {
      setSavingEditedPayment(false);
    }
  };

  const applyPaidMethod = async (method: "cash" | "card" | "mobile") => {
    if (!selectedCredit || savingCreditPayment) return;

    const updatedAt = Date.now();
    let synced = false;
    setSavingCreditPayment(true);
    setCreditPaymentFeedback(null);

    if (selectedCredit.source === "booking") {
      const mappedMethod: PaymentMethod = method === "mobile" ? "mobile-money" : method;
      const snapshot = readCashierState<BookingRecord>(STORAGE_BOOKING_TX, "lighthouse-cashier-seq", 1);
      const nextTransactions = snapshot.transactions.map((tx) =>
        tx.id === selectedCredit.id
          ? {
              ...tx,
              status: tx.status === "checked-out" ? "checked-out" as const : "completed" as const,
              payment: mappedMethod,
              paymentMethodEditedAt: updatedAt,
              updatedAt,
            }
          : tx,
      );
      setBookingTransactions(nextTransactions);
      synced = (await writeCashierState(nextTransactions, snapshot.receiptSeq)) === true;
    } else if (selectedCredit.source === "kitchen") {
      const activeKitchenKey = getActiveKitchenStateKey();
      const kitchenSnapshot = readPosState<unknown, KitchenPaymentRecord, unknown>(activeKitchenKey, "lighthouse-kitchen-tickets", "lighthouse-kitchen-seq", STORAGE_KITCHEN_PAYMENTS, "lighthouse-kitchen-menu", 1);
      const nextPayments = kitchenSnapshot.payments.map((tx) =>
        tx.id === selectedCredit.id
          ? { ...tx, status: "completed" as const, method, paymentMethodEditedAt: updatedAt, updatedAt }
          : tx,
      );
      setKitchenPayments(nextPayments);
      synced = (await writePosState(activeKitchenKey, kitchenSnapshot.tickets, kitchenSnapshot.ticketSeq, nextPayments, kitchenSnapshot.menuItems)) === true;
    } else {
      const activeBaristaKey = getActiveBaristaStateKey();
      const baristaSnapshot = readPosState<unknown, BaristaPaymentRecord, unknown>(activeBaristaKey, "lighthouse-barista-orders", "lighthouse-barista-seq", STORAGE_BARISTA_PAYMENTS, "lighthouse-barista-menu", 1);
      const nextPayments = baristaSnapshot.payments.map((tx) =>
        tx.id === selectedCredit.id
          ? { ...tx, status: "completed" as const, method, paymentMethodEditedAt: updatedAt, updatedAt }
          : tx,
      );
      setBaristaPayments(nextPayments);
      synced = (await writePosState(activeBaristaKey, baristaSnapshot.tickets, baristaSnapshot.ticketSeq, nextPayments, baristaSnapshot.menuItems)) === true;
    }

    setSavingCreditPayment(false);
    if (!synced) {
      setCreditPaymentFeedback("Saved on this device. Cloud synchronization will retry automatically when the connection is restored.");
      return;
    }
    setShowMethodPopup(false);
    setSelectedCredit(null);
  };

  const rows = useMemo(() => {
    return activePaymentRows
      .filter((row) => matchesPaymentDateFilter(row.createdAt, paymentDateFilter, selectedPaymentDate))
      .sort((a, b) => getPaymentRevision(b.createdAt, b.updatedAt) - getPaymentRevision(a.createdAt, a.updatedAt));
  }, [activePaymentRows, paymentDateFilter, selectedPaymentDate]);

  const canViewAllTabs = role === "manager" || role === "director";
  const headerDescription =
    role === "kitchen"
      ? "Kitchen payment tracking only"
      : role === "barista"
      ? "Barista payment tracking only"
      : role === "cashier"
      ? "Reception payment tracking only"
      : "Reception, kitchen, and barista payment tracking";
  const cardDescription =
    role === "kitchen"
      ? "Kitchen payments only"
      : role === "barista"
      ? "Barista payments only"
      : role === "cashier"
      ? "Reception booking payments only"
      : "Use tabs to review reception, kitchen, and barista payments";

  return (
    <div className="space-y-6">
      <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight uppercase">Payments</h1>
          <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
            {headerDescription}
          </p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:w-auto sm:grid-cols-2">
          <Badge variant="outline" className="h-10 justify-center px-3 text-center border-primary text-primary font-black uppercase text-[10px] tracking-widest sm:px-4">
            Completed TSh {totalCompleted.toLocaleString()}
          </Badge>
          <Badge variant="outline" className="h-10 justify-center px-3 text-center font-black uppercase text-[10px] tracking-widest bg-white sm:px-4">
            Credit TSh {totalCredit.toLocaleString()}
          </Badge>
        </div>
      </header>
      {isDirector && (
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-none">
          <CardContent className="p-3 text-xs font-black uppercase tracking-widest text-emerald-700">
            Managing Director View: Revenue and credit visibility only (read-only)
          </CardContent>
        </Card>
      )}

      <Card className="border-none shadow-sm">
        <CardHeader>
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Payment Transactions</CardTitle>
              <CardDescription>{cardDescription}</CardDescription>
            </div>
            <div className="flex w-full flex-col gap-2 md:w-auto md:flex-row md:items-center">
              <Tabs value={paymentDateFilter} onValueChange={(value) => setPaymentDateFilter(value as PaymentDateFilter)} className="w-full md:w-auto">
                <TabsList className="grid h-10 w-full grid-cols-2 md:w-auto">
                  <TabsTrigger value="all" className="text-[10px] font-black uppercase tracking-widest">All Time</TabsTrigger>
                  <TabsTrigger value="date" className="text-[10px] font-black uppercase tracking-widest">Date</TabsTrigger>
                </TabsList>
              </Tabs>
              {paymentDateFilter === "date" && (
                <Input
                  type="date"
                  value={selectedPaymentDate}
                  onChange={(event) => setSelectedPaymentDate(event.target.value)}
                  className="h-10 w-full md:w-[160px]"
                />
              )}
              {canViewAllTabs && (
                <Tabs value={paymentsTab} onValueChange={(value) => setPaymentsTab(value as PaymentsTab)} className="w-full md:w-auto">
                  <TabsList className="h-10 w-full md:w-auto">
                    <TabsTrigger value="reception" className="text-[10px] font-black uppercase tracking-widest">
                      Reception
                    </TabsTrigger>
                    <TabsTrigger value="kitchen" className="text-[10px] font-black uppercase tracking-widest">
                      Kitchen
                    </TabsTrigger>
                    <TabsTrigger value="barista" className="text-[10px] font-black uppercase tracking-widest">
                      Barista
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-0">
          <div className="space-y-3 p-3 md:hidden">
            {rows.map((tx) => (
              <div key={`${tx.source}-${tx.id}`} className="rounded-lg border bg-white p-3 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black">{tx.ref}</p>
                    <p className="mt-1 truncate text-xs font-bold text-muted-foreground">{tx.payer}</p>
                  </div>
                  <Badge className={tx.status === "credit" ? "shrink-0 bg-red-600 text-white border-red-600 hover:bg-red-600" : "shrink-0 bg-blue-600 text-white border-blue-600 hover:bg-blue-600"}>
                    {tx.status}
                  </Badge>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Context</p>
                    <p className="mt-1 font-bold">{tx.context}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Room Number</p>
                    <p className="mt-1 font-black">{tx.roomNumber}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">
                      {paymentsTab === "reception" ? "Dates" : "Created"}
                    </p>
                    <p className="mt-1 font-bold">{tx.dateLabel}</p>
                    {tx.dateDetail && (
                      <p className="mt-0.5 text-[10px] font-bold text-muted-foreground">{tx.dateDetail}</p>
                    )}
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Method</p>
                    <p className="mt-1 font-black uppercase">{tx.method}</p>
                  </div>
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Amount</p>
                    <p className="mt-1 font-black">TSh {tx.amount.toLocaleString()}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2 border-t pt-3">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    {formatAgo(getPaymentRevision(tx.createdAt, tx.updatedAt))}
                  </p>
                  {!isDirector && tx.source === "booking" ? (
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() => openEditPayerDialog(tx)}
                        className="h-9 font-black uppercase text-[10px] tracking-widest"
                      >
                        Edit
                      </Button>
                      {tx.status === "credit" && (
                        <Button
                          onClick={() => openPaidFlow(tx)}
                          className="h-9 font-black uppercase text-[10px] tracking-widest bg-green-600 hover:bg-green-600/90"
                        >
                          Paid
                        </Button>
                      )}
                    </div>
                  ) : tx.status === "credit" && !isDirector ? (
                    <Button
                      onClick={() => openPaidFlow(tx)}
                      className="h-9 font-black uppercase text-[10px] tracking-widest bg-green-600 hover:bg-green-600/90"
                    >
                      Paid
                    </Button>
                  ) : (
                    <Badge className="shrink-0 bg-gray-200 text-gray-700 border-gray-200 hover:bg-gray-200">View</Badge>
                  )}
                </div>
              </div>
            ))}

            {rows.length === 0 && (
              <div className="py-12 text-center opacity-40">
                <Receipt className="w-10 h-10 mx-auto mb-2" />
                <p className="font-black uppercase tracking-widest text-xs">No payments found</p>
              </div>
            )}
          </div>

          <div className="hidden md:block">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Reference</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Payer</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Context</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Room Number</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">
                  {paymentsTab === "reception" ? "Dates" : "Created"}
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Method</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Amount</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Status</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow key={`${tx.source}-${tx.id}`}>
                  <TableCell className="font-black">{tx.ref}</TableCell>
                  <TableCell className="font-bold">
                    <p>{tx.payer}</p>
                    <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                      {formatAgo(getPaymentRevision(tx.createdAt, tx.updatedAt))}
                    </p>
                  </TableCell>
                  <TableCell className="font-bold">{tx.context}</TableCell>
                  <TableCell className="font-black">{tx.roomNumber}</TableCell>
                  <TableCell className="font-bold">
                    <p>{tx.dateLabel}</p>
                    {tx.dateDetail && (
                      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                        {tx.dateDetail}
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{tx.method}</TableCell>
                  <TableCell className="font-black">TSh {tx.amount.toLocaleString()}</TableCell>
                  <TableCell>
                    <Badge className={tx.status === "credit" ? "bg-red-600 text-white border-red-600 hover:bg-red-600" : "bg-blue-600 text-white border-blue-600 hover:bg-blue-600"}>
                      {tx.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {!isDirector && tx.source === "booking" ? (
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="outline"
                          onClick={() => openEditPayerDialog(tx)}
                          className="h-9 font-black uppercase text-[10px] tracking-widest"
                        >
                          Edit
                        </Button>
                        {tx.status === "credit" && (
                          <Button
                            onClick={() => openPaidFlow(tx)}
                            className="h-9 font-black uppercase text-[10px] tracking-widest bg-green-600 hover:bg-green-600/90"
                          >
                            Paid
                          </Button>
                        )}
                      </div>
                    ) : tx.status === "credit" && !isDirector ? (
                      <Button
                        onClick={() => openPaidFlow(tx)}
                        className="h-9 font-black uppercase text-[10px] tracking-widest bg-green-600 hover:bg-green-600/90"
                      >
                        Paid
                      </Button>
                    ) : (
                      <Badge className="bg-gray-200 text-gray-700 border-gray-200 hover:bg-gray-200">View</Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}

              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-12 text-center">
                    <div className="opacity-40">
                      <Receipt className="w-10 h-10 mx-auto mb-2" />
                      <p className="font-black uppercase tracking-widest text-xs">No payments found</p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          </div>
        </CardContent>
      </Card>

      {showMethodPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Select Paid Method</CardTitle>
              <CardDescription>Choose how this credit was paid</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button disabled={savingCreditPayment} onClick={() => void applyPaidMethod("cash")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                {savingCreditPayment ? "Saving..." : "Cash"}
              </Button>
              <Button disabled={savingCreditPayment} onClick={() => void applyPaidMethod("card")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                Card
              </Button>
              <Button disabled={savingCreditPayment} onClick={() => void applyPaidMethod("mobile")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                Mobile
              </Button>
              {creditPaymentFeedback && (
                <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  {creditPaymentFeedback}
                </p>
              )}
              <Button
                variant="outline"
                onClick={() => {
                  setShowMethodPopup(false);
                  setSelectedCredit(null);
                }}
                className="w-full h-10 font-black uppercase text-[10px] tracking-widest"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      <Dialog open={Boolean(editingBookingId)} onOpenChange={(open) => !open && closeEditPayerDialog()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tight">Edit Reception Payment</DialogTitle>
            <DialogDescription>Update the payer, room number, stay dates, and payment method for this booking payment.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payer Name</p>
              <Input
                value={payerNameDraft}
                onChange={(event) => setPayerNameDraft(event.target.value)}
                placeholder="Enter payer name"
                className="h-11"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Number</p>
              <Input
                value={roomNumberDraft}
                onChange={(event) => setRoomNumberDraft(event.target.value)}
                placeholder="Enter room number"
                className="h-11"
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Method</p>
              <select
                value={paymentMethodDraft}
                onChange={(event) => setPaymentMethodDraft(event.target.value as PaymentMethod)}
                className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-bold"
              >
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile-money">Mobile Money</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Check-in Date</p>
              <Input type="date" value={checkInDateDraft} onChange={(event) => setCheckInDateDraft(event.target.value)} className="h-11" />
            </div>
            <div className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Check-out Date</p>
              <Input type="date" min={checkInDateDraft} value={checkOutDateDraft} onChange={(event) => setCheckOutDateDraft(event.target.value)} className="h-11" />
            </div>
            {checkInDateDraft && checkOutDateDraft && daysBetween(checkInDateDraft, checkOutDateDraft) < 1 && (
              <p className="text-sm font-bold text-red-600 sm:col-span-2">Check-out must be after check-in.</p>
            )}
            {roomNumberDraft.trim() && adjustedNights > 0 && (
              <div className="space-y-2 rounded-lg border bg-muted/20 p-3 sm:col-span-2">
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span>Rate / Night</span>
                  <span>TSh {adjustedRate.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                  <span>Nights</span>
                  <span>{adjustedNights}</span>
                </div>
                <div className="flex justify-between border-t pt-2 text-sm font-black uppercase tracking-widest">
                  <span>Updated Total</span>
                  <span>TSh {adjustedTotal.toLocaleString()}</span>
                </div>
              </div>
            )}
            {editPaymentFeedback && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800 sm:col-span-2">
                {editPaymentFeedback}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeEditPayerDialog} className="font-black uppercase text-[10px] tracking-widest">
              Cancel
            </Button>
            <Button
              onClick={() => void saveEditedPayer()}
              disabled={!payerNameDraft.trim() || !roomNumberDraft.trim() || adjustedNights < 1 || savingEditedPayment}
              className="font-black uppercase text-[10px] tracking-widest"
            >
              {savingEditedPayment ? "Saving..." : "Update"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
