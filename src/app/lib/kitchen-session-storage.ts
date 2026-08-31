export const STORAGE_KITCHEN_PURCHASE_SESSION = "lighthouse-kitchen-purchase-session";
export const STORAGE_KITCHEN_PURCHASE_HISTORY = "lighthouse-kitchen-purchase-history";
export const STORAGE_KITCHEN_DAILY_STOCK_SESSION = "lighthouse-kitchen-daily-stock-session";
export const STORAGE_KITCHEN_DAILY_STOCK_HISTORY = "lighthouse-kitchen-daily-stock-history";
export const STORAGE_BARISTA_PURCHASE_SESSION = "lighthouse-barista-purchase-session";
export const STORAGE_BARISTA_PURCHASE_HISTORY = "lighthouse-barista-purchase-history";
export const STORAGE_BARISTA_DAILY_STOCK_SESSION = "lighthouse-barista-daily-stock-session";
export const STORAGE_BARISTA_DAILY_STOCK_HISTORY = "lighthouse-barista-daily-stock-history";

export interface KitchenSessionSignoff {
  preparedBy: string;
  checkedBy: string;
  approvedBy: string;
  cashier: string;
}

export interface KitchenPurchaseLine {
  id: string;
  itemId: string | null;
  itemName: string;
  category: string;
  unit: string;
  previousBalance: number;
  addedQty: number;
  pricePerUnit: number;
}

export interface KitchenPurchaseSession {
  id: string;
  startedAt: string;
  lines: KitchenPurchaseLine[];
}

export interface KitchenPurchaseHistoryEntry extends KitchenPurchaseSession {
  closedAt: string;
  signoff: KitchenSessionSignoff;
}

export interface KitchenDailyStockLine {
  id: string;
  itemId: string | null;
  itemName: string;
  category: string;
  unit: string;
  openingStock: number;
  received: number;
  used: number;
  wastage: number;
}

export interface KitchenDailyStockSession {
  id: string;
  startedAt: string;
  lines: KitchenDailyStockLine[];
}

export interface KitchenDailyStockHistoryEntry extends KitchenDailyStockSession {
  closedAt: string;
  signoff: KitchenSessionSignoff;
}
