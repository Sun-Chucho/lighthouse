"use client";

import { useEffect, useState } from "react";
import { readJson, readPosState, STORAGE_BARISTA_STATE, STORAGE_KITCHEN_STATE, writeJson, writePosState } from "@/app/lib/storage";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import {
  KITCHEN_CATEGORY_LABELS,
  KITCHEN_CATEGORY_OPTIONS,
  KitchenMenuCategory,
  KitchenMenuItem,
  mergeKitchenMenuItems,
} from "@/app/lib/kitchen-menu";
import { useIsDirector } from "@/hooks/use-is-director";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { readStoredRole } from "@/app/lib/auth";
import { readActiveSessionUsername } from "@/app/lib/login-profiles";
import { InventoryItem, Role } from "@/app/lib/mock-data";
import {
  getStoreItemLabel,
  MainStoreItem,
  normalizeStockName,
  STORAGE_INVENTORY_ITEMS,
  STORAGE_MAIN_STORE_ITEMS,
} from "@/app/lib/inventory-transfer";

type BaristaCategory =
  | "espresso"
  | "coffee"
  | "tea"
  | "beer"
  | "wine"
  | "spirits"
  | "cider"
  | "soft-drinks"
  | "water-juice"
  | "energy-drinks"
  | "malt"
  | "cold"
  | "snacks";

interface BaristaMenuItem {
  id: string;
  name: string;
  price: number;
  category: BaristaCategory;
  prepMinutes: number;
  updatedAt?: number;
  deletedAt?: number;
  sourceStoreItemId?: string;
}

interface QueueTicket {
  id: string;
}

interface PaymentRecord {
  id: string;
}

interface MenuAuditEntry {
  id: string;
  menu: "kitchen" | "barista";
  itemId: string;
  itemName: string;
  changedAt: number;
  changedBy: string;
  changes: string[];
}

const KITCHEN_LEGACY = {
  tickets: "lighthouse-kitchen-tickets",
  seq: "lighthouse-kitchen-seq",
  payments: "lighthouse-kitchen-payments",
  menu: "lighthouse-kitchen-menu",
  defaultSeq: 1,
} as const;

const BARISTA_LEGACY = {
  tickets: "lighthouse-barista-orders",
  seq: "lighthouse-barista-seq",
  payments: "lighthouse-barista-payments",
  menu: "lighthouse-barista-menu",
  defaultSeq: 1,
} as const;

const STORAGE_MENU_AUDIT = "lighthouse-menu-audit-trail";

function normalizeBaristaMenuLink(value: string) {
  return normalizeStockName(value.replace(/\s*\(?TOTS?\)?$/i, "").trim());
}

function getEditedBaristaStockLabel(
  item: { name: string; size?: string },
  previousMenuName: string,
  nextMenuName: string,
) {
  const nextIsTotItem = /\s*\(?TOTS?\)?$/i.test(nextMenuName);
  const nextStockLabel = nextMenuName.replace(/\s*\(?TOTS?\)?$/i, "").trim();
  const currentLabel = item.size ? `${item.name} ${item.size}` : item.name;
  const nextTarget = normalizeBaristaMenuLink(nextStockLabel);
  if (
    nextTarget === normalizeBaristaMenuLink(previousMenuName)
    || nextTarget === normalizeBaristaMenuLink(currentLabel)
  ) {
    return { name: item.name, size: item.size ?? "" };
  }

  const currentSize = item.size?.trim() ?? "";
  if (nextIsTotItem && currentSize) return { name: nextStockLabel, size: currentSize };
  if (currentSize) {
    const nextWords = nextStockLabel.split(/\s+/);
    const sizeWords = currentSize.split(/\s+/);
    const sizeSuffix = nextWords.slice(-sizeWords.length).join(" ");
    if (normalizeStockName(sizeSuffix) === normalizeStockName(currentSize)) {
      const baseName = nextWords.slice(0, -sizeWords.length).join(" ").trim();
      if (baseName) return { name: baseName, size: currentSize };
    }
  }

  const structuredSize = nextStockLabel.match(
    /^(.+?)\s+((?:\d+(?:[.,]\d+)?)\s*(?:ml|cl|l|litres?|liters?|g|kg))$/i,
  );
  return structuredSize
    ? { name: structuredSize[1].trim(), size: structuredSize[2].trim() }
    : { name: nextStockLabel, size: "" };
}

