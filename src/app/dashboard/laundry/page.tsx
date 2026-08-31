"use client";

import { useEffect, useMemo, useState } from "react";
import { readStoredRole } from "@/app/lib/auth";
import { getLaundryDateTimestamp, LaundryPaymentMethod, LaundryPaymentStatus, LaundryRecord, STORAGE_LAUNDRY_RECORDS } from "@/app/lib/laundry";
import { Role } from "@/app/lib/mock-data";
import { readJson, writeJson } from "@/app/lib/storage";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Shirt, Save } from "lucide-react";

function formatMoney(value: number) {
  const amount = Number(value);
  return `TSh ${Math.round(Number.isFinite(amount) ? amount : 0).toLocaleString()}`;
}

function todayText() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function toDateText(value: number | undefined) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "";
  const date = new Date(timestamp);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function formatBookingDate(record: LaundryRecord) {
  if (record.bookingDate) return record.bookingDate;
  const timestamp = record.createdAt;
  if (!Number.isFinite(timestamp) || timestamp <= 0) return "-";
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime()) ? "-" : date.toISOString().slice(0, 10);
}

function formatPaymentDate(record: LaundryRecord) {
  if (record.status === "credit") return "Not paid";
  return record.paymentDate || toDateText(record.paidAt ?? record.recordedAt ?? record.createdAt) || "-";
}

function normalizeLaundryRecords(value: unknown): LaundryRecord[] {
  if (!Array.isArray(value)) return [];

  return value
    .filter((record): record is Partial<LaundryRecord> => typeof record === "object" && record !== null)
    .map((record, index) => {
      const createdAt = Number(record.createdAt);
      const status = record.status === "credit" ? "credit" : "completed";
      const paymentMethod =
        status === "credit"
          ? "credit"
          : record.paymentMethod === "card" || record.paymentMethod === "mobile-money" || record.paymentMethod === "cash"
            ? record.paymentMethod
            : "cash";

      return {
        id: typeof record.id === "string" && record.id.trim() ? record.id : `laundry-${index}-${Date.now()}`,
        clientName: typeof record.clientName === "string" && record.clientName.trim() ? record.clientName : "Walk-in Client",
        itemCount: Number.isFinite(Number(record.itemCount)) ? Number(record.itemCount) : 0,
        totalAmount: Number.isFinite(Number(record.totalAmount)) ? Number(record.totalAmount) : 0,
        status,
        paymentMethod,
        createdAt: Number.isFinite(createdAt) && createdAt > 0 ? createdAt : 0,
        bookingDate: typeof record.bookingDate === "string" ? record.bookingDate : undefined,
        paymentDate: typeof record.paymentDate === "string" ? record.paymentDate : undefined,
        paidAt: Number.isFinite(Number(record.paidAt)) ? Number(record.paidAt) : undefined,
        recordedAt: Number.isFinite(Number(record.recordedAt)) ? Number(record.recordedAt) : undefined,
        updatedAt: Number.isFinite(Number(record.updatedAt)) ? Number(record.updatedAt) : undefined,
        createdBy: typeof record.createdBy === "string" ? record.createdBy : undefined,
      };
    });
}

