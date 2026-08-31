"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getSyncDiagnostics,
  getRemoteRecordCounts,
  hydrateDefaultAppStateFromFirebase,
  subscribeToConnectionStatus,
  wipeStorageCategory,
  type SyncDiagnostics,
} from "@/app/lib/firebase-sync";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudOff,
  Database,
  HardDrive,
  Loader2,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";

const FRIENDLY_NAMES: Record<string, string> = {
  "lighthouse-cashier-state": "Bookings (Cashier)",
  "lighthouse-kitchen-state": "Kitchen POS",
  "lighthouse-barista-state": "Barista POS",
  "lighthouse-company-stock": "Company Stock",
  "lighthouse-inventory-items": "Inventory Items",
  "lighthouse-main-store-items": "Main Store Items",
  "lighthouse-stock-logic": "Stock Logic Rules",
  "lighthouse-store-movements": "Store Movements",
  "lighthouse-store-usage": "Store Usage",
  "lighthouse-cancelled-tickets": "Cancelled Tickets",
  "lighthouse-rooms-state": "Room Status",
  "lighthouse-fnb-beverage-cost": "Beverage Cost",
  "lighthouse-fnb-recipe-cost": "Recipe Cost",
  "lighthouse-fnb-stock-sales": "Stock Sales",
  "lighthouse-settings": "App Settings",
  "lighthouse-hardware-settings": "Hardware Settings",
  "lighthouse-website-bookings": "Website Bookings",
  "lighthouse-expenses": "Expenses",
  "lighthouse-login-profiles": "Login Profiles",
  "lighthouse-kitchen-purchase-session": "Kitchen Purchase Session",
  "lighthouse-kitchen-purchase-history": "Kitchen Purchase History",
  "lighthouse-kitchen-daily-stock-session": "Kitchen Daily Stock Session",
  "lighthouse-kitchen-daily-stock-history": "Kitchen Daily Stock History",
  "lighthouse-barista-purchase-session": "Barista Purchase Session",
  "lighthouse-barista-purchase-history": "Barista Purchase History",
  "lighthouse-barista-daily-stock-session": "Barista Daily Stock Session",
  "lighthouse-barista-daily-stock-history": "Barista Daily Stock History",
};

