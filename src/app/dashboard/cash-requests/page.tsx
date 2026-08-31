"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ExpenseRecord,
  getExpenseDepartmentLabel,
  STORAGE_EXPENSES,
} from "@/app/lib/expenses";
import { readStoredRole } from "@/app/lib/auth";
import { Role } from "@/app/lib/mock-data";
import { readJson, writeJson } from "@/app/lib/storage";
import { subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, HandCoins } from "lucide-react";
import { toast } from "@/hooks/use-toast";

function formatDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function readExpenseSnapshot() {
  const saved = readJson<ExpenseRecord[]>(STORAGE_EXPENSES);
  return Array.isArray(saved) ? saved : [];
}

export default function CashRequestsPage() {
  const [role, setRole] = useState<Role>("cashier");
  const [expenses, setExpenses] = useState<ExpenseRecord[]>([]);

  useEffect(() => {
    setRole(readStoredRole() ?? "cashier");

    const refreshExpenses = () => {
      setExpenses(readExpenseSnapshot());
    };

    refreshExpenses();
    return subscribeToSyncedStorageKey(STORAGE_EXPENSES, refreshExpenses);
  }, []);

  const cashRequests = useMemo(
    () =>
      expenses
        .filter((expense) => expense.createdBy === "manager")
        .sort((a, b) => b.createdAt - a.createdAt),
    [expenses],
  );
  const approvedRequests = cashRequests.filter((expense) => expense.payoutStatus !== "paid-out");
  const paidOutRequests = cashRequests.filter((expense) => expense.payoutStatus === "paid-out");
  const approvedTotal = approvedRequests.reduce((sum, expense) => sum + expense.amount, 0);
  const paidOutTotal = paidOutRequests.reduce((sum, expense) => sum + expense.amount, 0);

  const markPaidOut = (requestId: string) => {
    const paidOutAt = Date.now();
    const currentExpenses = readExpenseSnapshot();
    const nextExpenses = currentExpenses.map((expense) =>
      expense.id === requestId
        ? {
            ...expense,
            payoutStatus: "paid-out" as const,
            paidOutAt,
            paidOutBy: role,
            updatedAt: paidOutAt,
          }
        : expense,
    );

    setExpenses(nextExpenses);
    writeJson(STORAGE_EXPENSES, nextExpenses);
    toast({
      title: "Cash request paid out",
      description: "The request has been moved to paid-out history.",
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-black uppercase tracking-tight">Cash Requests</h1>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Manager-recorded expenses ready for receptionist payout
          </p>
        </div>
        <Badge variant="outline" className="w-fit px-3 py-1 font-black uppercase tracking-widest">
          Pending TSh {approvedTotal.toLocaleString()}
        </Badge>
      </header>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Approved Requests</p>
              <p className="mt-2 text-2xl font-black">TSh {approvedTotal.toLocaleString()}</p>
            </div>
            <HandCoins className="h-8 w-8 text-primary" />
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Paid Out</p>
              <p className="mt-2 text-2xl font-black">TSh {paidOutTotal.toLocaleString()}</p>
            </div>
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-black uppercase tracking-tight">Approved Cash Requests</CardTitle>
          <CardDescription>{approvedRequests.length} request{approvedRequests.length === 1 ? "" : "s"} waiting for payout.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Date</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Department</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Request</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Notes</TableHead>
                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Amount</TableHead>
                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-bold">{formatDate(request.createdAt)}</TableCell>
                  <TableCell className="font-bold">{getExpenseDepartmentLabel(request.department)}</TableCell>
                  <TableCell className="font-bold">{request.title}</TableCell>
                  <TableCell className="max-w-xs font-medium text-muted-foreground">{request.notes ?? "-"}</TableCell>
                  <TableCell className="text-right font-black">TSh {request.amount.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => markPaidOut(request.id)} className="font-black uppercase tracking-widest text-[10px]">
                      Mark Paid Out
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {approvedRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    No approved cash requests waiting for payout
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-sm">
        <CardHeader className="border-b">
          <CardTitle className="text-lg font-black uppercase tracking-tight">Paid-Out History</CardTitle>
          <CardDescription>{paidOutRequests.length} completed payout{paidOutRequests.length === 1 ? "" : "s"}.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Paid Out</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Department</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Request</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest">Paid By</TableHead>
                <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paidOutRequests.map((request) => (
                <TableRow key={request.id}>
                  <TableCell className="font-bold">{request.paidOutAt ? formatDate(request.paidOutAt) : "-"}</TableCell>
                  <TableCell className="font-bold">{getExpenseDepartmentLabel(request.department)}</TableCell>
                  <TableCell className="font-bold">{request.title}</TableCell>
                  <TableCell className="font-bold capitalize">{request.paidOutBy ?? "-"}</TableCell>
                  <TableCell className="text-right font-black">TSh {request.amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {paidOutRequests.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                    No paid-out cash requests yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