export default function LaundryPage() {
  const [role, setRole] = useState<Role>("cashier");
  const [records, setRecords] = useState<LaundryRecord[]>([]);
  const [tab, setTab] = useState<LaundryPaymentStatus>("completed");
  const [clientName, setClientName] = useState("");
  const [bookingDate, setBookingDate] = useState(todayText());
  const [paymentDate, setPaymentDate] = useState(todayText());
  const [itemCount, setItemCount] = useState("");
  const [totalAmount, setTotalAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<LaundryPaymentMethod>("cash");
  const [status, setStatus] = useState<LaundryPaymentStatus>("completed");
  const [creditToPay, setCreditToPay] = useState<string | null>(null);
  const [creditPaymentDate, setCreditPaymentDate] = useState(todayText());
  const [creditPaymentMethod, setCreditPaymentMethod] = useState<Exclude<LaundryPaymentMethod, "credit">>("cash");

  useEffect(() => {
    setRole(readStoredRole() ?? "cashier");

    const refreshLaundry = () => {
      setRecords(normalizeLaundryRecords(readJson<LaundryRecord[]>(STORAGE_LAUNDRY_RECORDS)));
    };

    refreshLaundry();
    void hydrateStorageKeyFromFirebase(STORAGE_LAUNDRY_RECORDS, true).finally(refreshLaundry);
    return subscribeToSyncedStorageKey(STORAGE_LAUNDRY_RECORDS, refreshLaundry);
  }, []);

  const isReadOnly = role === "manager" || role === "director";
  const filteredRecords = useMemo(
    () => records.filter((record) => record.status === tab).sort((a, b) => b.createdAt - a.createdAt),
    [records, tab],
  );
  const completedTotal = records.filter((record) => record.status === "completed").reduce((sum, record) => sum + record.totalAmount, 0);
  const creditTotal = records.filter((record) => record.status === "credit").reduce((sum, record) => sum + record.totalAmount, 0);

  const saveLaundry = () => {
    const parsedItems = Number(itemCount);
    const parsedAmount = Number(totalAmount);
    if (!clientName.trim() || Number.isNaN(parsedItems) || parsedItems <= 0 || Number.isNaN(parsedAmount) || parsedAmount <= 0) return;

    const recordedAt = Date.now();
    const serviceTimestamp = getLaundryDateTimestamp(bookingDate);
    const paymentTimestamp = status === "completed" ? getLaundryDateTimestamp(paymentDate) : 0;
    if (!serviceTimestamp || (status === "completed" && !paymentTimestamp)) return;

    const nextRecord: LaundryRecord = {
      id: `laundry-${recordedAt}`,
      clientName: clientName.trim(),
      itemCount: parsedItems,
      totalAmount: parsedAmount,
      status,
      paymentMethod: status === "credit" ? "credit" : paymentMethod,
      createdAt: serviceTimestamp,
      bookingDate,
      paymentDate: status === "completed" ? paymentDate : undefined,
      paidAt: status === "completed" ? paymentTimestamp : undefined,
      recordedAt,
      createdBy: role,
    };
    const nextRecords = [nextRecord, ...records];
    setRecords(nextRecords);
    writeJson(STORAGE_LAUNDRY_RECORDS, nextRecords);
    setClientName("");
    setBookingDate(todayText());
    setPaymentDate(todayText());
    setItemCount("");
    setTotalAmount("");
    setPaymentMethod("cash");
    setStatus("completed");
    setTab(nextRecord.status);
  };

  const payCredit = () => {
    if (!creditToPay) return;
    const paymentTimestamp = getLaundryDateTimestamp(creditPaymentDate);
    if (!paymentTimestamp) return;
    const updatedAt = Date.now();
    const nextRecords = records.map((record) =>
      record.id === creditToPay
        ? {
            ...record,
            status: "completed" as LaundryPaymentStatus,
            paymentMethod: creditPaymentMethod,
            paymentDate: creditPaymentDate,
            paidAt: paymentTimestamp,
            updatedAt,
          }
        : record
    );
    setRecords(nextRecords);
    writeJson(STORAGE_LAUNDRY_RECORDS, nextRecords);
    setCreditToPay(null);
    setCreditPaymentDate(todayText());
    setCreditPaymentMethod("cash");
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Laundry</h1>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Laundry income records for completed and credit payments
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 font-black uppercase tracking-widest">
          Completed {formatMoney(completedTotal)}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Completed Laundry</p>
              <p className="mt-2 text-2xl font-black">{formatMoney(completedTotal)}</p>
            </div>
            <Shirt className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Credit Laundry</p>
            <p className="mt-2 text-2xl font-black text-red-600">{formatMoney(creditTotal)}</p>
          </CardContent>
        </Card>
      </div>

      {!isReadOnly && (
        <Card className="shadow-sm">
          <CardHeader className="border-b">
            <CardTitle className="text-lg font-black uppercase tracking-tight">New Laundry Income</CardTitle>
            <CardDescription>Enter client, item count, amount, status, and method of payment.</CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Client Name</Label>
              <Input value={clientName} onChange={(event) => setClientName(event.target.value)} placeholder="Client name" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Date Laundry Was Done</Label>
              <Input type="date" value={bookingDate} onChange={(event) => setBookingDate(event.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} disabled={status === "credit"} required={status === "completed"} />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Number of Items</Label>
              <Input type="number" min="1" value={itemCount} onChange={(event) => setItemCount(event.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Total Amount</Label>
              <Input type="number" min="1" value={totalAmount} onChange={(event) => setTotalAmount(event.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Status</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={status} onChange={(event) => setStatus(event.target.value as LaundryPaymentStatus)}>
                <option value="completed">Completed</option>
                <option value="credit">Credit</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Method of Payment</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as LaundryPaymentMethod)} disabled={status === "credit"}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile-money">Mobile Money</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button onClick={saveLaundry} className="h-10 font-black uppercase tracking-widest text-[10px]">
                <Save className="mr-2 h-4 w-4" />
                Save Laundry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <CardTitle className="text-lg font-black uppercase tracking-tight">Laundry Records</CardTitle>
              <CardDescription>{filteredRecords.length} records in this status.</CardDescription>
            </div>
            <Tabs value={tab} onValueChange={(value) => setTab(value as LaundryPaymentStatus)}>
              <TabsList className="h-10">
                <TabsTrigger value="completed" className="font-black uppercase text-[10px] tracking-widest">Completed</TabsTrigger>
                <TabsTrigger value="credit" className="font-black uppercase text-[10px] tracking-widest">Credit</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Laundry Date</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Payment Date</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Client</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Items</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Method</TableHead>
                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Amount</TableHead>
                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredRecords.map((record) => (
                <TableRow key={record.id}>
                  <TableCell className="font-bold">{formatBookingDate(record)}</TableCell>
                  <TableCell className="font-bold">{formatPaymentDate(record)}</TableCell>
                  <TableCell className="font-bold">{record.clientName}</TableCell>
                  <TableCell className="font-bold">{record.itemCount}</TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{record.paymentMethod}</TableCell>
                  <TableCell className="text-right font-black">{formatMoney(record.totalAmount)}</TableCell>
                  <TableCell className="text-right">
                    {record.status === "credit" && !isReadOnly && (
                      <Button size="sm" onClick={() => setCreditToPay(record.id)} className="font-black uppercase tracking-widest text-[10px]">
                        Pay
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filteredRecords.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    No laundry records in this status
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={creditToPay !== null} onOpenChange={(open) => !open && setCreditToPay(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Complete Laundry Payment</DialogTitle>
            <DialogDescription>Choose the actual payment date and method for this credit record.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 sm:grid-cols-2">
            <div className="space-y-1">
              <Label>Payment Date</Label>
              <Input type="date" value={creditPaymentDate} onChange={(event) => setCreditPaymentDate(event.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label>Payment Method</Label>
              <select className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={creditPaymentMethod} onChange={(event) => setCreditPaymentMethod(event.target.value as Exclude<LaundryPaymentMethod, "credit">)}>
                <option value="cash">Cash</option>
                <option value="card">Card</option>
                <option value="mobile-money">Mobile Money</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreditToPay(null)}>Cancel</Button>
            <Button onClick={payCredit}>Save Payment</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