function formatAuditDate(value: number) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MenuCreateView() {
  const isDirector = useIsDirector();
  const { confirm, dialog } = useConfirmDialog();
  const [tab, setTab] = useState<"kitchen" | "barista">("kitchen");
  const [sessionRole, setSessionRole] = useState<Role | null>(null);
  const [changedBy, setChangedBy] = useState("manager");

  const [kitchenMenuItems, setKitchenMenuItems] = useState<KitchenMenuItem[]>([]);
  const [kitchenName, setKitchenName] = useState("");
  const [kitchenPrice, setKitchenPrice] = useState("");
  const [kitchenPrepMinutes, setKitchenPrepMinutes] = useState("15");
  const [kitchenCategory, setKitchenCategory] = useState<KitchenMenuCategory>("salad");
  const [editingKitchenId, setEditingKitchenId] = useState<string | null>(null);
  const [editingKitchenName, setEditingKitchenName] = useState("");
  const [editingKitchenPrice, setEditingKitchenPrice] = useState("");

  const [baristaMenuItems, setBaristaMenuItems] = useState<BaristaMenuItem[]>([]);
  const [baristaName, setBaristaName] = useState("");
  const [baristaPrice, setBaristaPrice] = useState("");
  const [baristaPrepMinutes, setBaristaPrepMinutes] = useState("10");
  const [baristaCategory, setBaristaCategory] = useState<BaristaCategory>("coffee");
  const [editingBaristaId, setEditingBaristaId] = useState<string | null>(null);
  const [editingBaristaName, setEditingBaristaName] = useState("");
  const [editingBaristaPrice, setEditingBaristaPrice] = useState("");
  const [auditTrail, setAuditTrail] = useState<MenuAuditEntry[]>([]);
  const [saveFeedback, setSaveFeedback] = useState("");

  useEffect(() => {
    let cancelled = false;
    const currentRole = readStoredRole();
    setSessionRole(currentRole);
    setChangedBy(readActiveSessionUsername(currentRole ?? "manager") || currentRole || "manager");

    const applyKitchenSnapshot = () => {
      if (cancelled) return;
      const kitchenSnapshot = readPosState<QueueTicket, PaymentRecord, KitchenMenuItem>(
        STORAGE_KITCHEN_STATE,
        KITCHEN_LEGACY.tickets,
        KITCHEN_LEGACY.seq,
        KITCHEN_LEGACY.payments,
        KITCHEN_LEGACY.menu,
        KITCHEN_LEGACY.defaultSeq,
      );
      const nextKitchenMenuItems = mergeKitchenMenuItems(kitchenSnapshot.menuItems);
      setKitchenMenuItems(nextKitchenMenuItems);
      if (JSON.stringify(nextKitchenMenuItems) !== JSON.stringify(kitchenSnapshot.menuItems)) {
        void writePosState(
          STORAGE_KITCHEN_STATE,
          kitchenSnapshot.tickets,
          kitchenSnapshot.ticketSeq,
          kitchenSnapshot.payments,
          nextKitchenMenuItems,
        );
      }
    };

    const applyBaristaSnapshot = () => {
      if (cancelled) return;
      const baristaSnapshot = readPosState<QueueTicket, PaymentRecord, BaristaMenuItem>(
        STORAGE_BARISTA_STATE,
        BARISTA_LEGACY.tickets,
        BARISTA_LEGACY.seq,
        BARISTA_LEGACY.payments,
        BARISTA_LEGACY.menu,
        BARISTA_LEGACY.defaultSeq,
      );
      setBaristaMenuItems(baristaSnapshot.menuItems.filter((item) => !item.deletedAt));
    };

    const applyAuditSnapshot = () => {
      if (!cancelled) setAuditTrail(readJson<MenuAuditEntry[]>(STORAGE_MENU_AUDIT) ?? []);
    };

    applyKitchenSnapshot();
    applyBaristaSnapshot();
    applyAuditSnapshot();

    const unsubscribeKitchen = subscribeToSyncedStorageKey(STORAGE_KITCHEN_STATE, applyKitchenSnapshot);
    const unsubscribeBarista = subscribeToSyncedStorageKey(STORAGE_BARISTA_STATE, applyBaristaSnapshot);
    const unsubscribeAudit = subscribeToSyncedStorageKey<MenuAuditEntry[]>(STORAGE_MENU_AUDIT, applyAuditSnapshot);

    void Promise.all([
      hydrateStorageKeyFromFirebase(STORAGE_KITCHEN_STATE),
      hydrateStorageKeyFromFirebase(STORAGE_BARISTA_STATE),
      hydrateStorageKeyFromFirebase(STORAGE_MENU_AUDIT),
    ]).finally(() => {
      applyKitchenSnapshot();
      applyBaristaSnapshot();
      applyAuditSnapshot();
    });

    return () => {
      cancelled = true;
      unsubscribeKitchen();
      unsubscribeBarista();
      unsubscribeAudit();
    };
  }, []);

  const saveAuditEntry = (entry: MenuAuditEntry) => {
    const nextAuditTrail = [entry, ...auditTrail].slice(0, 100);
    setAuditTrail(nextAuditTrail);
    writeJson(STORAGE_MENU_AUDIT, nextAuditTrail);
  };

  const persistKitchenMenu = (nextMenuItems: KitchenMenuItem[]) => {
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, KitchenMenuItem>(
      STORAGE_KITCHEN_STATE,
      KITCHEN_LEGACY.tickets,
      KITCHEN_LEGACY.seq,
      KITCHEN_LEGACY.payments,
      KITCHEN_LEGACY.menu,
      KITCHEN_LEGACY.defaultSeq,
    );
    return writePosState(
      STORAGE_KITCHEN_STATE,
      latestSnapshot.tickets,
      latestSnapshot.ticketSeq,
      latestSnapshot.payments,
      nextMenuItems,
    );
  };

  const persistBaristaMenu = (nextMenuItems: BaristaMenuItem[]) => {
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, BaristaMenuItem>(
      STORAGE_BARISTA_STATE,
      BARISTA_LEGACY.tickets,
      BARISTA_LEGACY.seq,
      BARISTA_LEGACY.payments,
      BARISTA_LEGACY.menu,
      BARISTA_LEGACY.defaultSeq,
    );
    return writePosState(
      STORAGE_BARISTA_STATE,
      latestSnapshot.tickets,
      latestSnapshot.ticketSeq,
      latestSnapshot.payments,
      nextMenuItems,
    );
  };

  const reportMenuSync = (label: string, synced: boolean | undefined) => {
    setSaveFeedback(
      synced === false
        ? `${label} saved on this device. Cloud sync is pending and will retry when the connection recovers.`
        : `${label} saved. The live POS menu has been updated.`,
    );
  };

  const updateLinkedBaristaInventory = (
    previousItem: BaristaMenuItem,
    nextName: string,
    nextPrice: number,
    updatedAt: number,
  ) => {
    const previousTarget = normalizeBaristaMenuLink(previousItem.name);
    const nameChanged = previousItem.name.trim() !== nextName;
    const writes: Array<Promise<boolean> | undefined> = [];
    const storedItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
    const linkedStoreItem = storedItems.find(
      (item) => item.lane === "barista" && !item.deletedAt && item.id === previousItem.sourceStoreItemId,
    ) ?? storedItems.find(
      (item) => item.lane === "barista" && !item.deletedAt && normalizeBaristaMenuLink(getStoreItemLabel(item)) === previousTarget,
    ) ?? (/\s*\(?TOTS?\)?$/i.test(previousItem.name)
      ? storedItems.find(
          (item) => item.lane === "barista" && !item.deletedAt && normalizeBaristaMenuLink(item.name) === previousTarget,
        )
      : undefined);
    const nextStoreLabel = linkedStoreItem
      ? getEditedBaristaStockLabel(linkedStoreItem, previousItem.name, nextName)
      : null;
    const nextStoreItems = storedItems.map((item) =>
      item.id === linkedStoreItem?.id
        ? {
            ...item,
            ...(nameChanged && nextStoreLabel ? nextStoreLabel : {}),
            sellingPrice: nextPrice,
            updatedAt,
          }
        : item,
    );
    if (JSON.stringify(nextStoreItems) !== JSON.stringify(storedItems)) {
      writes.push(writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems));
    }

    const inventoryItems = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
    const linkedInventoryIndex = inventoryItems.findIndex((inventoryItem) => {
      const labels = [
        inventoryItem.name,
        inventoryItem.size ? `${inventoryItem.name} ${inventoryItem.size}` : inventoryItem.name,
      ];
      return inventoryItem.category.trim().toLowerCase() !== "kitchen"
        && inventoryItem.status !== "INACTIVE"
        && (
          labels.some((label) => normalizeBaristaMenuLink(label) === previousTarget)
          || (/\s*\(?TOTS?\)?$/i.test(previousItem.name)
            && normalizeBaristaMenuLink(inventoryItem.name) === previousTarget)
        );
    });
    const linkedInventoryItem = linkedInventoryIndex >= 0 ? inventoryItems[linkedInventoryIndex] : null;
    const nextInventoryLabel = linkedInventoryItem
      ? getEditedBaristaStockLabel(linkedInventoryItem, previousItem.name, nextName)
      : null;
    const nextInventoryItems = inventoryItems.map((inventoryItem, index) =>
      index === linkedInventoryIndex
        ? {
            ...inventoryItem,
            ...(nameChanged && nextInventoryLabel ? nextInventoryLabel : {}),
            sellingPrice: nextPrice,
            price: nextPrice,
            updatedAt,
          }
        : inventoryItem,
    );
    if (JSON.stringify(nextInventoryItems) !== JSON.stringify(inventoryItems)) {
      writes.push(writeJson(STORAGE_INVENTORY_ITEMS, nextInventoryItems));
    }

    return { writes, sourceStoreItemId: linkedStoreItem?.id };
  };

  const addKitchenMenuItem = async () => {
    if (isDirector) return;
    const price = Number(kitchenPrice);
    const prepMinutes = Number(kitchenPrepMinutes);
    if (!kitchenName.trim() || Number.isNaN(price) || price <= 0 || Number.isNaN(prepMinutes) || prepMinutes <= 0) return;
    const approved = await confirm({
      title: "Create Kitchen Menu Item",
      description: `Are you sure you want to add ${kitchenName.trim()} at TSh ${price.toLocaleString()}?`,
      actionLabel: "Add Menu Item",
    });
    if (!approved) return;

    const updatedAt = Date.now();
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, KitchenMenuItem>(
      STORAGE_KITCHEN_STATE,
      KITCHEN_LEGACY.tickets,
      KITCHEN_LEGACY.seq,
      KITCHEN_LEGACY.payments,
      KITCHEN_LEGACY.menu,
      KITCHEN_LEGACY.defaultSeq,
    );
    const nextMenuItems = [
      {
        id: `km-${updatedAt}`,
        name: kitchenName.trim(),
        price,
        prepMinutes,
        category: kitchenCategory,
        updatedAt,
      },
      ...latestSnapshot.menuItems,
    ];
    setKitchenMenuItems(nextMenuItems);
    const syncResult = persistKitchenMenu(nextMenuItems);
    setKitchenName("");
    setKitchenPrice("");
    setKitchenPrepMinutes("15");
    setKitchenCategory("salad");
    reportMenuSync("Kitchen menu item", await syncResult);
  };

  const startKitchenEdit = (item: KitchenMenuItem) => {
    setEditingKitchenId(item.id);
    setEditingKitchenName(item.name);
    setEditingKitchenPrice(String(item.price));
  };

  const cancelKitchenEdit = () => {
    setEditingKitchenId(null);
    setEditingKitchenName("");
    setEditingKitchenPrice("");
  };

  const saveKitchenEdit = async (item: KitchenMenuItem) => {
    if (isDirector) return;
    const nextName = editingKitchenName.trim();
    const nextPrice = Number(editingKitchenPrice);
    if (!nextName || Number.isNaN(nextPrice) || nextPrice <= 0) return;

    const changes = [
      item.name !== nextName ? `Name: ${item.name} -> ${nextName}` : "",
      item.price !== nextPrice ? `Price: TSh ${item.price.toLocaleString()} -> TSh ${nextPrice.toLocaleString()}` : "",
    ].filter(Boolean);
    if (changes.length === 0) {
      cancelKitchenEdit();
      return;
    }

    const approved = await confirm({
      title: "Update Kitchen Menu Item",
      description: `Save changes to ${item.name}?`,
      actionLabel: "Save Changes",
    });
    if (!approved) return;

    const updatedAt = Date.now();
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, KitchenMenuItem>(
      STORAGE_KITCHEN_STATE,
      KITCHEN_LEGACY.tickets,
      KITCHEN_LEGACY.seq,
      KITCHEN_LEGACY.payments,
      KITCHEN_LEGACY.menu,
      KITCHEN_LEGACY.defaultSeq,
    );
    const nextMenuItems = latestSnapshot.menuItems.map((entry) =>
      entry.id === item.id ? { ...entry, name: nextName, price: nextPrice, updatedAt } : entry,
    );
    setKitchenMenuItems(nextMenuItems);
    const syncResult = persistKitchenMenu(nextMenuItems);
    saveAuditEntry({
      id: `audit-${updatedAt}`,
      menu: "kitchen",
      itemId: item.id,
      itemName: nextName,
      changedAt: updatedAt,
      changedBy,
      changes,
    });
    cancelKitchenEdit();
    reportMenuSync("Kitchen menu item", await syncResult);
  };

  const addBaristaMenuItem = async () => {
    if (isDirector) return;
    const price = Number(baristaPrice);
    const prepMinutes = Number(baristaPrepMinutes);
    if (!baristaName.trim() || Number.isNaN(price) || price <= 0 || Number.isNaN(prepMinutes) || prepMinutes <= 0) return;
    const approved = await confirm({
      title: "Create Barista Menu Item",
      description: `Are you sure you want to add ${baristaName.trim()} at TSh ${price.toLocaleString()}?`,
      actionLabel: "Add Menu Item",
    });
    if (!approved) return;

    const updatedAt = Date.now();
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, BaristaMenuItem>(
      STORAGE_BARISTA_STATE,
      BARISTA_LEGACY.tickets,
      BARISTA_LEGACY.seq,
      BARISTA_LEGACY.payments,
      BARISTA_LEGACY.menu,
      BARISTA_LEGACY.defaultSeq,
    );
    const nextMenuItems = [
      {
        id: `bm-${updatedAt}`,
        name: baristaName.trim(),
        price,
        prepMinutes,
        category: baristaCategory,
        updatedAt,
      },
      ...latestSnapshot.menuItems,
    ];
    setBaristaMenuItems(nextMenuItems.filter((item) => !item.deletedAt));
    const syncResult = persistBaristaMenu(nextMenuItems);
    setBaristaName("");
    setBaristaPrice("");
    setBaristaPrepMinutes("10");
    setBaristaCategory("coffee");
    reportMenuSync("Barista menu item", await syncResult);
  };

  const startBaristaEdit = (item: BaristaMenuItem) => {
    setEditingBaristaId(item.id);
    setEditingBaristaName(item.name);
    setEditingBaristaPrice(String(item.price));
  };

  const cancelBaristaEdit = () => {
    setEditingBaristaId(null);
    setEditingBaristaName("");
    setEditingBaristaPrice("");
  };

  const saveBaristaEdit = async (item: BaristaMenuItem) => {
    if (isDirector) return;
    const nextName = editingBaristaName.trim();
    const nextPrice = Number(editingBaristaPrice);
    if (!nextName || Number.isNaN(nextPrice) || nextPrice <= 0) return;

    const changes = [
      item.name !== nextName ? `Name: ${item.name} -> ${nextName}` : "",
      item.price !== nextPrice ? `Price: TSh ${item.price.toLocaleString()} -> TSh ${nextPrice.toLocaleString()}` : "",
    ].filter(Boolean);
    if (changes.length === 0) {
      cancelBaristaEdit();
      return;
    }

    const approved = await confirm({
      title: "Update Barista Menu Item",
      description: `Save changes to ${item.name}?`,
      actionLabel: "Save Changes",
    });
    if (!approved) return;

    const updatedAt = Date.now();
    const latestSnapshot = readPosState<QueueTicket, PaymentRecord, BaristaMenuItem>(
      STORAGE_BARISTA_STATE,
      BARISTA_LEGACY.tickets,
      BARISTA_LEGACY.seq,
      BARISTA_LEGACY.payments,
      BARISTA_LEGACY.menu,
      BARISTA_LEGACY.defaultSeq,
    );
    const latestItem = latestSnapshot.menuItems.find((entry) => entry.id === item.id && !entry.deletedAt);
    if (!latestItem) {
      cancelBaristaEdit();
      setSaveFeedback("This Barista menu item is no longer active. Refresh and choose an active item before saving.");
      return;
    }
    const linkedUpdates = updateLinkedBaristaInventory(latestItem, nextName, nextPrice, updatedAt);
    const nextMenuItems = latestSnapshot.menuItems.map((entry) =>
      entry.id === item.id
        ? {
            ...entry,
            name: nextName,
            price: nextPrice,
            sourceStoreItemId: linkedUpdates.sourceStoreItemId ?? entry.sourceStoreItemId,
            updatedAt,
          }
        : entry,
    );
    setBaristaMenuItems(nextMenuItems.filter((entry) => !entry.deletedAt));
    const writes = [persistBaristaMenu(nextMenuItems), ...linkedUpdates.writes]
      .filter((write): write is Promise<boolean> => Boolean(write));
    saveAuditEntry({
      id: `audit-${updatedAt}`,
      menu: "barista",
      itemId: item.id,
      itemName: nextName,
      changedAt: updatedAt,
      changedBy,
      changes,
    });
    cancelBaristaEdit();
    const results = await Promise.all(writes);
    reportMenuSync("Barista menu item", results.some((result) => !result) ? false : true);
  };

  const visibleAuditTrail = auditTrail.filter((entry) => entry.menu === tab);
  const isKitchenSession = sessionRole === "kitchen";

  return (
    <div className="space-y-6">
      {dialog}
      <header>
        <h1 className="text-3xl font-black tracking-tight uppercase">{isKitchenSession ? "Menu & Prices" : "Menu Create"}</h1>
        <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
          {isKitchenSession
            ? "Create dishes and update the Kitchen POS selling prices"
            : "Create and manage kitchen and barista menu items from one place"}
        </p>
        {saveFeedback && (
          <p role="status" className="mt-2 text-xs font-bold text-muted-foreground">
            {saveFeedback}
          </p>
        )}
      </header>

      <Tabs value={tab} onValueChange={(value) => setTab(value as "kitchen" | "barista")}>
        <TabsList className="h-11">
          <TabsTrigger value="kitchen" className="font-black uppercase text-[10px] tracking-widest">Kitchen POS</TabsTrigger>
          {!isKitchenSession && (
            <TabsTrigger value="barista" className="font-black uppercase text-[10px] tracking-widest">Barista POS</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="kitchen" className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Create Kitchen Menu Item</CardTitle>
              <CardDescription>Set dish name, section, preparation time, and selling price.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input value={kitchenName} onChange={(event) => setKitchenName(event.target.value)} placeholder="Dish name" disabled={isDirector} />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={kitchenCategory}
                onChange={(event) => setKitchenCategory(event.target.value as KitchenMenuCategory)}
                disabled={isDirector}
              >
                {KITCHEN_CATEGORY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
              <Input type="number" min="1" value={kitchenPrepMinutes} onChange={(event) => setKitchenPrepMinutes(event.target.value)} placeholder="Prep minutes" disabled={isDirector} />
              <Input type="number" min="1" value={kitchenPrice} onChange={(event) => setKitchenPrice(event.target.value)} placeholder="Price" disabled={isDirector} />
              <div className="md:col-span-4">
                <Button className="h-10 font-black uppercase text-[10px] tracking-widest" onClick={addKitchenMenuItem} disabled={isDirector}>
                  Add Menu Item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Kitchen Menu</CardTitle>
              <CardDescription>Current kitchen menu items and selling prices.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Category</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Prep</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Price</TableHead>
                    <TableHead className="text-right font-black uppercase text-[10px] tracking-widest h-12">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {kitchenMenuItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">
                        {editingKitchenId === item.id ? (
                          <Input value={editingKitchenName} onChange={(event) => setEditingKitchenName(event.target.value)} disabled={isDirector} />
                        ) : (
                          item.name
                        )}
                      </TableCell>
                      <TableCell className="font-bold uppercase text-[10px] tracking-widest">{KITCHEN_CATEGORY_LABELS[item.category]}</TableCell>
                      <TableCell className="font-bold">{item.prepMinutes} min</TableCell>
                      <TableCell className="font-bold">
                        {editingKitchenId === item.id ? (
                          <Input type="number" min="1" value={editingKitchenPrice} onChange={(event) => setEditingKitchenPrice(event.target.value)} disabled={isDirector} />
                        ) : (
                          `TSh ${item.price.toLocaleString()}`
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingKitchenId === item.id ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => saveKitchenEdit(item)} disabled={isDirector} className="font-black uppercase text-[10px] tracking-widest">
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelKitchenEdit} className="font-black uppercase text-[10px] tracking-widest">
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startKitchenEdit(item)} disabled={isDirector} className="font-black uppercase text-[10px] tracking-widest">
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {kitchenMenuItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                        No kitchen menu items yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {!isKitchenSession && <TabsContent value="barista" className="space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Create Barista Menu Item</CardTitle>
              <CardDescription>Set item name, category, preparation time, and price.</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <Input value={baristaName} onChange={(event) => setBaristaName(event.target.value)} placeholder="Drink or snack name" disabled={isDirector} />
              <select
                className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={baristaCategory}
                onChange={(event) => setBaristaCategory(event.target.value as BaristaCategory)}
                disabled={isDirector}
              >
                <option value="espresso">Espresso</option>
                <option value="coffee">Coffee</option>
                <option value="tea">Tea</option>
                <option value="beer">Beer</option>
                <option value="wine">Wine</option>
                <option value="spirits">Spirits</option>
                <option value="cider">Cider</option>
                <option value="soft-drinks">Soft Drinks</option>
                <option value="water-juice">Water / Juice</option>
                <option value="energy-drinks">Energy Drinks</option>
                <option value="malt">Malt</option>
                <option value="cold">Cold</option>
                <option value="snacks">Snacks</option>
              </select>
              <Input type="number" min="1" value={baristaPrepMinutes} onChange={(event) => setBaristaPrepMinutes(event.target.value)} placeholder="Prep minutes" disabled={isDirector} />
              <Input type="number" min="1" value={baristaPrice} onChange={(event) => setBaristaPrice(event.target.value)} placeholder="Price" disabled={isDirector} />
              <div className="md:col-span-4">
                <Button className="h-10 font-black uppercase text-[10px] tracking-widest" onClick={addBaristaMenuItem} disabled={isDirector}>
                  Add Menu Item
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Menu</CardTitle>
              <CardDescription>Current barista menu items and selling prices.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Category</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Prep</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Price</TableHead>
                    <TableHead className="text-right font-black uppercase text-[10px] tracking-widest h-12">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baristaMenuItems.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">
                        {editingBaristaId === item.id ? (
                          <Input value={editingBaristaName} onChange={(event) => setEditingBaristaName(event.target.value)} disabled={isDirector} />
                        ) : (
                          item.name
                        )}
                      </TableCell>
                      <TableCell className="font-bold uppercase text-[10px] tracking-widest">{item.category}</TableCell>
                      <TableCell className="font-bold">{item.prepMinutes} min</TableCell>
                      <TableCell className="font-bold">
                        {editingBaristaId === item.id ? (
                          <Input type="number" min="1" value={editingBaristaPrice} onChange={(event) => setEditingBaristaPrice(event.target.value)} disabled={isDirector} />
                        ) : (
                          `TSh ${item.price.toLocaleString()}`
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingBaristaId === item.id ? (
                          <div className="flex justify-end gap-2">
                            <Button size="sm" onClick={() => saveBaristaEdit(item)} disabled={isDirector} className="font-black uppercase text-[10px] tracking-widest">
                              Save
                            </Button>
                            <Button size="sm" variant="outline" onClick={cancelBaristaEdit} className="font-black uppercase text-[10px] tracking-widest">
                              Cancel
                            </Button>
                          </div>
                        ) : (
                          <Button size="sm" variant="outline" onClick={() => startBaristaEdit(item)} disabled={isDirector} className="font-black uppercase text-[10px] tracking-widest">
                            Edit
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {baristaMenuItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                        No barista menu items yet
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>}
      </Tabs>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Menu Edit Audit Trail</CardTitle>
          <CardDescription>Recent {tab === "kitchen" ? "kitchen" : "barista"} menu changes with timestamp and details.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">When</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Changed By</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Changes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleAuditTrail.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-bold">{formatAuditDate(entry.changedAt)}</TableCell>
                  <TableCell className="font-bold">{entry.itemName}</TableCell>
                  <TableCell className="font-bold capitalize">{entry.changedBy}</TableCell>
                  <TableCell className="font-medium text-muted-foreground">{entry.changes.join(" | ")}</TableCell>
                </TableRow>
              ))}
              {visibleAuditTrail.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                    No menu edits recorded yet
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
