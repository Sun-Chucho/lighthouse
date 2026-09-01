"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { readStoredRole } from "@/app/lib/auth";
import { InventoryItem, ROOMS, Role } from "@/app/lib/mock-data";
import {
  adjustInventoryQuantity,
  MainStoreItem,
  getStoreItemLabel,
  normalizeBaristaProductTarget,
  normalizeStockName,
  STORAGE_MAIN_STORE_ITEMS,
  STORAGE_INVENTORY_ITEMS,
  STORAGE_STORE_MOVEMENTS,
  STORAGE_STORE_USAGE,
  StoreMovementLog,
  StoreUsageLog,
} from "@/app/lib/inventory-transfer";
import { findStoreItemForMenuName, formatTotStatus, getMenuStockStatus, getRemainingTots, getTotLimit, isTotTrackedMenuItem, normalizeBaristaMenuItems } from "@/app/lib/barista-stock";
import { printDepartmentReceipt } from "@/app/lib/receipt-print";
import { getActiveBaristaStateKey, readJson, readPosState, writeJson, writePosState } from "@/app/lib/storage";
import { BARISTA_INVENTORY_SEED } from "@/app/lib/seed-barista-data";
import { useIsDirector } from "@/hooks/use-is-director";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SyncStatusIndicator } from "@/components/sync-status-indicator";
import { KitchenSessionManager } from "@/components/dashboard/kitchen-session-manager";
import { CheckCircle2, Coffee, Minus, Pencil, Plus, Receipt, Search, Trash2, User, XCircle } from "lucide-react";
import { useConfirmDialog } from "@/hooks/use-confirm-dialog";
import { hydrateStorageKeyFromFirebase, subscribeToSyncedStorageKey } from "@/app/lib/firebase-sync";
import { readActiveSessionUsername, STORAGE_LOGIN_PROFILES, subscribeToSessionIdentity } from "@/app/lib/login-profiles";

type BaristaCategory =
  | "all"
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
type ServiceMode = "restaurant" | "room-service" | "take-away";
type BaristaPaymentMethod = "cash" | "card" | "mobile" | "credit";
type BaristaPaymentStatus = "completed" | "credit";
type BaristaOrderLine = {
  name: string;
  qty: number;
  itemId?: string;
  unitPrice?: number;
};
type SalesDateFilter = "day" | "week" | "month" | "all";
type BaristaManagerPricingRow = {
  id: string;
  name: string;
  category: string;
  buyingPrice: number;
  sellingPrice: number;
  stock: number;
  unit: string;
  quantitySold: number;
};
type BaristaManagerPricingDraft = {
  stockIn: string;
  buyingPrice: string;
  sellingPrice: string;
};

interface BaristaMenuItem {
  id: string;
  name: string;
  price: number;
  category: Exclude<BaristaCategory, "all">;
  prepMinutes: number;
  barcode?: string;
  updatedAt?: number;
  deletedAt?: number;
  sourceStoreItemId?: string;
  // Supplier cost, used only for manager costing — never shown in POS.
  buyingPrice?: number;
}

interface BaristaWasteLog {
  id: string;
  name: string;
  qty: number;
  createdAt: number;
}

interface CartLine {
  item: BaristaMenuItem;
  qty: number;
}

interface BaristaTicket {
  id: string;
  code: string;
  createdAt: number;
  mode: ServiceMode;
  destination: string;
  roomNumber?: string;
  lines: BaristaOrderLine[];
  total: number;
  status?: "active" | "delivered";
  deliveredAt?: number;
  updatedAt?: number;
}

interface BaristaPaymentRecord {
  id: string;
  ticketId: string;
  code: string;
  createdAt: number;
  mode: ServiceMode;
  destination: string;
  roomNumber?: string;
  total: number;
  status: BaristaPaymentStatus;
  method: BaristaPaymentMethod;
  lines?: BaristaOrderLine[];
  historical?: boolean;
  recordedAt?: number;
}

interface CancelledBaristaTicket extends BaristaTicket {
  source?: "kitchen" | "barista";
  cancelledAt: number;
}

interface PendingOrder {
  mode: ServiceMode;
  destination: string;
  roomNumber?: string;
  lines: BaristaOrderLine[];
  total: number;
}

const BARISTA_MENU: BaristaMenuItem[] = [];

const STORAGE_TICKETS = "lighthouse-barista-orders";
const STORAGE_SEQ = "lighthouse-barista-seq";
const STORAGE_MENU = "lighthouse-barista-menu";
const STORAGE_PAYMENTS = "lighthouse-barista-payments";
const STORAGE_CANCELLED = "lighthouse-cancelled-tickets";
const STORAGE_WASTE = "lighthouse-barista-waste";

const BARISTA_CATEGORIES: Array<{ value: BaristaCategory; label: string }> = [
  { value: "all", label: "All" },
  { value: "beer", label: "Beer" },
  { value: "wine", label: "Wine" },
  { value: "spirits", label: "Spirits" },
  { value: "cider", label: "Cider" },
  { value: "malt", label: "Malt" },
  { value: "soft-drinks", label: "Soft Drinks" },
  { value: "water-juice", label: "Water / Juice" },
  { value: "energy-drinks", label: "Energy Drinks" },
  { value: "espresso", label: "Espresso" },
  { value: "coffee", label: "Coffee" },
  { value: "tea", label: "Tea" },
  { value: "cold", label: "Iced Drinks" },
  { value: "snacks", label: "Snacks" },
];

function matchesSalesDateFilter(createdAt: number | undefined, filter: SalesDateFilter) {
  if (filter === "all") return true;
  if (!createdAt) return false;

  const saleDate = new Date(createdAt);
  if (!Number.isFinite(saleDate.getTime())) return false;

  const now = new Date();
  const saleDay = new Date(saleDate.getFullYear(), saleDate.getMonth(), saleDate.getDate()).getTime();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();

  if (filter === "day") return saleDay === today;

  if (filter === "week") {
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(endOfWeek.getDate() + 7);
    return saleDate >= startOfWeek && saleDate < endOfWeek;
  }

  return saleDate.getFullYear() === now.getFullYear() && saleDate.getMonth() === now.getMonth();
}

function formatPaymentDate(createdAt: number | undefined) {
  if (!createdAt) return "-";
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "-";
}

function getBaristaPaymentRoomNumber(payment: Pick<BaristaPaymentRecord, "mode" | "destination" | "roomNumber">) {
  if (typeof payment.roomNumber === "string" && payment.roomNumber.trim()) return payment.roomNumber.trim();
  if (payment.mode !== "room-service") return "-";
  return payment.destination.trim().match(/^room\s+(.+)$/i)?.[1]?.trim() || "-";
}

const normalizeCategory = (value: string, itemName = ""): Exclude<BaristaCategory, "all"> => {
  const normalizedValue = value.trim().toLowerCase();
  const normalizedName = itemName.trim().toLowerCase();

  if (
    normalizedValue === "espresso" ||
    normalizedValue === "coffee" ||
    normalizedValue === "tea" ||
    normalizedValue === "cold" ||
    normalizedValue === "snacks" ||
    normalizedValue === "beer" ||
    normalizedValue === "wine" ||
    normalizedValue === "cider" ||
    normalizedValue === "malt"
  ) {
    return normalizedValue;
  }

  if (normalizedValue === "soft drink" || normalizedValue === "soft-drinks" || normalizedValue === "soda") return "soft-drinks";
  if (normalizedValue === "energy drink" || normalizedValue === "energy-drinks") return "energy-drinks";
  if (normalizedValue === "water" || normalizedValue === "juice" || normalizedValue === "water-juice") return "water-juice";
  if (normalizedValue === "sparkling") return "wine";
  if (["spirit", "spirits", "whisky", "gin", "liqueur", "cognac", "aperitif", "vodka", "rum", "brandy"].includes(normalizedValue)) return "spirits";

  if (normalizedName.includes("espresso") || normalizedName.includes("macchiato")) return "espresso";
  if (normalizedName.includes("tea")) return "tea";
  if (normalizedName.includes("ice cream") || normalizedName.includes("snack")) return "snacks";
  if (normalizedName.includes("beer") || normalizedName.includes("lager") || normalizedName.includes("heineken")) return "beer";
  if (normalizedName.includes("wine")) return "wine";
  if (normalizedName.includes("cider") || normalizedName.includes("savanna") || normalizedName.includes("brutal fruit")) return "cider";
  if (normalizedName.includes("malt")) return "malt";
  if (normalizedName.includes("energy") || normalizedName.includes("red bull")) return "energy-drinks";
  if (normalizedName.includes("soda") || normalizedName.includes("coca") || normalizedName.includes("pepsi")) return "soft-drinks";
  if (normalizedName.includes("water") || normalizedName.includes("juice")) return "water-juice";
  if (normalizedName.includes("iced")) return "cold";
  return "coffee";
};

function normalizeBaristaMenuItemsFromInventory(inventory: InventoryItem[]): BaristaMenuItem[] {
  const deduped = new Map<string, BaristaMenuItem>();

  inventory
    .filter((item) => {
      const status = item.status?.toUpperCase() ?? "ACTIVE";
      const category = item.category?.trim().toLowerCase() ?? "";
      return status === "ACTIVE" && category !== "kitchen";
    })
    .forEach((item) => {
      const name = getBaristaInventoryLabel(item);
      const key = `${normalizeBaristaTarget(name)}|${(item.category ?? "").toLowerCase()}|${isTotInventoryItem(item) ? "tot" : "full"}`;
      const nextMenuItem: BaristaMenuItem = {
        id: item.id,
        name,
        price:
          typeof item.sellingPrice === "number" && item.sellingPrice > 0
            ? item.sellingPrice
            : typeof item.price === "number" && item.price > 0
              ? item.price
              : 0,
        category: normalizeCategory(item.category, name),
        prepMinutes: 2,
        barcode: item.barcode || "",
      };
      const existingItem = deduped.get(key);
      if (!existingItem || nextMenuItem.price > existingItem.price || (!!nextMenuItem.barcode && !existingItem.barcode)) {
        deduped.set(key, nextMenuItem);
      }
    });

  return Array.from(deduped.values());
}

function syncBaristaMenuItemsWithSharedInventory(
  menuItems: BaristaMenuItem[],
  inventory: InventoryItem[],
  storeItems: MainStoreItem[],
) {
  // The POS menu is authoritative: saved drinks plus manager edits. Stock
  // levels are resolved separately at render time via getMenuStockStatus.
  if (menuItems.length === 0) {
    return normalizeBaristaMenuItemsFromInventory(inventory);
  }
  return menuItems.map((menuItem) => {
    const target = normalizeBaristaTarget(menuItem.name);
    const storeMatch = storeItems.find(
      (item) => normalizeBaristaTarget(getStoreItemLabel(item)) === target,
    );
    const inventoryMatch = inventory.find((item) => {
      const names = [item.name, item.size ? `${item.name} ${item.size}` : item.name];
      return names.some((name) => normalizeBaristaTarget(name) === target);
    });
    const seedMatch = BARISTA_INVENTORY_SEED.find((item) => {
      if (!item.name) return false;
      return normalizeBaristaTarget(
        getBaristaInventoryLabel({ name: item.name, size: item.size ?? "" }),
      ) === target;
    });
    const inventoryCategory = inventoryMatch?.category?.trim().toLowerCase() === "bar"
      ? undefined
      : inventoryMatch?.category;
    const sourceCategory =
      storeMatch?.subCategory ??
      inventoryMatch?.subCategory ??
      inventoryCategory ??
      seedMatch?.category ??
      menuItem.category;
    const category = normalizeCategory(sourceCategory, menuItem.name);
    return category === menuItem.category ? menuItem : { ...menuItem, category };
  });
}

function getLocalDateInputValue() {
  const now = new Date();
  const offsetMs = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offsetMs).toISOString().slice(0, 10);
}

function normalizeBaristaTarget(name: string) {
  return normalizeBaristaProductTarget(name);
}

function normalizeBaristaMenuLink(name: string) {
  return normalizeStockName(name.replace(/\s*\(?TOTS?\)?$/i, "").trim());
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

  // A menu display label may be composed from the stored base name, size and
  // TOTS marker. Do not flatten that structure when only price/category changed.
  if (
    nextTarget === normalizeBaristaMenuLink(previousMenuName)
    || nextTarget === normalizeBaristaMenuLink(currentLabel)
  ) {
    return { name: item.name, size: item.size ?? "" };
  }

  const currentSize = item.size?.trim() ?? "";
  if (nextIsTotItem && currentSize) {
    return { name: nextStockLabel, size: currentSize };
  }
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
  if (structuredSize) {
    return { name: structuredSize[1].trim(), size: structuredSize[2].trim() };
  }

  return { name: nextStockLabel, size: "" };
}

function getBaristaInventoryLabel(item: Pick<InventoryItem, "name" | "size">) {
  const rawName = item.name.trim();
  const isTotItem = /\s*\(?TOTS?\)?$/i.test(rawName);
  const baseName = rawName.replace(/\s*\(?TOTS?\)?$/i, "").trim();
  const size = item.size?.trim() ?? "";

  if (!size) return isTotItem ? `${baseName} (TOTS)` : baseName;
  if (rawName.toLowerCase().includes(size.toLowerCase())) return rawName;
  return isTotItem ? `${baseName} ${size} (TOTS)`.trim() : `${baseName} ${size}`.trim();
}

function isTotInventoryItem(item: Pick<InventoryItem, "name" | "totPerBottle">) {
  return (typeof item.totPerBottle === "number" && item.totPerBottle > 0) || /\s*\(?TOTS?\)?$/i.test(item.name);
}

function buildSeedMenuItems(): BaristaMenuItem[] {
  return BARISTA_INVENTORY_SEED
    .filter((item) => item.name && item.status === "ACTIVE")
    .map((item, idx) => ({
      id: `barista-seed-${idx}`,
      name: getBaristaInventoryLabel({ name: item.name ?? "", size: item.size ?? "" }),
      // Customer-facing POS price is always the selling price; buying price is
      // reserved for manager costing only.
      price: item.sellingPrice ?? 0,
      buyingPrice: item.buyingPrice ?? 0,
      category: normalizeCategory(item.category ?? "cold", item.name ?? ""),
      prepMinutes: 2,
      barcode: item.barcode ?? "",
    }));
}