export default function SyncVerificationPage() {
  const { confirm, dialog } = useConfirmDialog();
  const [diagnostics, setDiagnostics] = useState<SyncDiagnostics | null>(null);
  const [remoteCounts, setRemoteCounts] = useState<Record<string, number> | null>(null);
  const [connected, setConnected] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const [cleaning, setCleaning] = useState(false);

  const refreshDiagnostics = useCallback(() => {
    setDiagnostics(getSyncDiagnostics());
  }, []);

  const fetchRemoteCounts = useCallback(async () => {
    setLoadingRemote(true);
    try {
      const counts = await getRemoteRecordCounts();
      setRemoteCounts(counts);
    } catch {
      toast({ title: "Failed to fetch remote counts", variant: "destructive" });
    } finally {
      setLoadingRemote(false);
    }
  }, []);

  const forceResync = useCallback(async () => {
    setSyncing(true);
    try {
      await hydrateDefaultAppStateFromFirebase();
      refreshDiagnostics();
      await fetchRemoteCounts();
      toast({ title: "Sync complete", description: "All data has been re-synced with Firebase." });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [fetchRemoteCounts, refreshDiagnostics]);

  const handleWipe = useCallback(async (
    keys: string[],
    title: string,
    description: string
  ) => {
    const approved = await confirm({
      title,
      description,
      actionLabel: "Clear Data",
    });

    if (!approved) return;

    setCleaning(true);
    try {
      await Promise.all(keys.map(key => wipeStorageCategory(key)));
      refreshDiagnostics();
      await fetchRemoteCounts();
      toast({
        title: "Sanitization complete",
        description: `Successfully wiped ${keys.length} data categories.`
      });
    } catch {
      toast({ title: "Sanitization failed", variant: "destructive" });
    } finally {
      setCleaning(false);
    }
  }, [confirm, fetchRemoteCounts, refreshDiagnostics]);

  useEffect(() => {
    refreshDiagnostics();
    void fetchRemoteCounts();
    return subscribeToConnectionStatus(setConnected);
  }, [fetchRemoteCounts, refreshDiagnostics]);

  const lastGlobalSync = diagnostics
    ? Math.max(...diagnostics.keys.map((k) => k.lastSyncedAt ?? 0))
    : 0;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-black tracking-tight uppercase">Sync Verification</h1>
        <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
          Firebase real-time synchronization status and diagnostics
        </p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className={connected ? "border-emerald-200 bg-emerald-50/50" : "border-red-200 bg-red-50/50"}>
          <CardContent className="p-5 flex items-center gap-4">
            <div
              className={`w-12 h-12 rounded-xl flex items-center justify-center shadow-lg ${
                connected
                  ? "bg-emerald-500 text-white shadow-emerald-500/20"
                  : "bg-red-500 text-white shadow-red-500/20"
              }`}
            >
              {connected ? <Cloud className="w-6 h-6" /> : <CloudOff className="w-6 h-6" />}
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Connection
              </p>
              <p className="text-xl font-black">{connected ? "Connected" : "Disconnected"}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-blue-200 bg-blue-50/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500 text-white flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Synced Keys
              </p>
              <p className="text-xl font-black">{diagnostics?.keys.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-purple-200 bg-purple-50/50">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500 text-white flex items-center justify-center shadow-lg shadow-purple-500/20">
              <HardDrive className="w-6 h-6" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                Last Sync
              </p>
              <p className="text-xl font-black">
                {lastGlobalSync > 0
                  ? new Date(lastGlobalSync).toLocaleTimeString()
                  : "Pending"}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-2">
        <Button
          onClick={forceResync}
          disabled={syncing}
          className="h-11 font-black uppercase text-[10px] tracking-widest"
        >
          {syncing ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="w-4 h-4 mr-2" />
          )}
          {syncing ? "Syncing…" : "Force Re-Sync"}
        </Button>
        <Button
          variant="outline"
          onClick={() => {
            refreshDiagnostics();
            void fetchRemoteCounts();
          }}
          disabled={loadingRemote}
          className="h-11 font-black uppercase text-[10px] tracking-widest"
        >
          {loadingRemote ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Database className="w-4 h-4 mr-2" />
          )}
          Refresh Counts
        </Button>
      </div>

      {dialog}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="border-red-100 bg-red-50/20">
          <CardHeader>
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <CardTitle className="text-lg font-black uppercase tracking-tight text-red-700">
                Data Sanitization
              </CardTitle>
            </div>
            <CardDescription className="text-red-600/70 font-medium">
              Destructive actions to remove fake or test data from Firebase and local storage.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-red-100 shadow-sm">
              <div>
                <p className="font-black text-sm uppercase tracking-tight">Clear Transactions</p>
                <p className="text-xs text-muted-foreground font-medium">Wipe Bookings, Kitchen, and Barista tickets.</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={cleaning}
                onClick={() => handleWipe(
                  ["lighthouse-cashier-state", "lighthouse-kitchen-state", "lighthouse-barista-state", "lighthouse-cancelled-tickets"],
                  "Clear All Transactions",
                  "This will remove all bookings, kitchen orders, and payments. This action cannot be undone."
                )}
                className="font-black text-[10px] uppercase tracking-widest px-4"
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Clear
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-red-100 shadow-sm">
              <div>
                <p className="font-black text-sm uppercase tracking-tight">Reset Room Status</p>
                <p className="text-xs text-muted-foreground font-medium">Set all rooms back to 'Available'.</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                disabled={cleaning}
                onClick={() => handleWipe(
                  ["lighthouse-rooms-state"],
                  "Reset All Rooms",
                  "This will mark all hotel rooms as Available. Combined with clearing transactions, this starts guest management from fresh."
                )}
                className="font-black text-[10px] uppercase tracking-widest px-4 text-red-600 border-red-200 hover:bg-red-50"
              >
                <RefreshCw className="w-3 h-3 mr-2" />
                Reset
              </Button>
            </div>

            <div className="flex items-center justify-between p-4 bg-white rounded-xl border border-red-100 shadow-sm">
              <div>
                <p className="font-black text-sm uppercase tracking-tight">Hard Database Reset</p>
                <p className="text-xs text-muted-foreground font-medium">Wipe EVERYTHING and restart from defaults.</p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={cleaning}
                onClick={() => handleWipe(
                  [
                    "lighthouse-cashier-state", "lighthouse-kitchen-state", "lighthouse-barista-state",
                    "lighthouse-company-stock", "lighthouse-inventory-items", "lighthouse-main-store-items",
                    "lighthouse-stock-logic", "lighthouse-store-movements", "lighthouse-store-usage",
                    "lighthouse-cancelled-tickets", "lighthouse-rooms-state", "lighthouse-fnb-beverage-cost",
                    "lighthouse-fnb-recipe-cost", "lighthouse-fnb-stock-sales", "lighthouse-settings",
                    "lighthouse-hardware-settings", "lighthouse-website-bookings", "lighthouse-expenses", "lighthouse-login-profiles",
                    "lighthouse-kitchen-purchase-session", "lighthouse-kitchen-purchase-history",
                    "lighthouse-kitchen-daily-stock-session", "lighthouse-kitchen-daily-stock-history",
                    "lighthouse-barista-purchase-session", "lighthouse-barista-purchase-history",
                    "lighthouse-barista-daily-stock-session", "lighthouse-barista-daily-stock-history"
                  ],
                  "FULL DATABASE WIPE",
                  "DANGER: This will delete ALL data including inventory, configuration, and settings. The system will be completely reset to factory defaults."
                )}
                className="font-black text-[10px] uppercase tracking-widest px-4"
              >
                <Trash2 className="w-3 h-3 mr-2" />
                Factory Reset
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="shadow-sm border-none bg-white lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-lg font-black uppercase tracking-tight">
            Per-Key Sync Status
          </CardTitle>
          <CardDescription>
            Local and remote record counts for each synced data key
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">
                  Data Key
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-center">
                  Local Records
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-center">
                  Remote Records
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-center">
                  Status
                </TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-right">
                  Last Synced
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {diagnostics?.keys.map((entry) => {
                const remoteCount = remoteCounts?.[entry.key] ?? null;
                const isMatched =
                  remoteCount !== null && remoteCount >= 0 && remoteCount === entry.localRecordCount;
                const isMismatched =
                  remoteCount !== null && remoteCount >= 0 && remoteCount !== entry.localRecordCount;

                return (
                  <TableRow key={entry.key}>
                    <TableCell className="font-bold">
                      {FRIENDLY_NAMES[entry.key] ?? entry.key}
                    </TableCell>
                    <TableCell className="text-center font-black text-lg">
                      {entry.localRecordCount}
                    </TableCell>
                    <TableCell className="text-center font-black text-lg">
                      {remoteCount === null ? (
                        <Loader2 className="w-4 h-4 animate-spin mx-auto text-muted-foreground" />
                      ) : remoteCount < 0 ? (
                        <span className="text-red-500 text-xs font-bold">Error</span>
                      ) : (
                        remoteCount
                      )}
                    </TableCell>
                    <TableCell className="text-center">
                      {isMatched ? (
                        <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100">
                          <CheckCircle2 className="w-3 h-3 mr-1" />
                          Synced
                        </Badge>
                      ) : isMismatched ? (
                        <Badge className="bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100">
                          Mismatch
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">
                          Checking…
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-bold">
                      {entry.lastSyncedAt
                        ? new Date(entry.lastSyncedAt).toLocaleTimeString()
                        : "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
    </div>
  );
}
