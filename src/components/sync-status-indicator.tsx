"use client";

import { useEffect, useRef, useState } from "react";
import {
  subscribeToConnectionStatus,
} from "@/app/lib/firebase-sync";
import { exportLighthouseLocalData } from "@/app/lib/local-data-export";
import { cn } from "@/lib/utils";
import { Download, Loader2, Wifi, WifiOff } from "lucide-react";

export function SyncStatusIndicator() {
  const [connected, setConnected] = useState(true);
  const [exportState, setExportState] = useState<"idle" | "exporting" | "saved" | "downloaded" | "error">("idle");
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const applyConnectionState = (syncConnected: boolean) => setConnected(syncConnected);
    const onOnline = () => setConnected(false);
    const onOffline = () => setConnected(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const unsubscribe = subscribeToConnectionStatus(applyConnectionState);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      unsubscribe();
      if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    };
  }, []);

  const exportData = async () => {
    if (exportState === "exporting") return;
    setExportState("exporting");

    try {
      const result = await exportLighthouseLocalData();
      if (result === "cancelled") {
        setExportState("idle");
        return;
      }
      setExportState(result);
    } catch (error) {
      console.error("Lighthouse local data export failed", error);
      setExportState("error");
    }

    if (resetTimerRef.current !== null) window.clearTimeout(resetTimerRef.current);
    resetTimerRef.current = window.setTimeout(() => setExportState("idle"), 3500);
  };

  const exportLabel = exportState === "exporting"
    ? "Exporting..."
    : exportState === "saved"
      ? "Saved"
      : exportState === "downloaded"
        ? "Downloaded"
        : exportState === "error"
          ? "Try Again"
          : "Export Data";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        className={cn(
          "flex items-center gap-2 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-widest transition-colors",
          connected
            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
            : "bg-red-50 text-red-700 border border-red-200",
        )}
      >
        {connected ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        {connected ? "Synced" : "Not Synced"}
      </div>
      <button
        type="button"
        onClick={exportData}
        disabled={exportState === "exporting"}
        className="flex items-center gap-2 rounded-full border border-slate-300 bg-white px-3 py-1.5 text-[10px] font-black uppercase tracking-widest text-slate-700 transition-colors hover:border-primary hover:text-primary disabled:cursor-wait disabled:opacity-60"
        title="Save all business data stored on this device"
      >
        {exportState === "exporting" ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Download className="h-3 w-3" />
        )}
        {exportLabel}
      </button>
    </div>
  );
}