export default function BaristaPage() {
  const pathname = usePathname();
  const initialView = pathname.endsWith("/restock")
    ? "restock"
    : pathname.endsWith("/past-sales")
      ? "past-sales"
      : "pos";
  const isDirector = useIsDirector();
  const { confirm, dialog } = useConfirmDialog();
  const [role, setRole] = useState<Role | null>(null);
  const isManager = role === "manager";
  const isBaristaRestock = role === "barista" && initialView === "restock";
  const isBaristaPastSales = role === "barista" && initialView === "past-sales";
  const [managerTab, setManagerTab] = useState<"inventory" | "finance" | "sales" | "drinks">(
    initialView === "restock" ? "inventory" : "finance",
  );
  const [drinkEditId, setDrinkEditId] = useState<string | null>(null);
  const [drinkName, setDrinkName] = useState("");
  const [drinkPrice, setDrinkPrice] = useState("");
  const [drinkCategory, setDrinkCategory] = useState<Exclude<BaristaCategory, "all">>("coffee");
  const [drinkPrepMinutes, setDrinkPrepMinutes] = useState("5");
  const [drinkQuantity, setDrinkQuantity] = useState("0");
  const [drinkBuyingPrice, setDrinkBuyingPrice] = useState("");
  const [drinkSize, setDrinkSize] = useState("");
  const [drinkUnit, setDrinkUnit] = useState("Bottle");
  const [drinkLowThreshold, setDrinkLowThreshold] = useState("1");
  const [managerPricingDrafts, setManagerPricingDrafts] = useState<Record<string, BaristaManagerPricingDraft>>({});
  const [savingBaristaItemId, setSavingBaristaItemId] = useState("");
  const [savedBaristaItemId, setSavedBaristaItemId] = useState("");
  const [deletingBaristaItemId, setDeletingBaristaItemId] = useState("");
  const [restockSearch, setRestockSearch] = useState("");
  const [directorTab, setDirectorTab] = useState<"inventory" | "finance" | "purchases" | "sales">("finance");
  const [directorSalesDateFilter, setDirectorSalesDateFilter] = useState<SalesDateFilter>("day");
  const [category, setCategory] = useState<BaristaCategory>("all");
  const [serviceMode, setServiceMode] = useState<ServiceMode>("restaurant");
  const [searchTerm, setSearchTerm] = useState("");
  const [pastSaleDate, setPastSaleDate] = useState(getLocalDateInputValue);
  const [pastSaleSearch, setPastSaleSearch] = useState("");
  const [pastSaleMethod, setPastSaleMethod] = useState<BaristaPaymentMethod>("cash");
  const [pastSaleCart, setPastSaleCart] = useState<CartLine[]>([]);
  const [pastSaleFeedback, setPastSaleFeedback] = useState<string | null>(null);
  const [savingPastSale, setSavingPastSale] = useState(false);
  const [tableNumber, setTableNumber] = useState("");
  const [roomNumber, setRoomNumber] = useState("");

  const [cart, setCart] = useState<CartLine[]>([]);
  const [tickets, setTickets] = useState<BaristaTicket[]>([]);
  const [ticketSeq, setTicketSeq] = useState(1);
  const [storedMenuItems, setStoredMenuItems] = useState<BaristaMenuItem[]>(BARISTA_MENU);
  const [baristaPayments, setBaristaPayments] = useState<BaristaPaymentRecord[]>([]);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [posHydrated, setPosHydrated] = useState(false);
  const [queueTab, setQueueTab] = useState<"queue" | "from-store">("queue");
  const [baristaStoreItems, setBaristaStoreItems] = useState<MainStoreItem[]>([]);
  const [fromStoreEntries, setFromStoreEntries] = useState<StoreMovementLog[]>([]);
  const [usageLogs, setUsageLogs] = useState<StoreUsageLog[]>([]);
  const [useEntryId, setUseEntryId] = useState("");
  const [useQty, setUseQty] = useState("1");

  const [pendingOrder, setPendingOrder] = useState<PendingOrder | null>(null);
  const [showSettlementPopup, setShowSettlementPopup] = useState(false);
  const [showPayNowPopup, setShowPayNowPopup] = useState(false);
  const [activeUsername, setActiveUsername] = useState("");
  const [deliveringTicketId, setDeliveringTicketId] = useState<string | null>(null);

  const roomSuggestions = useMemo(() => ROOMS.map((room) => room.number), []);
  const tableSuggestions = useMemo(
    () => Array.from({ length: 30 }, (_, index) => String(index + 1)),
    [],
  );

  useEffect(() => {
    const savedRole = readStoredRole();
    setRole(savedRole);
    if (typeof window !== "undefined") {
      setActiveUsername(readActiveSessionUsername(""));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const applySessionIdentity = () => {
      setActiveUsername(readActiveSessionUsername(""));
    };

    const handleProfilesUpdated = (event: Event) => {
      const detail = (event as CustomEvent<{ key?: string }>).detail;
      if (detail?.key !== STORAGE_LOGIN_PROFILES) return;
      applySessionIdentity();
    };

    const unsubscribeSession = subscribeToSessionIdentity(applySessionIdentity);
    window.addEventListener("lighthouse-storage-updated", handleProfilesUpdated as EventListener);

    return () => {
      unsubscribeSession();
      window.removeEventListener("lighthouse-storage-updated", handleProfilesUpdated as EventListener);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const activeBaristaKey = getActiveBaristaStateKey();

    const applyBaristaSnapshot = () => {
      if (cancelled) return;
      const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
        activeBaristaKey,
        STORAGE_TICKETS,
        STORAGE_SEQ,
        STORAGE_PAYMENTS,
        STORAGE_MENU,
        1,
      );
      setTickets(snapshot.tickets);
      setTicketSeq(snapshot.ticketSeq);
      setBaristaPayments(snapshot.payments);

      const inventory = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
      setInventoryItems(inventory);

      let menuItems = snapshot.menuItems.filter(isActiveBaristaMenuItem);
      if (menuItems.length === 0 && snapshot.menuItems.length === 0) {
        menuItems = buildSeedMenuItems();
        writePosState(activeBaristaKey, snapshot.tickets, snapshot.ticketSeq, snapshot.payments, menuItems);
      }

      const activeStoreItems = (readJson<MainStoreItem[]>(STORAGE_MAIN_STORE_ITEMS) ?? []).filter((item) => !item.deletedAt);
      setStoredMenuItems(syncBaristaMenuItemsWithSharedInventory(menuItems, inventory, activeStoreItems));
      setPosHydrated(true);
    };

    const bootstrapBarista = async () => {
      await Promise.all([
        hydrateStorageKeyFromFirebase(activeBaristaKey).catch(() => undefined),
        hydrateStorageKeyFromFirebase(STORAGE_INVENTORY_ITEMS).catch(() => undefined),
        hydrateStorageKeyFromFirebase(STORAGE_MAIN_STORE_ITEMS).catch(() => undefined),
      ]);
    };

    void bootstrapBarista().finally(applyBaristaSnapshot);
    const unsubscribeBarista = subscribeToSyncedStorageKey(activeBaristaKey, applyBaristaSnapshot);
    const unsubscribeInventory = subscribeToSyncedStorageKey(STORAGE_INVENTORY_ITEMS, applyBaristaSnapshot);

    return () => {
      cancelled = true;
      unsubscribeBarista();
      unsubscribeInventory();
    };
  }, []);

  const loadFromStoreData = () => {
    const savedStoreItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS);
    const savedMovements = readJson<StoreMovementLog[]>(STORAGE_STORE_MOVEMENTS);
    const savedUsage = readJson<StoreUsageLog[]>(STORAGE_STORE_USAGE);
    setBaristaStoreItems(Array.isArray(savedStoreItems) ? savedStoreItems.filter((entry) => entry.lane === "barista" && !entry.deletedAt) : []);
    setFromStoreEntries(Array.isArray(savedMovements) ? savedMovements.filter((entry) => entry.destination === "barista") : []);
    setUsageLogs(Array.isArray(savedUsage) ? savedUsage.filter((entry) => entry.destination === "barista") : []);
  };

  useEffect(() => {
    loadFromStoreData();
    const unsubscribeStoreItems = subscribeToSyncedStorageKey(STORAGE_MAIN_STORE_ITEMS, loadFromStoreData);
    const unsubscribeMovements = subscribeToSyncedStorageKey(STORAGE_STORE_MOVEMENTS, loadFromStoreData);
    const unsubscribeUsage = subscribeToSyncedStorageKey(STORAGE_STORE_USAGE, loadFromStoreData);

    return () => {
      unsubscribeStoreItems();
      unsubscribeMovements();
      unsubscribeUsage();
    };
  }, []);

  useEffect(() => {
    if (queueTab === "from-store") loadFromStoreData();
  }, [queueTab]);

  useEffect(() => {
    const activeBaristaKey = getActiveBaristaStateKey();
    const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
      activeBaristaKey,
      STORAGE_TICKETS,
      STORAGE_SEQ,
      STORAGE_PAYMENTS,
      STORAGE_MENU,
      1,
    );
    const activeSnapshotMenuItems = snapshot.menuItems.filter(isActiveBaristaMenuItem);
    const syncedMenuItems = syncBaristaMenuItemsWithSharedInventory(activeSnapshotMenuItems, inventoryItems, baristaStoreItems);

    if (JSON.stringify(syncedMenuItems) !== JSON.stringify(activeSnapshotMenuItems)) {
      const deletedMenuItems = snapshot.menuItems.filter((item) => !isActiveBaristaMenuItem(item));
      writePosState(activeBaristaKey, snapshot.tickets, snapshot.ticketSeq, snapshot.payments, [...syncedMenuItems, ...deletedMenuItems]);
    }

    if (JSON.stringify(syncedMenuItems) !== JSON.stringify(storedMenuItems)) {
      setStoredMenuItems(syncedMenuItems);
    }
  }, [inventoryItems, baristaStoreItems]);

  useEffect(() => {
    if (serviceMode === "restaurant") {
      setRoomNumber("");
      return;
    }
    if (serviceMode === "room-service") {
      setTableNumber("");
      return;
    }
    setRoomNumber("");
    setTableNumber("");
  }, [serviceMode]);

  const getUsedQty = (movementId: string) =>
    usageLogs.filter((entry) => entry.movementId === movementId).reduce((sum, entry) => sum + entry.quantityUsed, 0);

  const updateBaristaStoreStock = (
    lines: BaristaOrderLine[],
    direction: "consume" | "restore",
  ) => {
    const updatedAt = Date.now();
    const allStoreItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
    const otherStoreItems = allStoreItems.filter((entry) => entry.lane !== "barista");
    const deletedBaristaItems = allStoreItems.filter((entry) => entry.lane === "barista" && entry.deletedAt);
    const currentBaristaItems = allStoreItems
      .filter((entry) => entry.lane === "barista" && !entry.deletedAt)
      .map((entry) => ({ ...entry, lane: "barista" as const }));
    const nextBaristaItems = [...currentBaristaItems];
    let nextInventoryItems = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];

    for (const line of lines) {
      const matchedItem = findStoreItemForMenuName(nextBaristaItems, line.name);
      if (!matchedItem) {
        const inventoryMatch = nextInventoryItems.find((item) => {
          const itemName = item.size ? `${item.name} ${item.size}` : item.name;
          return normalizeBaristaTarget(itemName) === normalizeBaristaTarget(line.name) || normalizeBaristaTarget(item.name) === normalizeBaristaTarget(line.name);
        });

        if (!inventoryMatch) continue;
        const availableUnits = typeof inventoryMatch.stock === "number" ? inventoryMatch.stock : 0;
        const availableTots = typeof inventoryMatch.totPerBottle === "number" && inventoryMatch.totPerBottle > 0
          ? availableUnits * inventoryMatch.totPerBottle - (typeof inventoryMatch.totSold === "number" ? inventoryMatch.totSold : 0)
          : availableUnits;

        if (direction === "consume" && line.qty > availableTots) {
          return { ok: false as const, error: `Not enough stock for ${line.name}.` };
        }

        nextInventoryItems = adjustInventoryQuantity(nextInventoryItems, inventoryMatch.category, line.name, direction === "consume" ? -line.qty : line.qty);
        continue;
      }

      const itemIndex = nextBaristaItems.findIndex((entry) => entry.id === matchedItem.id);
      if (itemIndex < 0) continue;

      const currentItem = nextBaristaItems[itemIndex];
      const inventoryLabel = getStoreItemLabel(currentItem);
      if (isTotTrackedMenuItem(line.name)) {
        const totLimit = getTotLimit(currentItem);
        if (totLimit <= 0) {
          return { ok: false as const, error: `Missing tot limit for ${line.name}.` };
        }

        const currentTotSold = typeof currentItem.totSold === "number" && currentItem.totSold > 0 ? currentItem.totSold : 0;
        if (direction === "consume") {
          const remainingTots = getRemainingTots(currentItem);
          if (line.qty > remainingTots) {
            return { ok: false as const, error: `Not enough tots remaining for ${line.name}.` };
          }

          const totalTotSold = currentTotSold + line.qty;
          const bottlesConsumed = Math.floor(totalTotSold / totLimit);
          nextBaristaItems[itemIndex] = {
            ...currentItem,
            stock: currentItem.stock - bottlesConsumed,
            totLimit,
            totSold: totalTotSold % totLimit,
            updatedAt,
          };
          nextInventoryItems = adjustInventoryQuantity(nextInventoryItems, "Bar", inventoryLabel, -bottlesConsumed);
          continue;
        }

        const totalTotSold = currentTotSold - line.qty;
        if (totalTotSold >= 0) {
          nextBaristaItems[itemIndex] = {
            ...currentItem,
            totLimit,
            totSold: totalTotSold,
            updatedAt,
          };
          continue;
        }

        const bottlesRestored = Math.ceil(Math.abs(totalTotSold) / totLimit);
        nextBaristaItems[itemIndex] = {
          ...currentItem,
          stock: currentItem.stock + bottlesRestored,
          totLimit,
          totSold: totalTotSold + bottlesRestored * totLimit,
          updatedAt,
        };
        nextInventoryItems = adjustInventoryQuantity(nextInventoryItems, "Bar", inventoryLabel, bottlesRestored);
        continue;
      }

      if (direction === "consume") {
        if (line.qty > currentItem.stock) {
          return { ok: false as const, error: `Not enough stock for ${line.name}.` };
        }
        nextBaristaItems[itemIndex] = { ...currentItem, stock: currentItem.stock - line.qty, updatedAt };
        nextInventoryItems = adjustInventoryQuantity(nextInventoryItems, "Bar", inventoryLabel, -line.qty);
        continue;
      }

      nextBaristaItems[itemIndex] = { ...currentItem, stock: currentItem.stock + line.qty, updatedAt };
      nextInventoryItems = adjustInventoryQuantity(nextInventoryItems, "Bar", inventoryLabel, line.qty);
    }

    const nextStoreItems = [...otherStoreItems, ...deletedBaristaItems, ...nextBaristaItems];
    setBaristaStoreItems(nextBaristaItems);
    writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems);
    writeJson(STORAGE_INVENTORY_ITEMS, nextInventoryItems);
    return { ok: true as const };
  };

  const addUsage = async () => {
    const qty = Number(useQty);
    const entry = fromStoreEntries.find((item) => item.id === useEntryId);
    if (!entry || Number.isNaN(qty) || qty <= 0) return;
    const remaining = entry.convertedQty - getUsedQty(entry.id);
    if (qty > remaining) return;
    const approved = await confirm({
      title: "Record Barista Usage",
      description: `Are you sure you want to record ${qty} units used for ${entry.itemName}?`,
      actionLabel: "Record Usage",
    });
    if (!approved) return;
    const log: StoreUsageLog = {
      id: `su-${Date.now()}`,
      movementId: entry.id,
      destination: "barista",
      quantityUsed: qty,
      usedAt: Date.now(),
    };
    const next = [log, ...usageLogs];
    setUsageLogs(next);
    const existingUsage = readJson<StoreUsageLog[]>(STORAGE_STORE_USAGE) ?? [];
    const existingInventory = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
    const nextInventory = adjustInventoryQuantity(existingInventory, "Bar", entry.itemName, -qty);
    writeJson(
      STORAGE_STORE_USAGE,
      [...next, ...existingUsage.filter((i) => i.destination !== "barista")],
    );
    writeJson(STORAGE_INVENTORY_ITEMS, nextInventory);
    setUseQty("1");
  };

  const menuItems = useMemo(
    () => normalizeBaristaMenuItems(storedMenuItems, baristaStoreItems),
    [baristaStoreItems, storedMenuItems],
  );

  useEffect(() => {
    if (!posHydrated) return;
    const latestItemsById = new Map(menuItems.map((item) => [item.id, item]));
    const latestItemsByName = new Map(menuItems.map((item) => [normalizeBaristaMenuLink(item.name), item]));

    // Only the active POS cart follows live menu changes. Historical-sale
    // drafts and completed payment records must retain their original values.
    setCart((current) => current.flatMap((line) => {
      const latestItem = latestItemsById.get(line.item.id);
      return latestItem ? [{ ...line, item: latestItem }] : [];
    }));
    setPendingOrder((current) => {
      if (!current) return current;
      const nextLines = current.lines.flatMap((line) => {
        const latestItem = line.itemId
          ? latestItemsById.get(line.itemId)
          : latestItemsByName.get(normalizeBaristaMenuLink(line.name));
        return latestItem
          ? [{ ...line, itemId: latestItem.id, name: latestItem.name, unitPrice: latestItem.price }]
          : [];
      });
      if (nextLines.length === 0) return null;
      return {
        ...current,
        lines: nextLines,
        total: nextLines.reduce((sum, line) => sum + (line.unitPrice ?? 0) * line.qty, 0),
      };
    });
  }, [menuItems, posHydrated]);

  useEffect(() => {
    if (pendingOrder) return;
    setShowSettlementPopup(false);
    setShowPayNowPopup(false);
  }, [pendingOrder]);

  const pastSaleItems = useMemo(() => {
    const normalizedSearch = normalizeStockName(pastSaleSearch);
    const searchTokens = normalizedSearch.split(" ").filter(Boolean);
    const catalog = new Map<string, BaristaMenuItem>();
    const addCandidate = (item: BaristaMenuItem) => {
      // Historical selection must preserve exact products. The operational
      // stock normalizer intentionally groups some same-size sodas and bottle
      // variants, which made distinct past-sale items disappear from search.
      const target = normalizeStockName(item.name);
      if (!target) return;
      const existing = catalog.get(target);
      if (!existing || (existing.price <= 0 && item.price > 0)) catalog.set(target, item);
    };

    menuItems.forEach(addCandidate);
    baristaStoreItems.forEach((item) => {
      const itemTarget = normalizeBaristaTarget(getStoreItemLabel(item));
      const inventoryMatch = inventoryItems.find((entry) => {
        const names = [entry.name, entry.size ? `${entry.name} ${entry.size}` : entry.name];
        return names.some((name) => normalizeBaristaTarget(name) === itemTarget);
      });
      addCandidate({
        id: `past-store-${item.id}`,
        name: getStoreItemLabel(item),
        price: item.sellingPrice ?? inventoryMatch?.sellingPrice ?? inventoryMatch?.price ?? 0,
        buyingPrice: item.buyingPrice ?? inventoryMatch?.buyingPrice ?? 0,
        category: normalizeCategory(item.subCategory ?? inventoryMatch?.subCategory ?? inventoryMatch?.category ?? "", item.name),
        prepMinutes: 2,
      });
    });
    inventoryItems
      .filter((item) => item.category.trim().toLowerCase() !== "kitchen")
      .forEach((item) => addCandidate({
        id: `past-inventory-${item.id}`,
        name: getBaristaInventoryLabel(item),
        price: item.sellingPrice || item.price || 0,
        buyingPrice: item.buyingPrice,
        category: normalizeCategory(item.subCategory ?? item.category, item.name),
        prepMinutes: 2,
      }));
    buildSeedMenuItems().forEach((item) => addCandidate({ ...item, id: `past-${item.id}` }));
    baristaPayments.forEach((payment) => {
      payment.lines?.forEach((line) => {
        const target = normalizeStockName(line.name);
        if (catalog.has(target)) return;
        const inferredPrice = typeof line.unitPrice === "number" && line.unitPrice > 0
          ? line.unitPrice
          : payment.lines?.length === 1 && line.qty > 0
            ? payment.total / line.qty
            : 0;
        addCandidate({
          id: `past-history-${target}`,
          name: line.name,
          price: inferredPrice,
          category: normalizeCategory("", line.name),
          prepMinutes: 2,
        });
      });
    });

    return Array.from(catalog.values()).filter(
      (item) => {
        if (!Number.isFinite(item.price) || item.price <= 0) return false;
        if (searchTokens.length === 0) return true;
        const haystack = normalizeStockName(`${item.name} ${item.category} ${BARISTA_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? ""}`);
        return searchTokens.every((token) => haystack.includes(token));
      },
    ).sort((a, b) => a.name.localeCompare(b.name));
  }, [baristaPayments, baristaStoreItems, inventoryItems, menuItems, pastSaleSearch]);

  const pastSaleTotal = useMemo(
    () => pastSaleCart.reduce((sum, line) => sum + line.item.price * line.qty, 0),
    [pastSaleCart],
  );
  const recordedPastSales = useMemo(
    () => baristaPayments.filter((payment) => payment.historical === true).sort((a, b) => b.createdAt - a.createdAt),
    [baristaPayments],
  );

  const filteredMenu = useMemo(
    () => {
      const normalizedSearch = searchTerm.trim().toLowerCase();
      const compactSearch = normalizedSearch.replace(/\s+/g, "");
      const searchTokens = normalizedSearch.split(/\s+/).filter(Boolean);
      return menuItems.filter((item) => {
        const inCategory = normalizedSearch.length > 0 || category === "all" || item.category === category;
        const searchHaystack = [
          item.name,
          item.category,
          item.barcode ?? "",
        ]
          .join(" ")
          .toLowerCase();
        const compactHaystack = searchHaystack.replace(/\s+/g, "");
        const inSearch =
          searchTokens.length === 0 ||
          searchTokens.every((token) => searchHaystack.includes(token)) ||
          compactHaystack.includes(compactSearch);
        return inCategory && inSearch;
      });
    },
    [category, menuItems, searchTerm],
  );

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + line.item.price * line.qty, 0), [cart]);
  const completedSalesTotal = useMemo(
    () => baristaPayments.filter((payment) => payment.status !== "credit").reduce((sum, payment) => sum + payment.total, 0),
    [baristaPayments],
  );
  const creditSalesTotal = useMemo(
    () => baristaPayments.filter((payment) => payment.status === "credit").reduce((sum, payment) => sum + payment.total, 0),
    [baristaPayments],
  );
  const recentSales = useMemo(
    () => [...baristaPayments].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8),
    [baristaPayments],
  );
  const activeTickets = useMemo(() => tickets.filter((ticket) => ticket.status !== "delivered"), [tickets]);
  const orderedTickets = useMemo(
    () =>
      [...tickets].sort((a, b) => {
        const aDelivered = a.status === "delivered";
        const bDelivered = b.status === "delivered";

        if (aDelivered !== bDelivered) return aDelivered ? 1 : -1;
        return b.createdAt - a.createdAt;
      }),
    [tickets],
  );
  const resolveBaristaInventoryItem = (item: MainStoreItem) =>
    inventoryItems.find((entry) => {
      if ((entry.category ?? "").toLowerCase() === "kitchen") return false;

      const itemNames = [
        item.name,
        getStoreItemLabel(item),
      ].map((value) => normalizeStockName(value));
      const entryNames = [
        entry.name,
        entry.size ? `${entry.name} ${entry.size}` : entry.name,
      ].map((value) => normalizeStockName(value));

      return itemNames.some((value) => entryNames.includes(value));
    });

  const baristaSalesByItem = useMemo(() => {
    const salesMap = new Map<string, number>();

    baristaPayments.forEach((payment) => {
      if (!Array.isArray(payment.lines)) return;

      payment.lines.forEach((line) => {
        const key = normalizeBaristaMenuLink(line.name);
        salesMap.set(key, (salesMap.get(key) ?? 0) + line.qty);
      });
    });

    return salesMap;
  }, [baristaPayments]);

  const baristaMenuPriceByItem = useMemo(() => {
    const priceMap = new Map<string, number>();

    menuItems.forEach((item) => {
      const key = normalizeBaristaMenuLink(item.name);
      if (typeof item.price === "number" && item.price > 0) {
        priceMap.set(key, item.price);
      }
    });

    return priceMap;
  }, [menuItems]);

  const baristaMenuBuyingPriceByItem = useMemo(() => {
    const priceMap = new Map<string, number>();

    menuItems.forEach((item) => {
      const key = normalizeBaristaMenuLink(item.name);
      if (typeof item.buyingPrice === "number" && item.buyingPrice > 0) {
        priceMap.set(key, item.buyingPrice);
      }
    });

    return priceMap;
  }, [menuItems]);

  const baristaInventoryRows = useMemo(
    () =>
      baristaStoreItems.map((item) => {
        const inventoryMatch = resolveBaristaInventoryItem(item);
        const menuBuyingPrice = baristaMenuBuyingPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item)));
        const buyingPrice =
          typeof menuBuyingPrice === "number" && menuBuyingPrice > 0
            ? menuBuyingPrice
            : typeof item.buyingPrice === "number" && item.buyingPrice > 0
            ? item.buyingPrice
            : typeof inventoryMatch?.buyingPrice === "number" && inventoryMatch.buyingPrice > 0
              ? inventoryMatch.buyingPrice
              : 0;
        const sellingPrice =
          typeof baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) === "number" &&
          (baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) ?? 0) > 0
            ? (baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) ?? 0)
            : typeof item.sellingPrice === "number" && item.sellingPrice > 0
            ? item.sellingPrice
            : typeof inventoryMatch?.sellingPrice === "number" && inventoryMatch.sellingPrice > 0
              ? inventoryMatch.sellingPrice
              : typeof baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) === "number" &&
                (baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) ?? 0) > 0
                ? (baristaMenuPriceByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) ?? 0)
              : typeof inventoryMatch?.price === "number" && inventoryMatch.price > 0
                ? inventoryMatch.price
                : 0;
        const quantitySold = baristaSalesByItem.get(normalizeBaristaMenuLink(getStoreItemLabel(item))) ?? 0;
        const capital = item.stock * buyingPrice;
        const revenue = quantitySold * sellingPrice;
        const profitLoss = revenue - capital;

        return {
          ...item,
          displayName: getStoreItemLabel(item),
          buyingPrice,
          sellingPrice,
          quantitySold,
          capital,
          revenue,
          profitLoss,
        };
      }),
    [baristaMenuBuyingPriceByItem, baristaMenuPriceByItem, baristaSalesByItem, baristaStoreItems, inventoryItems],
  );

  // Editable per-item pricing rows for the manager Inventory tab. Driven by the
  // POS menu so every drink (including premium menu-only items with no store
  // stock) gets a Buying Price and Selling Price the manager can set manually.
  const baristaManagerPricingRows = useMemo(
    () =>
      menuItems.map((menuItem) => {
        const storeIndex = findLinkedBaristaStoreItemIndex(baristaStoreItems, menuItem);
        const storeMatch = storeIndex >= 0 ? baristaStoreItems[storeIndex] : undefined;
        const inventoryIndex = findLinkedBaristaInventoryItemIndex(inventoryItems, menuItem, storeMatch?.id);
        const inventoryMatch = inventoryIndex >= 0 ? inventoryItems[inventoryIndex] : undefined;
        const buyingPrice =
          typeof menuItem.buyingPrice === "number" && menuItem.buyingPrice > 0
            ? menuItem.buyingPrice
            : typeof storeMatch?.buyingPrice === "number" && storeMatch.buyingPrice > 0
            ? storeMatch.buyingPrice
            : typeof inventoryMatch?.buyingPrice === "number" && inventoryMatch.buyingPrice > 0
            ? inventoryMatch.buyingPrice
            : 0;
        const sellingPrice = typeof menuItem.price === "number" && menuItem.price > 0 ? menuItem.price : 0;
        const stock = typeof storeMatch?.stock === "number" ? storeMatch.stock : 0;
        const unit = storeMatch?.unit ?? "";
        const quantitySold = baristaSalesByItem.get(normalizeBaristaMenuLink(menuItem.name)) ?? 0;
        return {
          id: menuItem.id,
          name: menuItem.name,
          category: menuItem.category,
          buyingPrice,
          sellingPrice,
          stock,
          unit,
          quantitySold,
        };
      }),
    [baristaSalesByItem, baristaStoreItems, inventoryItems, menuItems],
  );
  const filteredBaristaManagerPricingRows = useMemo(() => {
    const tokens = normalizeStockName(restockSearch).split(" ").filter(Boolean);
    if (tokens.length === 0) return baristaManagerPricingRows;
    return baristaManagerPricingRows.filter((item) => {
      const categoryLabel = BARISTA_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? item.category;
      const haystack = normalizeStockName(`${item.name} ${categoryLabel} ${item.unit}`);
      return tokens.every((token) => haystack.includes(token));
    });
  }, [baristaManagerPricingRows, restockSearch]);

  const updateManagerPricingDraft = (
    item: BaristaManagerPricingRow,
    field: keyof BaristaManagerPricingDraft,
    value: string,
  ) => {
    setSavedBaristaItemId("");
    setManagerPricingDrafts((current) => ({
      ...current,
      [item.id]: {
        stockIn: current[item.id]?.stockIn ?? "",
        buyingPrice: current[item.id]?.buyingPrice ?? String(item.buyingPrice),
        sellingPrice: current[item.id]?.sellingPrice ?? String(item.sellingPrice),
        [field]: value,
      },
    }));
  };

  // Save quantity and both prices as one manager action. The same values are
  // written to the POS menu, Barista store stock and inventory collection so a
  // refresh or a new login cannot reintroduce an older value from another key.
  const saveBaristaManagerItem = async (item: BaristaManagerPricingRow) => {
    const draft = managerPricingDrafts[item.id] ?? {
      stockIn: "",
      buyingPrice: String(item.buyingPrice),
      sellingPrice: String(item.sellingPrice),
    };
    const stockIn = draft.stockIn.trim() === "" ? 0 : Number(draft.stockIn);
    let stock = item.stock + stockIn;
    const buyingPrice = Number(draft.buyingPrice);
    const sellingPrice = Number(draft.sellingPrice);
    if (
      !Number.isFinite(stockIn) ||
      stockIn < 0 ||
      !Number.isFinite(buyingPrice) ||
      buyingPrice < 0 ||
      !Number.isFinite(sellingPrice) ||
      sellingPrice < 0
    ) {
      window.alert("Enter valid non-negative stock-in, buying price and selling price values.");
      return;
    }

    const updatedAt = Date.now();
    setSavingBaristaItemId(item.id);
    setSavedBaristaItemId("");
    const activeBaristaKey = getActiveBaristaStateKey();
    const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
      activeBaristaKey, STORAGE_TICKETS, STORAGE_SEQ, STORAGE_PAYMENTS, STORAGE_MENU, 490,
    );
    const persistedMenuItem = snapshot.menuItems.find((menuItem) => menuItem.id === item.id);
    const menuReference = persistedMenuItem ?? menuItems.find((menuItem) => menuItem.id === item.id);
    if (!menuReference) {
      setSavingBaristaItemId("");
      window.alert("This menu item is no longer available. Refresh the page and try again.");
      return;
    }
    const allStoreItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
    const index = findLinkedBaristaStoreItemIndex(allStoreItems, menuReference);
    let nextStoreItems: Array<MainStoreItem & { lane?: "kitchen" | "barista" }>;
    let sourceStoreItemId: string;
    if (index >= 0) {
      // Add to the freshest persisted balance so a late sync cannot turn Stock In
      // into an accidental stock overwrite.
      stock = allStoreItems[index].stock + stockIn;
      sourceStoreItemId = allStoreItems[index].id;
      nextStoreItems = allStoreItems.map((entry, idx) =>
        idx === index ? { ...entry, stock, buyingPrice, sellingPrice, updatedAt } : entry,
      );
    } else {
      const exactTarget = normalizeBaristaMenuLink(menuReference.name);
      const seedRef = BARISTA_INVENTORY_SEED.find(
        (seed) =>
          normalizeBaristaMenuLink(getBaristaInventoryLabel({ name: seed.name ?? "", size: seed.size ?? "" })) === exactTarget,
      );
      sourceStoreItemId = `bs-${updatedAt}`;
      const newStoreItem: MainStoreItem & { lane: "barista" } = {
        id: sourceStoreItemId,
        name: seedRef?.name ?? menuReference.name,
        subCategory: seedRef?.category ?? menuReference.category ?? "Bar",
        size: seedRef?.size ?? "",
        stock,
        unit: seedRef?.unit ?? "Bottle",
        minStock: seedRef?.minStock ?? 0,
        lane: "barista",
        buyingPrice,
        sellingPrice,
        updatedAt,
      };
      nextStoreItems = [...allStoreItems, newStoreItem];
    }

    const nextMenuItems = snapshot.menuItems.map((menuItem) =>
      menuItem.id === menuReference.id
        ? { ...menuItem, buyingPrice, price: sellingPrice, sourceStoreItemId, updatedAt }
        : menuItem,
    );
    if (!persistedMenuItem) {
      nextMenuItems.push({ ...menuReference, buyingPrice, price: sellingPrice, sourceStoreItemId, updatedAt });
    }

    const allInventoryItems = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
    const inventoryIndex = findLinkedBaristaInventoryItemIndex(allInventoryItems, menuReference, sourceStoreItemId);
    const nextInventoryItems = allInventoryItems.map((inventoryItem, idx) =>
      idx === inventoryIndex
        ? {
            ...inventoryItem,
            stock,
            buyingPrice,
            sellingPrice,
            price: sellingPrice,
            updatedAt,
          }
        : inventoryItem,
    );
    if (inventoryIndex < 0) {
      const storeItem = nextStoreItems.find((entry) => entry.id === sourceStoreItemId);
      nextInventoryItems.unshift({
        id: `inv-manager-${updatedAt}`,
        barcode: "",
        name: storeItem?.name ?? menuReference.name,
        category: "Bar",
        subCategory: storeItem?.subCategory ?? menuReference.category,
        size: storeItem?.size ?? "",
        stock,
        totSold: 0,
        buyingPrice,
        sellingPrice,
        price: sellingPrice,
        status: "ACTIVE",
        minStock: storeItem?.minStock ?? 0,
        unit: storeItem?.unit ?? "Bottle",
        updatedAt,
      });
    }

    const writes = [
      writeJson(activeBaristaKey, {
        tickets: snapshot.tickets,
        ticketSeq: snapshot.ticketSeq,
        payments: snapshot.payments,
        menuItems: nextMenuItems,
      }),
      writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems),
      writeJson(STORAGE_INVENTORY_ITEMS, nextInventoryItems),
    ];
    // writeJson updates the device before its cloud promise resolves. Reflect and
    // clear the intake immediately so retrying a failed sync cannot add it twice.
    setStoredMenuItems(nextMenuItems.filter(isActiveBaristaMenuItem));
    setBaristaStoreItems(nextStoreItems.filter((entry) => entry.lane === "barista" && !entry.deletedAt));
    setInventoryItems(nextInventoryItems);
    setManagerPricingDrafts((current) => {
      const nextDrafts = { ...current };
      delete nextDrafts[item.id];
      return nextDrafts;
    });

    try {
      const results = await Promise.all(writes);
      if (results.some((result) => result === false)) {
        window.alert("The values were saved on this device, but cloud synchronization is still pending. They will retry when the connection is restored.");
        return;
      }
      setSavedBaristaItemId(item.id);
      window.setTimeout(() => {
        setSavedBaristaItemId((current) => (current === item.id ? "" : current));
      }, 3000);
    } catch {
      window.alert("The values were saved on this device, but cloud synchronization did not complete. They will synchronize when the connection is restored.");
    } finally {
      setSavingBaristaItemId("");
    }
  };

  const deleteBaristaItem = async (itemId: string, itemName?: string) => {
    const activeBaristaKey = getActiveBaristaStateKey();
    const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
      activeBaristaKey, STORAGE_TICKETS, STORAGE_SEQ, STORAGE_PAYMENTS, STORAGE_MENU, 490,
    );
    const selectedItem = snapshot.menuItems.find((item) => item.id === itemId);
    if (!selectedItem || selectedItem.deletedAt) return;

    const approved = await confirm({
      title: "Delete Barista Entry",
      description: `Delete ${itemName ?? selectedItem.name} from Restock / Stock In and the POS menu? Its existing sales history will be kept.`,
      actionLabel: "Delete Entry",
    });
    if (!approved) return;

    const deletedAt = Date.now();
    const target = normalizeBaristaTarget(selectedItem.name);
    const linkedToken = getLinkedRecordToken(selectedItem.id);
    const nextMenuItems = snapshot.menuItems.map((item) =>
      item.id === itemId ? { ...item, deletedAt, updatedAt: deletedAt } : item,
    );
    const hasRemainingTarget = nextMenuItems.some(
      (item) => isActiveBaristaMenuItem(item) && normalizeBaristaTarget(item.name) === target,
    );
    const isLinkedRecord = (id: string, label: string) =>
      (linkedToken !== null && id.endsWith(linkedToken)) ||
      (!hasRemainingTarget && normalizeBaristaTarget(label) === target);

    const allStoreItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
    const nextStoreItems = allStoreItems.map((item) =>
      item.lane === "barista" && isLinkedRecord(item.id, getStoreItemLabel(item))
        ? { ...item, stock: 0, deletedAt, updatedAt: deletedAt }
        : item,
    );
    const allInventoryItems = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
    const nextInventoryItems = allInventoryItems.map((item) => {
      const label = item.size ? `${item.name} ${item.size}` : item.name;
      return item.category.trim().toLowerCase() !== "kitchen" && isLinkedRecord(item.id, label)
        ? { ...item, status: "INACTIVE" as const, stock: 0, updatedAt: deletedAt }
        : item;
    });

    setDeletingBaristaItemId(itemId);
    try {
      const results = await Promise.all([
        writePosState(activeBaristaKey, snapshot.tickets, snapshot.ticketSeq, snapshot.payments, nextMenuItems),
        writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems),
        writeJson(STORAGE_INVENTORY_ITEMS, nextInventoryItems),
      ]);
      setStoredMenuItems(nextMenuItems.filter(isActiveBaristaMenuItem));
      setBaristaStoreItems(nextStoreItems.filter((item) => item.lane === "barista" && !item.deletedAt));
      setInventoryItems(nextInventoryItems);
      setManagerPricingDrafts((current) => {
        const next = { ...current };
        delete next[itemId];
        return next;
      });
      if (results.some((result) => !result)) {
        window.alert("The entry was deleted on this device and will synchronize when the connection is restored.");
      }
    } finally {
      setDeletingBaristaItemId("");
    }
  };

  const recordWaste = async (item: BaristaMenuItem) => {
    if (isDirector) return;
    const approved = await confirm({
      title: "Remove Waste",
      description: `Are you sure you want to record 1 x ${item.name} as waste? This permanently removes it from barista stock.`,
      actionLabel: "Yes, Record Waste",
    });
    if (!approved) return;

    const stockResult = updateBaristaStoreStock([{ name: item.name, qty: 1 }], "consume");
    if (!stockResult.ok) {
      window.alert(stockResult.error);
      return;
    }

    const wasteLog: BaristaWasteLog = {
      id: `bw-${Date.now()}`,
      name: item.name,
      qty: 1,
      createdAt: Date.now(),
    };
    const existing = readJson<BaristaWasteLog[]>(STORAGE_WASTE) ?? [];
    writeJson(STORAGE_WASTE, [wasteLog, ...existing]);
    window.alert(`Recorded waste: 1 x ${item.name}`);
  };

  const baristaCapitalTotal = useMemo(
    () => baristaInventoryRows.reduce((sum, item) => sum + item.capital, 0),
    [baristaInventoryRows],
  );
  const totalBaristaRevenue = useMemo(
    () => {
      const itemizedRevenue = baristaInventoryRows.reduce((sum, item) => sum + item.revenue, 0);
      const fallbackRevenue = baristaPayments
        .filter((payment) => !Array.isArray(payment.lines) || payment.lines.length === 0)
        .reduce((sum, payment) => sum + (payment.total || 0), 0);

      return itemizedRevenue + fallbackRevenue;
    },
    [baristaInventoryRows, baristaPayments],
  );
  const baristaProfitLoss = useMemo(
    () => totalBaristaRevenue - baristaCapitalTotal,
    [baristaCapitalTotal, totalBaristaRevenue],
  );
  const filteredDirectorSalesPayments = useMemo(
    () =>
      [...baristaPayments]
        .filter((payment) => matchesSalesDateFilter(payment.createdAt, directorSalesDateFilter))
        .sort((a, b) => b.createdAt - a.createdAt),
    [baristaPayments, directorSalesDateFilter],
  );
  const directorSalesRows = useMemo(
    () =>
      filteredDirectorSalesPayments.flatMap((payment) => {
        if (!Array.isArray(payment.lines) || payment.lines.length === 0) {
          return [
            {
              id: payment.id,
              code: payment.code,
              createdAt: payment.createdAt,
              itemName: "Unitemized sale",
              quantity: 1,
              destination: payment.destination,
              roomNumber: getBaristaPaymentRoomNumber(payment),
              method: payment.method,
              status: payment.status,
              amount: payment.total,
            },
          ];
        }

        return payment.lines.map((line, index) => {
          const price = typeof line.unitPrice === "number" && line.unitPrice > 0
            ? line.unitPrice
            : baristaMenuPriceByItem.get(normalizeBaristaMenuLink(line.name)) ?? 0;
          const amount = price > 0
            ? line.qty * price
            : payment.lines?.length === 1
              ? payment.total
              : 0;

          return {
            id: `${payment.id}-${index}`,
            code: payment.code,
            createdAt: payment.createdAt,
            itemName: line.name,
            quantity: line.qty,
            destination: payment.destination,
            roomNumber: getBaristaPaymentRoomNumber(payment),
            method: payment.method,
            status: payment.status,
            amount,
          };
        });
      }),
    [baristaMenuPriceByItem, filteredDirectorSalesPayments],
  );
  const directorSalesQuantityTotal = useMemo(
    () => directorSalesRows.reduce((sum, row) => sum + row.quantity, 0),
    [directorSalesRows],
  );
  const directorSalesAmountTotal = useMemo(
    () => filteredDirectorSalesPayments.reduce((sum, payment) => sum + payment.total, 0),
    [filteredDirectorSalesPayments],
  );

  const renderFinanceTable = () => (
    <Card className="border-none shadow-sm">
      <CardHeader>
        <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Finance</CardTitle>
        <CardDescription>
          Capital = quantity in stock x buying price. Revenue = quantity sold x selling price. Profit/Loss = revenue - capital.
        </CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader className="bg-muted/10">
            <TableRow>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Stock Qty</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Qty Sold</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Buying Price</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Capital</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Selling Price</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Revenue</TableHead>
              <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Profit/Loss</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {baristaInventoryRows.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-bold">{item.displayName}</TableCell>
                <TableCell className="font-bold">{item.stock} {item.unit}</TableCell>
                <TableCell className="font-bold">{item.quantitySold}</TableCell>
                <TableCell className="font-bold">
                  {item.buyingPrice > 0 ? `TSh ${item.buyingPrice.toLocaleString()}` : "-"}
                </TableCell>
                <TableCell className="font-bold">TSh {item.capital.toLocaleString()}</TableCell>
                <TableCell className="font-bold">
                  {item.sellingPrice > 0 ? `TSh ${item.sellingPrice.toLocaleString()}` : "-"}
                </TableCell>
                <TableCell className="font-bold">TSh {item.revenue.toLocaleString()}</TableCell>
                <TableCell className={`font-bold ${item.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                  TSh {item.profitLoss.toLocaleString()}
                </TableCell>
              </TableRow>
            ))}
            {baristaInventoryRows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                  No barista finance records
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );

  const renderDirectorSalesTable = () => (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-black uppercase tracking-tight">Barista Sales</h2>
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Itemized sales captured from barista POS settlements.
          </p>
        </div>
        <Tabs value={directorSalesDateFilter} onValueChange={(value) => setDirectorSalesDateFilter(value as SalesDateFilter)}>
          <TabsList className="h-10">
            <TabsTrigger value="day" className="font-black uppercase text-[10px] tracking-widest">Day</TabsTrigger>
            <TabsTrigger value="week" className="font-black uppercase text-[10px] tracking-widest">Week</TabsTrigger>
            <TabsTrigger value="month" className="font-black uppercase text-[10px] tracking-widest">Month</TabsTrigger>
            <TabsTrigger value="all" className="font-black uppercase text-[10px] tracking-widest">All Time</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sales Records</p>
            <p className="mt-2 text-2xl font-black">{filteredDirectorSalesPayments.length}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Items Sold</p>
            <p className="mt-2 text-2xl font-black">{directorSalesQuantityTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sales Total</p>
            <p className="mt-2 text-2xl font-black">TSh {directorSalesAmountTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Sold Items</CardTitle>
          <CardDescription>Filter by day, week, month, or all time.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Date</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Code</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item Sold</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Qty</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Destination</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Room Number</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Method</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Status</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {directorSalesRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-bold text-sm">{formatPaymentDate(row.createdAt)}</TableCell>
                  <TableCell className="font-black">{row.code}</TableCell>
                  <TableCell className="font-bold">{row.itemName}</TableCell>
                  <TableCell className="font-bold">{row.quantity}</TableCell>
                  <TableCell className="font-bold">{row.destination}</TableCell>
                  <TableCell className="font-black">{row.roomNumber}</TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{row.method}</TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{row.status}</TableCell>
                  <TableCell className="font-bold">TSh {row.amount.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {directorSalesRows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                    No sales found for this filter
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  if (!posHydrated) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.3em] text-muted-foreground">Syncing Barista POS</p>
          <h1 className="mt-3 text-2xl font-black uppercase tracking-tight">Loading live menu...</h1>
        </div>
      </div>
    );
  }

  const addToCart = (item: BaristaMenuItem) => {
    if (isDirector) return;
    setCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        return current.map((line) => (line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { item, qty: 1 }];
    });
  };

  const increaseQty = (itemId: string) => {
    if (isDirector) return;
    setCart((current) => current.map((line) => (line.item.id === itemId ? { ...line, qty: line.qty + 1 } : line)));
  };

  const decreaseQty = (itemId: string) => {
    if (isDirector) return;
    setCart((current) =>
      current
        .map((line) => (line.item.id === itemId ? { ...line, qty: Math.max(0, line.qty - 1) } : line))
        .filter((line) => line.qty > 0),
    );
  };

  const addToPastSale = (item: BaristaMenuItem) => {
    setPastSaleFeedback(null);
    setPastSaleCart((current) => {
      const existing = current.find((line) => line.item.id === item.id);
      if (existing) {
        return current.map((line) => (line.item.id === item.id ? { ...line, qty: line.qty + 1 } : line));
      }
      return [...current, { item, qty: 1 }];
    });
  };

  const changePastSaleQuantity = (itemId: string, change: number) => {
    setPastSaleFeedback(null);
    setPastSaleCart((current) =>
      current
        .map((line) =>
          line.item.id === itemId ? { ...line, qty: Math.max(0, line.qty + change) } : line,
        )
        .filter((line) => line.qty > 0),
    );
  };

  const recordPastSale = async () => {
    if (!isBaristaPastSales || !pastSaleDate || pastSaleCart.length === 0 || pastSaleTotal <= 0) return;
    const saleTimestamp = new Date(`${pastSaleDate}T12:00:00`).getTime();
    if (!Number.isFinite(saleTimestamp) || pastSaleDate > getLocalDateInputValue()) {
      setPastSaleFeedback("Choose a valid past or current sales date.");
      return;
    }

    const approved = await confirm({
      title: "Record Past Bar Sale",
      description: `Record TSh ${pastSaleTotal.toLocaleString()} in alcohol sales for ${pastSaleDate}? Current stock will not be changed.`,
      actionLabel: "Record Sale",
    });
    if (!approved) return;

    setSavingPastSale(true);
    setPastSaleFeedback(null);
    try {
      const activeBaristaKey = getActiveBaristaStateKey();
      const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
        activeBaristaKey,
        STORAGE_TICKETS,
        STORAGE_SEQ,
        STORAGE_PAYMENTS,
        STORAGE_MENU,
        1,
      );
      const nextSeq = snapshot.ticketSeq + 1;
      const recordedAt = Date.now();
      const paymentRecord: BaristaPaymentRecord = {
        id: `bp-history-${recordedAt}`,
        ticketId: `historical-${recordedAt}`,
        code: `B-H-${nextSeq}`,
        createdAt: saleTimestamp,
        mode: "take-away",
        destination: "Historical Bar Sale",
        total: pastSaleTotal,
        status: pastSaleMethod === "credit" ? "credit" : "completed",
        method: pastSaleMethod,
        lines: pastSaleCart.map((line) => ({
          itemId: line.item.id,
          name: line.item.name,
          qty: line.qty,
          unitPrice: line.item.price,
        })),
        historical: true,
        recordedAt,
      };
      const nextPayments = [paymentRecord, ...snapshot.payments];

      await writePosState(
        activeBaristaKey,
        snapshot.tickets,
        nextSeq,
        nextPayments,
        snapshot.menuItems,
      );
      setTicketSeq(nextSeq);
      setBaristaPayments(nextPayments);
      setPastSaleCart([]);
      setPastSaleFeedback(`Past sale ${paymentRecord.code} recorded. Current stock was not changed.`);
    } finally {
      setSavingPastSale(false);
    }
  };

  const removeLine = (itemId: string) => {
    if (isDirector) return;
    setCart((current) => current.filter((line) => line.item.id !== itemId));
  };

  const clearCart = async () => {
    if (isDirector) return;
    const approved = await confirm({
      title: "Clear Barista Ticket",
      description: "Are you sure you want to clear the current ticket?",
      actionLabel: "Clear Ticket",
    });
    if (!approved) return;
    setCart([]);
  };

  const placeTicket = () => {
    if (isDirector) return;
    if (cart.length === 0) return;

    const destination =
      serviceMode === "room-service"
        ? `Room ${roomNumber.trim()}`
        : serviceMode === "restaurant"
        ? `Table ${tableNumber.trim()}`
        : "Take Away";

    if (serviceMode === "room-service" && !roomNumber.trim()) {
      window.alert("Enter the room number for room service.");
      return;
    }

    if (serviceMode === "restaurant" && !tableNumber.trim()) {
      window.alert("Enter the table number for restaurant service.");
      return;
    }

      setPendingOrder({
        mode: serviceMode,
        destination,
        roomNumber: serviceMode === "room-service" ? roomNumber.trim() : undefined,
        lines: cart.map((line) => ({
          itemId: line.item.id,
          name: line.item.name,
          qty: line.qty,
          unitPrice: line.item.price,
        })),
        total: subtotal,
      });
      setShowPayNowPopup(false);
      setShowSettlementPopup(true);
    };

  const finalizeOrder = async (status: BaristaPaymentStatus, method: BaristaPaymentMethod) => {
    if (isDirector) return;
    if (!pendingOrder) return;

    const stockResult = updateBaristaStoreStock(pendingOrder.lines, "consume");
    if (!stockResult.ok) {
      window.alert(stockResult.error);
      return;
    }

    const nextSeq = ticketSeq + 1;
    const createdAt = Date.now();
    setTicketSeq(nextSeq);

    const orderId = `bt-${createdAt}`;
    const code = `B-${nextSeq}`;

    const ticket: BaristaTicket = {
      id: orderId,
      code,
      createdAt,
      mode: pendingOrder.mode,
      destination: pendingOrder.destination,
      roomNumber: pendingOrder.roomNumber,
      lines: pendingOrder.lines,
      total: pendingOrder.total,
    };

    const paymentRecord: BaristaPaymentRecord = {
      id: `bp-${createdAt}`,
      ticketId: orderId,
      code,
      createdAt,
      mode: pendingOrder.mode,
      destination: pendingOrder.destination,
      roomNumber: pendingOrder.roomNumber,
      total: pendingOrder.total,
      status,
      method,
      lines: pendingOrder.lines,
    };

    const nextTickets = [ticket, ...tickets];
    const nextPayments = [paymentRecord, ...baristaPayments];
    setTickets(nextTickets);
    setBaristaPayments(nextPayments);
    writePosState(getActiveBaristaStateKey(), nextTickets, nextSeq, nextPayments, storedMenuItems);

    setCart([]);
    setPendingOrder(null);
    setShowSettlementPopup(false);
    setShowPayNowPopup(false);

    const printResult = await printDepartmentReceipt({
      department: "barista",
      code,
      destination: pendingOrder.destination,
      mode: pendingOrder.mode,
      method,
      status,
      total: pendingOrder.total,
      createdAt,
      lines: pendingOrder.lines,
    });

    if (!printResult.ok && printResult.reason) {
      window.alert(`Barista receipt was not printed: ${printResult.reason}`);
    }
  };

  const deliverTicket = async (id: string) => {
    if (isDirector || deliveringTicketId) return;
    const approved = await confirm({
      title: "Deliver Barista Order",
      description: "Are you sure you want to mark this barista order as delivered?",
      actionLabel: "Deliver",
    });
    if (!approved) return;
    setDeliveringTicketId(id);
    try {
      const activeBaristaKey = getActiveBaristaStateKey();
      const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
        activeBaristaKey,
        STORAGE_TICKETS,
        STORAGE_SEQ,
        STORAGE_PAYMENTS,
        STORAGE_MENU,
        1,
      );
      const sourceTickets = snapshot.tickets.length > 0 ? snapshot.tickets : tickets;
      const sourcePayments = snapshot.payments.length > 0 ? snapshot.payments : baristaPayments;
      const sourceMenuItems = snapshot.menuItems.length > 0 ? snapshot.menuItems : storedMenuItems;
      const deliveredAt = Date.now();
      const nextTickets = sourceTickets.map((ticket) =>
        ticket.id === id ? { ...ticket, status: "delivered" as const, deliveredAt, updatedAt: deliveredAt } : ticket,
      );

      setTickets(nextTickets);
      setTicketSeq(snapshot.ticketSeq);
      setBaristaPayments(sourcePayments);
      setStoredMenuItems(sourceMenuItems.filter(isActiveBaristaMenuItem));
      writePosState(activeBaristaKey, nextTickets, snapshot.ticketSeq, sourcePayments, sourceMenuItems);
    } finally {
      setDeliveringTicketId(null);
    }
  };

  const cancelTicket = async (id: string) => {
    if (isDirector) return;
    const ticket = tickets.find((t) => t.id === id);
    if (!ticket) return;
    if (ticket.status === "delivered") return;
    const approved = await confirm({
      title: "Cancel Barista Order",
      description: "Are you sure you want to cancel this barista order?",
      actionLabel: "Cancel Order",
    });
    if (!approved) return;

    const stockResult = updateBaristaStoreStock(ticket.lines, "restore");
    if (!stockResult.ok) {
      window.alert(stockResult.error);
      return;
    }

    const cancelled: CancelledBaristaTicket = {
      ...ticket,
      source: "barista",
      cancelledAt: Date.now(),
    };

    const existing = readJson<CancelledBaristaTicket[]>(STORAGE_CANCELLED) ?? [];
    writeJson(STORAGE_CANCELLED, [cancelled, ...existing]);

    const nextTickets = tickets.filter((ticket) => ticket.id !== id);
    setTickets(nextTickets);
    writePosState(getActiveBaristaStateKey(), nextTickets, ticketSeq, baristaPayments, storedMenuItems);
  };

  const resetDrinkForm = () => {
    setDrinkEditId(null);
    setDrinkName("");
    setDrinkPrice("");
    setDrinkPrepMinutes("5");
    setDrinkCategory("coffee");
    setDrinkQuantity("0");
    setDrinkBuyingPrice("");
    setDrinkSize("");
    setDrinkUnit("Bottle");
    setDrinkLowThreshold("1");
  };

  const saveDrink = async () => {
    const name = drinkName.trim();
    const price = parseFloat(drinkPrice);
    if (!name || isNaN(price) || price < 0) return;
    const prep = Math.max(0, parseInt(drinkPrepMinutes, 10) || 5);

    const activeBaristaKey = getActiveBaristaStateKey();
    const snapshot = readPosState<BaristaTicket, BaristaPaymentRecord, BaristaMenuItem>(
      activeBaristaKey, STORAGE_TICKETS, STORAGE_SEQ, STORAGE_PAYMENTS, STORAGE_MENU, 490,
    );
    const updatedAt = Date.now();
    const syncWrites: Array<Promise<boolean> | undefined> = [];
    let next: BaristaMenuItem[];
    if (drinkEditId) {
      const previousItem = snapshot.menuItems.find((item) => item.id === drinkEditId);
      if (!previousItem) {
        window.alert("This menu item is no longer available. Refresh the page and try again.");
        return;
      }

      // Keep the manager inventory and barista stock copies aligned with the
      // POS edit. Otherwise an edited name or price exists only in the menu
      // snapshot and appears stale on the other manager/barista screens.
      const storedItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
      const storeItemIndex = findLinkedBaristaStoreItemIndex(storedItems, previousItem);
      const sourceStoreItemId = storeItemIndex >= 0
        ? storedItems[storeItemIndex].id
        : previousItem.sourceStoreItemId;
      next = snapshot.menuItems.map((item) =>
        item.id === drinkEditId
          ? {
              ...item,
              name,
              price,
              category: drinkCategory,
              prepMinutes: prep,
              sourceStoreItemId,
              updatedAt,
            }
          : item,
      );

      if (storeItemIndex >= 0) {
        const nextStoreLabel = getEditedBaristaStockLabel(
          storedItems[storeItemIndex],
          previousItem.name,
          name,
        );
        const nextStoreItems = storedItems.map((item, index) =>
          index === storeItemIndex
            ? { ...item, ...nextStoreLabel, subCategory: drinkCategory, sellingPrice: price, updatedAt }
            : item,
        );
        syncWrites.push(writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems));
        setBaristaStoreItems(nextStoreItems.filter((item) => item.lane === "barista" && !item.deletedAt));
      }

      const storedInventory = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
      const inventoryItemIndex = findLinkedBaristaInventoryItemIndex(
        storedInventory,
        previousItem,
        sourceStoreItemId,
      );
      if (inventoryItemIndex >= 0) {
        const nextInventoryLabel = getEditedBaristaStockLabel(
          storedInventory[inventoryItemIndex],
          previousItem.name,
          name,
        );
        const nextInventory = storedInventory.map((item, index) =>
          index === inventoryItemIndex
            ? { ...item, ...nextInventoryLabel, subCategory: drinkCategory, sellingPrice: price, price, updatedAt }
            : item,
        );
        syncWrites.push(writeJson(STORAGE_INVENTORY_ITEMS, nextInventory));
        setInventoryItems(nextInventory);
      }
    } else {
      const quantity = Number(drinkQuantity);
      const buyingPrice = Number(drinkBuyingPrice) || 0;
      const lowThreshold = Number(drinkLowThreshold);
      const unit = drinkUnit.trim();
      if (
        !Number.isFinite(quantity) ||
        quantity < 0 ||
        !Number.isFinite(buyingPrice) ||
        buyingPrice < 0 ||
        !Number.isFinite(lowThreshold) ||
        lowThreshold < 0 ||
        !unit
      ) {
        return;
      }

      const sourceStoreItemId = `bs-${updatedAt}`;
      const newDrink: BaristaMenuItem = {
        id: `d-${updatedAt}`,
        name,
        price,
        category: drinkCategory,
        prepMinutes: prep,
        buyingPrice,
        sourceStoreItemId,
        updatedAt,
      };
      next = [...snapshot.menuItems, newDrink];

      const storedItems = readJson<Array<MainStoreItem & { lane?: "kitchen" | "barista" }>>(STORAGE_MAIN_STORE_ITEMS) ?? [];
      const nextStoreItems: Array<MainStoreItem & { lane?: "kitchen" | "barista" }> = [
        ...storedItems,
        {
          id: sourceStoreItemId,
          name,
          subCategory: drinkCategory,
          size: drinkSize.trim(),
          stock: quantity,
          unit,
          minStock: lowThreshold,
          lane: "barista",
          buyingPrice,
          sellingPrice: price,
          updatedAt,
        },
      ];
      syncWrites.push(writeJson(STORAGE_MAIN_STORE_ITEMS, nextStoreItems));
      setBaristaStoreItems(nextStoreItems.filter((item) => item.lane === "barista" && !item.deletedAt));

      const storedInventory = readJson<InventoryItem[]>(STORAGE_INVENTORY_ITEMS) ?? [];
      const nextInventory: InventoryItem[] = [
        {
          id: `inv-${updatedAt}`,
          barcode: "",
          name,
          category: "Bar",
          subCategory: drinkCategory,
          size: drinkSize.trim(),
          stock: quantity,
          totSold: 0,
          buyingPrice,
          sellingPrice: price,
          price,
          status: "ACTIVE",
          minStock: lowThreshold,
          unit,
          updatedAt,
        },
        ...storedInventory,
      ];
      syncWrites.push(writeJson(STORAGE_INVENTORY_ITEMS, nextInventory));
      setInventoryItems(nextInventory);
    }
    syncWrites.push(writePosState(activeBaristaKey, snapshot.tickets, snapshot.ticketSeq, snapshot.payments, next));
    setStoredMenuItems(next.filter(isActiveBaristaMenuItem));
    resetDrinkForm();
    const completedWrites = syncWrites.filter((write): write is Promise<boolean> => Boolean(write));
    const results = await Promise.all(completedWrites);
    if (results.some((result) => !result)) {
      window.alert("The barista changes were saved on this device and will synchronize when the connection is restored.");
    }
  };

  const startEditDrink = (item: BaristaMenuItem) => {
    setDrinkEditId(item.id);
    setDrinkName(item.name);
    setDrinkPrice(String(item.price));
    setDrinkCategory(item.category);
    setDrinkPrepMinutes(String(item.prepMinutes));
  };

  const deleteDrink = async (id: string) => {
    await deleteBaristaItem(id);
    if (drinkEditId === id) {
      setDrinkEditId(null);
      setDrinkName("");
      setDrinkPrice("");
    }
  };

  const DRINK_CATEGORIES = BARISTA_CATEGORIES.filter(
    (entry): entry is { value: Exclude<BaristaCategory, "all">; label: string } => entry.value !== "all",
  );

  const renderDrinksManager = () => (
    <div className="space-y-6">
      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">
            {drinkEditId ? "Edit Barista Item" : "Add New Barista Item"}
          </CardTitle>
          <CardDescription>
            {drinkEditId
              ? "Update the item details below, then save."
              : "Enter the item, stock quantity, buying price and POS selling price, then save."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Drink Name</p>
            <Input
              value={drinkName}
              onChange={(e) => setDrinkName(e.target.value)}
              placeholder="e.g. Cappuccino"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Price (TSh)</p>
            <Input
              type="number"
              min="0"
              value={drinkPrice}
              onChange={(e) => setDrinkPrice(e.target.value)}
              placeholder="e.g. 3500"
            />
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Category</p>
            <select
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-medium"
              value={drinkCategory}
              onChange={(e) => setDrinkCategory(e.target.value as Exclude<BaristaCategory, "all">)}
            >
              {DRINK_CATEGORIES.map((entry) => (
                <option key={entry.value} value={entry.value}>{entry.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Prep Time (min)</p>
            <Input
              type="number"
              min="0"
              value={drinkPrepMinutes}
              onChange={(e) => setDrinkPrepMinutes(e.target.value)}
              placeholder="e.g. 5"
            />
          </div>
          {!drinkEditId && (
            <>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Quantity</p>
                <Input
                  type="number"
                  min="0"
                  value={drinkQuantity}
                  onChange={(e) => setDrinkQuantity(e.target.value)}
                  placeholder="e.g. 24"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Buying Price (TSh)</p>
                <Input
                  type="number"
                  min="0"
                  value={drinkBuyingPrice}
                  onChange={(e) => setDrinkBuyingPrice(e.target.value)}
                  placeholder="e.g. 1800"
                />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Size</p>
                <Input value={drinkSize} onChange={(e) => setDrinkSize(e.target.value)} placeholder="e.g. 330ml" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Unit</p>
                <Input value={drinkUnit} onChange={(e) => setDrinkUnit(e.target.value)} placeholder="e.g. Bottle" />
              </div>
              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Low Stock Alert</p>
                <Input
                  type="number"
                  min="0"
                  value={drinkLowThreshold}
                  onChange={(e) => setDrinkLowThreshold(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            </>
          )}
          <div className="md:col-span-2 lg:col-span-4 flex gap-2">
            <Button onClick={saveDrink} className="gap-2">
              <Plus className="h-4 w-4" />
              {drinkEditId ? "Save Changes" : "Add Barista Item"}
            </Button>
            {drinkEditId && (
              <Button variant="outline" onClick={resetDrinkForm}>
                Cancel
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Drinks Menu</CardTitle>
          <CardDescription>{storedMenuItems.length} drink{storedMenuItems.length !== 1 ? "s" : ""} on menu</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Name</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Category</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Price (TSh)</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Prep (min)</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {storedMenuItems.map((item) => (
                <TableRow key={item.id} className={drinkEditId === item.id ? "bg-primary/5" : ""}>
                  <TableCell className="font-bold">{item.name}</TableCell>
                  <TableCell className="font-bold capitalize">{item.category}</TableCell>
                  <TableCell className="font-bold">TSh {item.price.toLocaleString()}</TableCell>
                  <TableCell className="font-bold">{item.prepMinutes} min</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => startEditDrink(item)}>
                        <Pencil className="h-3 w-3 mr-1" /> Edit
                      </Button>
                      <Button size="sm" variant="outline" className="h-8 px-2 text-red-600 hover:text-red-700 hover:border-red-300" onClick={() => deleteDrink(item.id)}>
                        <Trash2 className="h-3 w-3 mr-1" /> Delete
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {storedMenuItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                    No drinks on menu yet. Add one above.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );

  if (isBaristaPastSales) {
    return (
      <div className="space-y-6">
        {dialog}
        <header>
          <h1 className="text-3xl font-black tracking-tight">Record Past Bar Sales</h1>
          <p className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
            Backdate alcohol sales without changing the current accurate stock balance
          </p>
        </header>

        <Card className="border-amber-200 bg-amber-50/60 shadow-none">
          <CardContent className="p-4 text-xs font-black uppercase tracking-widest text-amber-800">
            Historical entries update barista sales and financial reports only. They never deduct bottles or tots from current stock.
          </CardContent>
        </Card>

        <div className="grid gap-6 xl:grid-cols-3">
          <Card className="border-none shadow-sm xl:col-span-2">
            <CardHeader className="space-y-4">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Items Sold</CardTitle>
                <CardDescription>Search all current and previous barista products, then select the quantities sold.</CardDescription>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sales Date</p>
                  <Input
                    type="date"
                    max={getLocalDateInputValue()}
                    value={pastSaleDate}
                    onChange={(event) => {
                      setPastSaleDate(event.target.value);
                      setPastSaleFeedback(null);
                    }}
                    className="h-11"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Search Barista Items</p>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={pastSaleSearch}
                      onChange={(event) => setPastSaleSearch(event.target.value)}
                      placeholder="Beer, wine, soda, coffee..."
                      className="h-11 pl-10"
                    />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {pastSaleItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => addToPastSale(item)}
                    className="rounded-xl border bg-white p-4 text-left transition hover:border-primary hover:shadow-sm"
                  >
                    <Badge variant="outline" className="text-[9px] font-black uppercase tracking-widest">
                      {BARISTA_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? item.category}
                    </Badge>
                    <p className="mt-3 font-black">{item.name}</p>
                    <p className="mt-2 text-sm font-black text-primary">TSh {item.price.toLocaleString()}</p>
                  </button>
                ))}
                {pastSaleItems.length === 0 && (
                  <p className="col-span-full py-10 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
                    No matching barista items found
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="h-fit border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Past Sale</CardTitle>
              <CardDescription>{pastSaleDate || "Choose a sales date"}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3">
                {pastSaleCart.map((line) => (
                  <div key={line.item.id} className="rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black">{line.item.name}</p>
                        <p className="text-xs font-bold text-muted-foreground">
                          TSh {(line.item.price * line.qty).toLocaleString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="button" size="sm" variant="outline" onClick={() => changePastSaleQuantity(line.item.id, -1)} className="h-8 w-8 p-0">
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="min-w-6 text-center font-black">{line.qty}</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => changePastSaleQuantity(line.item.id, 1)} className="h-8 w-8 p-0">
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
                {pastSaleCart.length === 0 && (
                  <p className="py-6 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">No items selected</p>
                )}
              </div>

              <div className="space-y-1">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Payment Method</p>
                <select
                  value={pastSaleMethod}
                  onChange={(event) => setPastSaleMethod(event.target.value as BaristaPaymentMethod)}
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-sm font-bold"
                >
                  <option value="cash">Cash</option>
                  <option value="card">Card</option>
                  <option value="mobile">Mobile Money</option>
                  <option value="credit">Credit</option>
                </select>
              </div>

              <div className="flex justify-between border-t pt-4 text-lg font-black">
                <span>Total</span>
                <span className="text-primary">TSh {pastSaleTotal.toLocaleString()}</span>
              </div>

              {pastSaleFeedback && (
                <p className="rounded-lg border bg-muted/20 p-3 text-xs font-bold">{pastSaleFeedback}</p>
              )}

              <Button
                onClick={() => void recordPastSale()}
                disabled={!pastSaleDate || pastSaleCart.length === 0 || pastSaleTotal <= 0 || savingPastSale}
                className="h-11 w-full font-black uppercase text-[10px] tracking-widest"
              >
                {savingPastSale ? "Recording..." : "Record Past Sale"}
              </Button>
            </CardContent>
          </Card>
        </div>

        <Card className="border-none shadow-sm">
          <CardHeader>
            <CardTitle className="text-xl font-black uppercase tracking-tight">Recorded Past Sales</CardTitle>
            <CardDescription>Historical bar entries already included in sales and financial reports.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader className="bg-muted/10">
                <TableRow>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Date</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Reference</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Items</TableHead>
                  <TableHead className="font-black uppercase text-[10px] tracking-widest">Method</TableHead>
                  <TableHead className="text-right font-black uppercase text-[10px] tracking-widest">Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordedPastSales.map((payment) => (
                  <TableRow key={payment.id}>
                    <TableCell className="font-bold">{new Date(payment.createdAt).toLocaleDateString()}</TableCell>
                    <TableCell className="font-black">{payment.code}</TableCell>
                    <TableCell className="font-bold text-sm">
                      {payment.lines?.map((line) => `${line.name} x${line.qty}`).join(" | ") || "-"}
                    </TableCell>
                    <TableCell className="font-black uppercase text-[10px] tracking-widest">{payment.method}</TableCell>
                    <TableCell className="text-right font-black">TSh {payment.total.toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {recordedPastSales.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="py-10 text-center text-xs font-black uppercase tracking-widest text-muted-foreground">
                      No past sales recorded yet
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

  if (isManager || isBaristaRestock) {
  return (
    <div className="space-y-6">
      {dialog}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Coffee className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">
                {isBaristaRestock ? "Restock / Stock In" : "Barista Setup"}
              </h1>
              <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
                {isBaristaRestock
                  ? "Record received stock and add new barista items"
                  : "Inventory visibility for barista operations"}
              </p>
            </div>
          </div>
          <Button
            onClick={() => {
              resetDrinkForm();
              setManagerTab("drinks");
            }}
            className="gap-2 font-black uppercase tracking-widest"
          >
            <Plus className="h-4 w-4" />
            Add Barista Item
          </Button>
        </header>
        {isManager && <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Barista Capital</p>
              <p className="mt-2 text-2xl font-black">TSh {baristaCapitalTotal.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Barista Revenue</p>
              <p className="mt-2 text-2xl font-black">TSh {totalBaristaRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profit And Loss</p>
              <p className={`mt-2 text-2xl font-black ${baristaProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                TSh {baristaProfitLoss.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>}
        <Tabs value={managerTab} onValueChange={(value) => setManagerTab(value as "inventory" | "finance" | "sales" | "drinks")}>
          <TabsList className={isBaristaRestock ? "grid h-10 w-full grid-cols-2 md:w-[360px]" : "h-10"}>
            {isManager && <TabsTrigger value="finance" className="font-black uppercase text-[10px] tracking-widest">Finance</TabsTrigger>}
            <TabsTrigger value="inventory" className="font-black uppercase text-[10px] tracking-widest">
              {isBaristaRestock ? "Restock / Stock In" : "Inventory"}
            </TabsTrigger>
            {isManager && <TabsTrigger value="sales" className="font-black uppercase text-[10px] tracking-widest">Sales</TabsTrigger>}
            <TabsTrigger value="drinks" className="font-black uppercase text-[10px] tracking-widest">
              {isBaristaRestock ? "Add Items" : "Items / Drinks"}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {managerTab === "drinks" ? renderDrinksManager() : managerTab === "finance" ? renderFinanceTable() : managerTab === "sales" ? renderDirectorSalesTable() : (
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Inventory & Pricing</CardTitle>
              <CardDescription>
                Enter newly received stock to add it to the current balance, adjust prices if needed, then press Save.
              </CardDescription>
              {isBaristaRestock && (
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={restockSearch}
                    onChange={(event) => setRestockSearch(event.target.value)}
                    placeholder="Search item name or category..."
                    className="h-11 pl-10"
                  />
                </div>
              )}
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Current Stock</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Stock In</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Qty Sold</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Buying Price (Cost)</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Selling Price (POS)</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredBaristaManagerPricingRows.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-bold">{item.name}</TableCell>
                      <TableCell className="font-bold">
                        {item.stock} {item.unit}
                      </TableCell>
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            min="0"
                            value={managerPricingDrafts[item.id]?.stockIn ?? ""}
                            placeholder="0"
                            className="h-9 w-20"
                            onChange={(event) => updateManagerPricingDraft(item, "stockIn", event.target.value)}
                          />
                          {item.unit ? (
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">{item.unit}</span>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">{item.quantitySold}</TableCell>
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">TSh</span>
                          <Input
                            type="number"
                            min="0"
                            value={
                              managerPricingDrafts[item.id]?.buyingPrice ??
                              (item.buyingPrice > 0 ? String(item.buyingPrice) : "")
                            }
                            placeholder="0"
                            className="h-9 w-28"
                            onChange={(event) => updateManagerPricingDraft(item, "buyingPrice", event.target.value)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="font-bold">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">TSh</span>
                          <Input
                            type="number"
                            min="0"
                            value={
                              managerPricingDrafts[item.id]?.sellingPrice ??
                              (item.sellingPrice > 0 ? String(item.sellingPrice) : "")
                            }
                            placeholder="0"
                            className="h-9 w-28"
                            onChange={(event) => updateManagerPricingDraft(item, "sellingPrice", event.target.value)}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <Button
                            size="sm"
                            onClick={() => void saveBaristaManagerItem(item)}
                            disabled={savingBaristaItemId === item.id || deletingBaristaItemId === item.id}
                            className="min-w-24 gap-2 font-black uppercase tracking-widest"
                          >
                            {savedBaristaItemId === item.id ? (
                              <>
                                <CheckCircle2 className="h-4 w-4" />
                                Saved
                              </>
                            ) : savingBaristaItemId === item.id ? (
                              "Saving..."
                            ) : (
                              managerPricingDrafts[item.id]?.stockIn ? "Stock In / Save" : "Save"
                            )}
                          </Button>
                          {isBaristaRestock && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => void deleteBaristaItem(item.id, item.name)}
                              disabled={deletingBaristaItemId === item.id || savingBaristaItemId === item.id}
                              className="gap-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                              {deletingBaristaItemId === item.id ? "Deleting..." : "Delete"}
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {filteredBaristaManagerPricingRows.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                        {restockSearch.trim() ? "No matching barista items" : "No barista menu items yet"}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (isDirector) {
    return (
      <div className="space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
              <Coffee className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight">Barista Analytics</h1>
              <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
                Managing Director read-only controls
              </p>
            </div>
          </div>
          <Badge variant="outline" className="h-10 px-4 justify-center border-primary text-primary font-black uppercase text-[10px] tracking-widest">
            {baristaPayments.length} Sales Records
          </Badge>
        </header>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Barista Capital</p>
              <p className="mt-2 text-2xl font-black">TSh {baristaCapitalTotal.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Barista Revenue</p>
              <p className="mt-2 text-2xl font-black">TSh {totalBaristaRevenue.toLocaleString()}</p>
            </CardContent>
          </Card>
          <Card className="border-none shadow-sm">
            <CardContent className="p-4">
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Profit And Loss</p>
              <p className={`mt-2 text-2xl font-black ${baristaProfitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                TSh {baristaProfitLoss.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={directorTab} onValueChange={(value) => setDirectorTab(value as "inventory" | "finance" | "purchases" | "sales")}>
          <TabsList className="h-10">
            <TabsTrigger value="inventory" className="font-black uppercase text-[10px] tracking-widest">Stock / Inventory</TabsTrigger>
            <TabsTrigger value="finance" className="font-black uppercase text-[10px] tracking-widest">Finances</TabsTrigger>
            <TabsTrigger value="sales" className="font-black uppercase text-[10px] tracking-widest">Sales</TabsTrigger>
            <TabsTrigger value="purchases" className="font-black uppercase text-[10px] tracking-widest">Purchases</TabsTrigger>
          </TabsList>
        </Tabs>

        {directorTab === "inventory" ? (
          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Inventory from Store</CardTitle>
              <CardDescription>Store additions plus received, used, and remaining quantities</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader className="bg-muted/10">
                  <TableRow>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Store Qty</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Qty Sold</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Selling Price</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Revenue</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Profit/Loss</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Tot Status</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Received</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Used</TableHead>
                    <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Remaining</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {baristaInventoryRows.map((item) => {
                    const itemEntries = fromStoreEntries.filter((entry) => entry.itemName === item.name);
                    const received = itemEntries.reduce((sum, entry) => sum + entry.convertedQty, 0);
                    const used = itemEntries.reduce((sum, entry) => sum + getUsedQty(entry.id), 0);
                    const remaining = Math.max(0, received - used);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-bold">{item.displayName}</TableCell>
                        <TableCell className="font-bold">{item.stock} {item.unit}</TableCell>
                        <TableCell className="font-bold">{item.quantitySold}</TableCell>
                        <TableCell className="font-bold">
                          {item.sellingPrice > 0 ? `TSh ${item.sellingPrice.toLocaleString()}` : "-"}
                        </TableCell>
                        <TableCell className="font-bold">TSh {item.revenue.toLocaleString()}</TableCell>
                        <TableCell className={`font-bold ${item.profitLoss >= 0 ? "text-green-600" : "text-red-600"}`}>
                          TSh {item.profitLoss.toLocaleString()}
                        </TableCell>
                        <TableCell className="font-bold">{formatTotStatus(item)}</TableCell>
                        <TableCell className="font-bold">{received} units</TableCell>
                        <TableCell className="font-bold">{used} units</TableCell>
                        <TableCell className="font-bold">{remaining} units</TableCell>
                      </TableRow>
                    );
                  })}
                  {baristaStoreItems.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={10} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                        No inventory records
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        ) : directorTab === "finance" ? (
          <div className="space-y-6">
            {renderFinanceTable()}
            <Card className="border-none shadow-sm">
              <CardHeader>
                <CardTitle className="text-xl font-black uppercase tracking-tight">Payment Records</CardTitle>
                <CardDescription>Completed and credit sales records from barista settlements</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Code</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Destination</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Status</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Method</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Amount</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {baristaPayments.map((payment) => (
                      <TableRow key={payment.id}>
                        <TableCell className="font-black">{payment.code}</TableCell>
                        <TableCell className="font-bold">{payment.destination}</TableCell>
                        <TableCell className="font-black uppercase text-[10px] tracking-widest">{payment.status}</TableCell>
                        <TableCell className="font-black uppercase text-[10px] tracking-widest">{payment.method}</TableCell>
                        <TableCell className="font-bold">TSh {payment.total.toLocaleString()}</TableCell>
                        <TableCell className="font-bold text-sm">{new Date(payment.createdAt).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                    {baristaPayments.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={6} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                          No sales records
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        ) : directorTab === "sales" ? (
          renderDirectorSalesTable()
        ) : (
          <KitchenSessionManager isDirector department="barista" visibleTabs={["purchase"]} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {dialog}
      <header className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary rounded-2xl flex items-center justify-center text-white shadow-lg shadow-primary/20">
            <Coffee className="w-7 h-7" />
          </div>
          <div>
            <h1 className="text-3xl font-black tracking-tight">Bar POS</h1>
            <p className="text-muted-foreground text-sm uppercase font-bold tracking-wider">
              Order intake and delivery control
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <SyncStatusIndicator />
          <Badge variant="outline" className="h-10 px-4 justify-center border-primary text-primary font-black uppercase text-[10px] tracking-widest">
            {activeTickets.length} Active Orders
          </Badge>
        </div>
      </header>
      {isDirector && (
        <Card className="border-emerald-200 bg-emerald-50/60 shadow-none">
          <CardContent className="p-3 text-xs font-black uppercase tracking-widest text-emerald-700">
            Managing Director View: Barista operations analytics and stock visibility only
          </CardContent>
        </Card>
      )}

      {role === "barista" && !isDirector && (
        <Card className="border-none shadow-sm">
          <CardHeader>
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="text-xl font-black uppercase tracking-tight">Bar Account</CardTitle>
                <CardDescription>View the active bar role session.</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Logged In User</p>
                <div className="mt-3 flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-700">
                    <User className="h-4 w-4" />
                  </div>
                  <p className="text-xl font-black">{activeUsername || "BAR"}</p>
                </div>
              </div>
              <div className="rounded-2xl border bg-muted/20 p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.25em] text-muted-foreground">Role PIN</p>
                <p className="mt-3 text-sm font-bold text-muted-foreground">
                  This workstation uses the centrally managed Bar role PIN. No email or personal username is required.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Completed Sales</p>
            <p className="mt-2 text-2xl font-black">TSh {completedSalesTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Credit Sales</p>
            <p className="mt-2 text-2xl font-black">TSh {creditSalesTotal.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card className="border-none shadow-sm">
          <CardContent className="p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sales Records</p>
            <p className="mt-2 text-2xl font-black">{baristaPayments.length}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <Card className="border-none shadow-sm">
            <CardHeader className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={searchTerm}
                  onChange={(event) => {
                    const val = event.target.value;
                    setSearchTerm(val);
                    // Barcode Search Logic
                    const match = menuItems.find(i => i.barcode === val.trim());
                    if (match) {
                      addToCart(match);
                      setSearchTerm(""); // Clear for next scan
                    }
                  }}
                  placeholder="Search drinks or scan barcode..."
                  className="pl-10 h-12"
                  autoFocus
                />
              </div>

              <Tabs value={category} onValueChange={(value) => setCategory(value as BaristaCategory)}>
                <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-xl bg-muted/30 p-1.5">
                  {BARISTA_CATEGORIES.map((entry) => (
                    <TabsTrigger key={entry.value} value={entry.value} className="font-black uppercase text-[10px] tracking-widest rounded-lg">
                      {entry.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <Tabs value={serviceMode} onValueChange={(value) => setServiceMode(value as ServiceMode)}>
                <TabsList className="w-full grid grid-cols-3 h-11 bg-muted/30 rounded-xl">
                  <TabsTrigger value="restaurant" className="font-black uppercase text-[10px] tracking-widest">Restaurant</TabsTrigger>
                  <TabsTrigger value="room-service" className="font-black uppercase text-[10px] tracking-widest">Room Service</TabsTrigger>
                  <TabsTrigger value="take-away" className="font-black uppercase text-[10px] tracking-widest">Take Away</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredMenu.map((item) => {
                  const stockStatus = getMenuStockStatus(baristaStoreItems, item.name);
                  return (
                  <div
                    key={item.id}
                    className={`flex flex-col text-left bg-white border rounded-2xl p-5 transition-all hover:border-primary/50 hover:shadow-md ${!stockStatus.available ? "opacity-50" : ""}`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <Badge variant="outline" className="uppercase text-[9px] font-black tracking-widest">
                          {BARISTA_CATEGORIES.find((entry) => entry.value === item.category)?.label ?? item.category}
                      </Badge>
                        <span className="text-[10px] font-black text-muted-foreground uppercase tracking-widest text-right">
                          <span className="block">{stockStatus.label}</span>
                          {item.prepMinutes} min
                        </span>
                      </div>
                      <h3 className="font-black text-lg leading-tight">{item.name}</h3>
                      <span className="mt-4 font-black">TSh {(item.price || 0).toLocaleString()}</span>
                      <div className="mt-4 flex items-center gap-2">
                        <Button
                          type="button"
                          onClick={() => addToCart(item)}
                          disabled={!stockStatus.available || isDirector}
                          className="h-9 flex-1 gap-1 font-black uppercase text-[10px] tracking-widest"
                        >
                          <Plus className="w-4 h-4" /> Add
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void recordWaste(item)}
                          disabled={isDirector}
                          className="h-9 gap-1 font-black uppercase text-[10px] tracking-widest text-red-600 hover:text-red-700 hover:border-red-300"
                        >
                          <Trash2 className="w-4 h-4" /> Waste
                        </Button>
                      </div>
                  </div>
                )})}

                {filteredMenu.length === 0 && (
                  <div className="col-span-full text-center py-10 opacity-50">
                    <p className="font-black uppercase tracking-widest text-xs">No drinks found</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Barista Operations</CardTitle>
              <CardDescription>Queue, delivered records, and stock received from Main Store</CardDescription>
              <Tabs value={queueTab} onValueChange={(value) => setQueueTab(value as "queue" | "from-store")}>
                <TabsList className="w-full md:w-[280px] grid grid-cols-2 h-10 bg-muted/30 rounded-xl">
                  <TabsTrigger value="queue" className="font-black uppercase text-[10px] tracking-widest">Queue</TabsTrigger>
                  <TabsTrigger value="from-store" className="font-black uppercase text-[10px] tracking-widest">From Store</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardHeader>
            <CardContent className="p-0">
              {queueTab === "queue" ? (
                <Table>
                  <TableHeader className="bg-muted/10">
                    <TableRow>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Ticket</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Details</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Total</TableHead>
                      <TableHead className="font-black uppercase text-[10px] tracking-widest h-12 text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {orderedTickets.map((ticket) => {
                      const isDelivered = ticket.status === "delivered";

                      return (
                        <TableRow key={ticket.id} className={isDelivered ? "bg-green-50/50" : undefined}>
                          <TableCell className="font-black">
                            <p>{ticket.code}</p>
                            <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground mt-1">
                              {ticket.mode} | {ticket.destination}
                            </p>
                            {isDelivered && (
                              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-green-700">
                                Delivered {ticket.deliveredAt ? new Date(ticket.deliveredAt).toLocaleString() : ""}
                              </p>
                            )}
                          </TableCell>
                          <TableCell className="font-bold text-sm">
                            {ticket.lines.map((line) => `${line.name} x${line.qty}`).join(" | ")}
                          </TableCell>
                          <TableCell className="font-black">TSh {ticket.total.toLocaleString()}</TableCell>
                          <TableCell className="text-right">
                            {isDelivered ? (
                              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                                <CheckCircle2 className="w-4 h-4 mr-1" /> Delivered
                              </Badge>
                            ) : (
                              <div className="flex justify-end gap-2">
                                <Button onClick={() => deliverTicket(ticket.id)} disabled={isDirector || deliveringTicketId === ticket.id} className="h-9 font-black uppercase text-[10px] tracking-widest bg-green-600 hover:bg-green-600/90">
                                  <CheckCircle2 className="w-4 h-4 mr-1" /> {deliveringTicketId === ticket.id ? "Saving" : "Delivered"}
                                </Button>
                                <Button onClick={() => cancelTicket(ticket.id)} disabled={isDirector} className="h-9 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-600/90 text-white">
                                  <XCircle className="w-4 h-4 mr-1" /> Cancelled
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}

                    {orderedTickets.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="py-12 text-center opacity-40">
                          <Coffee className="w-12 h-12 mx-auto mb-3" />
                          <p className="font-black uppercase tracking-widest text-xs">No orders in queue</p>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              ) : (
                <div className="space-y-3 p-4">
                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Store Item</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Qty</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Tot Status</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Low Threshold</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {baristaStoreItems.map((item) => (
                        <TableRow key={item.id}>
                          <TableCell className="font-bold">{item.name}</TableCell>
                          <TableCell className="font-bold">{item.stock} {item.unit}</TableCell>
                          <TableCell className="font-bold">{formatTotStatus(item)}</TableCell>
                          <TableCell className="font-bold">{item.minStock}</TableCell>
                          <TableCell className="font-black uppercase text-[10px] tracking-widest">
                            {item.stock <= 0 ? "Out" : item.stock < item.minStock ? "Low" : "In Stock"}
                          </TableCell>
                        </TableRow>
                      ))}
                      {baristaStoreItems.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-8 text-center opacity-40">
                            <p className="font-black uppercase tracking-widest text-xs">No stock added from inventory yet</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select
                      className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={useEntryId}
                      onChange={(event) => setUseEntryId(event.target.value)}
                    >
                      <option value="">Select item to use</option>
                      {fromStoreEntries.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.itemName}
                        </option>
                      ))}
                    </select>
                    <Input type="number" min="1" value={useQty} onChange={(event) => setUseQty(event.target.value)} placeholder="Usage quantity" />
                    <Button className="h-10 font-black uppercase text-[10px] tracking-widest" onClick={addUsage} disabled={!useEntryId}>
                      Record Usage
                    </Button>
                  </div>

                  <Table>
                    <TableHeader className="bg-muted/10">
                      <TableRow>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Item</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Quantity Received</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Used</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Remaining</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Conversion</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Date</TableHead>
                        <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Source</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fromStoreEntries.map((entry) => {
                        const used = getUsedQty(entry.id);
                        const remaining = Math.max(0, entry.convertedQty - used);
                        return (
                          <TableRow key={entry.id}>
                            <TableCell className="font-bold">{entry.itemName}</TableCell>
                            <TableCell className="font-bold">{entry.convertedQty} units</TableCell>
                            <TableCell className="font-bold">{used} units</TableCell>
                            <TableCell className="font-bold">{remaining} units</TableCell>
                            <TableCell className="font-bold">1 {entry.storeUnit} = {entry.conversionValue} units</TableCell>
                            <TableCell className="font-bold text-sm">{new Date(entry.movedAt).toLocaleString()}</TableCell>
                            <TableCell className="font-black uppercase text-[10px] tracking-widest">Store</TableCell>
                          </TableRow>
                        );
                      })}
                      {fromStoreEntries.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-12 text-center opacity-40">
                            <p className="font-black uppercase tracking-widest text-xs">No stock received from store</p>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Card className="shadow-2xl border-none bg-white overflow-hidden">
          <div className="h-1.5 bg-primary" />
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-xl font-black uppercase tracking-tight">Current Ticket</CardTitle>
              <Badge variant="outline" className="font-black uppercase text-[10px] tracking-widest">
                {cart.reduce((count, line) => count + line.qty, 0)} items
              </Badge>
            </div>
            <CardDescription>Prepare and place a barista order</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {serviceMode === "room-service" ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Room Number</label>
                <Input
                  list="barista-room-numbers"
                  value={roomNumber}
                  onChange={(event) => setRoomNumber(event.target.value)}
                  placeholder="Enter room number"
                />
                <datalist id="barista-room-numbers">
                  {roomSuggestions.map((room) => (
                    <option key={room} value={room} />
                  ))}
                </datalist>
              </div>
            ) : serviceMode === "restaurant" ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Table Number</label>
                <Input
                  list="barista-table-numbers"
                  value={tableNumber}
                  onChange={(event) => setTableNumber(event.target.value)}
                  placeholder="Enter table number"
                />
                <datalist id="barista-table-numbers">
                  {tableSuggestions.map((table) => (
                    <option key={table} value={table} />
                  ))}
                </datalist>
              </div>
            ) : (
              <div className="rounded-xl border p-3 bg-muted/20">
                <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">Service Type</p>
                <p className="font-bold">Take Away</p>
              </div>
            )}

            {cart.length === 0 ? (
              <div className="h-44 rounded-xl border border-dashed flex flex-col items-center justify-center text-center opacity-40">
                <Receipt className="w-10 h-10 mb-2" />
                <p className="font-black uppercase tracking-widest text-[10px]">Ticket is empty</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                {cart.map((line) => (
                  <div key={line.item.id} className="border rounded-xl p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold leading-tight">{line.item.name}</p>
                        <p className="text-[10px] text-muted-foreground font-black uppercase tracking-widest mt-1">
                          TSh {(line.item.price || 0).toLocaleString()} each
                        </p>
                      </div>
                      <button
                        onClick={() => removeLine(line.item.id)}
                        className="p-1.5 rounded-md text-destructive hover:bg-destructive/10"
                        aria-label={`Remove ${line.item.name}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => decreaseQty(line.item.id)}>
                          <Minus className="w-3.5 h-3.5" />
                        </Button>
                        <span className="w-8 text-center font-black">{line.qty}</span>
                        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => increaseQty(line.item.id)}>
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <span className="font-black text-sm">TSh {((line.item.price || 0) * line.qty).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-2 border-t pt-4">
              <div className="flex justify-between text-lg font-black pt-2">
                <span>Total</span>
                <span className="text-primary">TSh {subtotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline" onClick={clearCart} disabled={cart.length === 0 || isDirector} className="h-11 font-black uppercase text-[10px] tracking-widest">
                Clear Ticket
              </Button>
              <Button onClick={placeTicket} disabled={cart.length === 0 || isDirector} className="h-11 font-black uppercase text-[10px] tracking-widest">
                Place Order
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-none shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl font-black uppercase tracking-tight">Recent Barista Sales</CardTitle>
          <CardDescription>Live completed and credit sales captured from the barista POS</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader className="bg-muted/10">
              <TableRow>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Code</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Destination</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Method</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Status</TableHead>
                <TableHead className="font-black uppercase text-[10px] tracking-widest h-12">Amount</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentSales.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="font-black">{payment.code}</TableCell>
                  <TableCell className="font-bold">{payment.destination}</TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{payment.method}</TableCell>
                  <TableCell className="font-black uppercase text-[10px] tracking-widest">{payment.status}</TableCell>
                  <TableCell className="font-bold">TSh {payment.total.toLocaleString()}</TableCell>
                </TableRow>
              ))}
              {recentSales.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="py-10 text-center font-black uppercase text-[10px] tracking-widest text-muted-foreground">
                    No barista sales yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {!isDirector && showSettlementPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Select Settlement</CardTitle>
              <CardDescription>Choose Pay Now or Credit</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => {
                  setShowSettlementPopup(false);
                  setShowPayNowPopup(true);
                }}
                className="w-full h-11 font-black uppercase text-[10px] tracking-widest"
              >
                Paid Now
              </Button>
              <Button
                onClick={() => finalizeOrder("credit", "credit")}
                className="w-full h-11 font-black uppercase text-[10px] tracking-widest bg-red-600 hover:bg-red-600/90 text-white"
              >
                Credit
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowSettlementPopup(false);
                  setShowPayNowPopup(false);
                }}
                className="w-full h-10 font-black uppercase text-[10px] tracking-widest"
              >
                Close
              </Button>
            </CardContent>
          </Card>
        </div>
      )}

      {!isDirector && showPayNowPopup && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle className="text-xl font-black uppercase tracking-tight">Pay Now Method</CardTitle>
              <CardDescription>Select cash, card, or mobile</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button onClick={() => finalizeOrder("completed", "cash")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                Cash
              </Button>
              <Button onClick={() => finalizeOrder("completed", "card")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                Card
              </Button>
              <Button onClick={() => finalizeOrder("completed", "mobile")} className="w-full h-11 font-black uppercase text-[10px] tracking-widest">
                Mobile
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowPayNowPopup(false);
                  setShowSettlementPopup(true);
                }}
                className="w-full h-10 font-black uppercase text-[10px] tracking-widest"
              >
                Back
              </Button>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );

}

function getLinkedRecordToken(id: string) {
  return id.match(/(\d{10,})$/)?.[1] ?? null;
}

function hasLinkedRecordId(candidateId: string, linkedIds: Array<string | undefined>) {
  const candidateToken = getLinkedRecordToken(candidateId);
  return candidateToken !== null && linkedIds.some((id) => id && getLinkedRecordToken(id) === candidateToken);
}

function findLinkedBaristaStoreItemIndex(
  items: Array<MainStoreItem & { lane?: "kitchen" | "barista" }>,
  menuItem: BaristaMenuItem,
) {
  const isActiveBaristaItem = (item: MainStoreItem & { lane?: "kitchen" | "barista" }) =>
    item.lane === "barista" && !item.deletedAt;
  if (menuItem.sourceStoreItemId) {
    const sourceIndex = items.findIndex(
      (item) => isActiveBaristaItem(item) && item.id === menuItem.sourceStoreItemId,
    );
    if (sourceIndex >= 0) return sourceIndex;
  }

  const linkedIds = [menuItem.id, menuItem.sourceStoreItemId];
  const linkedIndex = items.findIndex(
    (item) => isActiveBaristaItem(item) && hasLinkedRecordId(item.id, linkedIds),
  );
  if (linkedIndex >= 0) return linkedIndex;

  const exactTarget = normalizeBaristaMenuLink(menuItem.name);
  const exactIndex = items.findIndex(
    (item) => isActiveBaristaItem(item) && normalizeBaristaMenuLink(getStoreItemLabel(item)) === exactTarget,
  );
  if (exactIndex >= 0) return exactIndex;
  if (/\s*\(?TOTS?\)?$/i.test(menuItem.name)) {
    return items.findIndex(
      (item) => isActiveBaristaItem(item) && normalizeBaristaMenuLink(item.name) === exactTarget,
    );
  }
  return -1;
}

function findLinkedBaristaInventoryItemIndex(
  items: InventoryItem[],
  menuItem: BaristaMenuItem,
  sourceStoreItemId?: string,
) {
  const isActiveBaristaItem = (item: InventoryItem) =>
    item.category.trim().toLowerCase() !== "kitchen" && item.status !== "INACTIVE";
  const exactIdIndex = items.findIndex(
    (item) => isActiveBaristaItem(item) && item.id === menuItem.id,
  );
  if (exactIdIndex >= 0) return exactIdIndex;

  const linkedIds = [menuItem.id, menuItem.sourceStoreItemId, sourceStoreItemId];
  const linkedIndex = items.findIndex(
    (item) => isActiveBaristaItem(item) && hasLinkedRecordId(item.id, linkedIds),
  );
  if (linkedIndex >= 0) return linkedIndex;

  const exactTarget = normalizeBaristaMenuLink(menuItem.name);
  return items.findIndex((item) => {
    if (!isActiveBaristaItem(item)) return false;
    const labels = [item.name, item.size ? `${item.name} ${item.size}` : item.name];
    return labels.some((label) => normalizeBaristaMenuLink(label) === exactTarget);
  });
}

function isActiveBaristaMenuItem(item: BaristaMenuItem) {
  return !item.deletedAt;
}
