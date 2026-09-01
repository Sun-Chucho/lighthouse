"use client";

import { useEffect, useMemo, useState } from "react";
import { BellRing, Check, Clock3, MapPin, Phone, X } from "lucide-react";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { readJson, writeJson } from "@/app/lib/storage";
import {
  STORAGE_WEBSITE_MENU_ORDERS,
  type MenuDepartment,
  type WebsiteMenuOrder,
  type WebsiteMenuOrderStatus,
} from "@/app/lib/menu-orders";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

export function WebsiteMenuOrderSidebar({ department }: { department: MenuDepartment }) {
  const [orders, setOrders] = useState<WebsiteMenuOrder[]>([]);
  const [savingId, setSavingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const applyOrders = (value?: WebsiteMenuOrder[] | null) => {
      if (cancelled) return;
      const current = value ?? readJson<WebsiteMenuOrder[]>(STORAGE_WEBSITE_MENU_ORDERS) ?? [];
      setOrders(Array.isArray(current) ? current : []);
    };
    applyOrders();
    void hydrateStorageKeyFromFirebase(STORAGE_WEBSITE_MENU_ORDERS).finally(() => applyOrders());
    const unsubscribe = subscribeToSyncedStorageKey<WebsiteMenuOrder[]>(STORAGE_WEBSITE_MENU_ORDERS, applyOrders);
    return () => { cancelled = true; unsubscribe(); };
  }, []);

  const visibleOrders = useMemo(() => orders
    .filter((order) => order.department === department && order.status !== "rejected" && order.status !== "completed")
    .sort((a, b) => b.createdAt - a.createdAt), [department, orders]);
  const newCount = visibleOrders.filter((order) => order.status === "new").length;

  const setStatus = async (id: string, status: WebsiteMenuOrderStatus) => {
    setSavingId(id);
    const now = Date.now();
    const current = readJson<WebsiteMenuOrder[]>(STORAGE_WEBSITE_MENU_ORDERS) ?? orders;
    const next = current.map((order) => order.id === id ? { ...order, status, updatedAt: now } : order);
    setOrders(next);
    try { await writeJson(STORAGE_WEBSITE_MENU_ORDERS, next); } finally { setSavingId(""); }
  };

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" className="relative h-10 gap-2 font-black uppercase tracking-widest text-[10px]">
          <BellRing className="h-4 w-4" /> Web Orders
          {newCount > 0 && <Badge className="ml-1 min-w-5 justify-center bg-red-600 px-1.5 text-white">{newCount}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="text-2xl font-black tracking-tight">Website orders</SheetTitle>
          <SheetDescription>Live requests sent to the {department === "bar" ? "bar" : "kitchen"} from the public menu.</SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          {visibleOrders.map((order) => (
            <article key={order.id} className="rounded-2xl border bg-card p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div><p className="font-black">{order.reference}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(order.createdAt).toLocaleString()}</p></div>
                <Badge variant={order.status === "new" ? "destructive" : "secondary"} className="uppercase text-[9px] tracking-widest">{order.status}</Badge>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <p className="font-black">{order.customerName}</p>
                <a href={`tel:${order.phone}`} className="flex items-center gap-2 text-muted-foreground"><Phone className="h-3.5 w-3.5" />{order.phone}</a>
                <p className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{order.destination}</p>
              </div>
              <div className="my-4 space-y-2 rounded-xl bg-muted/35 p-3">
                {order.lines.map((line) => <div key={line.itemId} className="flex justify-between gap-3 text-xs"><span>{line.qty} × {line.name}</span><strong>TSh {(line.price * line.qty).toLocaleString()}</strong></div>)}
                <div className="flex justify-between border-t pt-2 text-sm font-black"><span>Total</span><span>TSh {order.total.toLocaleString()}</span></div>
              </div>
              {order.note && <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">{order.note}</p>}
              <div className="grid grid-cols-2 gap-2">
                {order.status === "new" ? <>
                  <Button onClick={() => void setStatus(order.id, "accepted")} disabled={savingId === order.id} className="gap-2 bg-green-600 hover:bg-green-700"><Check className="h-4 w-4" /> Accept</Button>
                  <Button onClick={() => void setStatus(order.id, "rejected")} disabled={savingId === order.id} variant="destructive" className="gap-2"><X className="h-4 w-4" /> Reject</Button>
                </> : <Button onClick={() => void setStatus(order.id, "completed")} disabled={savingId === order.id} className="col-span-2 gap-2"><Clock3 className="h-4 w-4" /> Mark completed</Button>}
              </div>
            </article>
          ))}
          {visibleOrders.length === 0 && <div className="rounded-2xl border border-dashed p-10 text-center text-sm text-muted-foreground">No active website order requests.</div>}
        </div>
      </SheetContent>
    </Sheet>
  );
}
