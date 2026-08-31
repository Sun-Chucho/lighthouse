"use client";

import { MainStoreItem } from "@/app/lib/inventory-transfer";

const TOT_LIMITS_BY_LABEL: Record<string, number> = {};

export function getBaristaStoreLabel(item: Pick<MainStoreItem, "name" | "size">): string {
  return item.size ? `${item.name} ${item.size}` : item.name;
}

export function getMenuBaseLabel(menuName: string): string {
  return menuName.replace(/\s*\(?TOTS?\)?$/i, "").trim();
}

export function getTotLimit(item: Pick<MainStoreItem, "name" | "size" | "totLimit">): number {
  if (typeof item.totLimit === "number" && item.totLimit > 0) return item.totLimit;
  return TOT_LIMITS_BY_LABEL[getMenuBaseLabel(getBaristaStoreLabel(item))] ?? 0;
}

export function isTotTrackedMenuItem(menuName: string): boolean {
  return /\s*\(?TOTS?\)?$/i.test(menuName);
}

export function getRemainingTots(item: Pick<MainStoreItem, "name" | "size" | "stock" | "totLimit" | "totSold">): number {
  const limit = getTotLimit(item);
  if (limit <= 0) return 0;
  const sold = typeof item.totSold === "number" ? item.totSold : 0;
  return Math.max(0, item.stock * limit + (limit - sold));
}

export function formatTotStatus(item: Pick<MainStoreItem, "name" | "size" | "stock" | "totLimit" | "totSold">): string {
  const limit = getTotLimit(item);
  if (limit <= 0) return "-";
  return `${getRemainingTots(item)} tots left`;
}

export function findStoreItemForMenuName(items: MainStoreItem[], menuName: string): MainStoreItem | undefined {
  const target = normalizeBaristaTarget(menuName);
  return items.find((item) => normalizeBaristaTarget(getBaristaStoreLabel(item)) === target);
}

function normalizeBaristaTarget(name: string) {
  return name.replace(/\s*\(?TOTS?\)?$/i, "").trim().toLowerCase();
}

export function normalizeBaristaMenuItems<
  T extends {
    id: string;
    name: string;
    price: number;
    category: string;
    prepMinutes: number;
  },
>(menuItems: T[], storeItems: MainStoreItem[]) {
  return menuItems.map((item) => {
    const matchedStoreItem = findStoreItemForMenuName(storeItems, item.name);
    if (!matchedStoreItem) {
      if (!isTotTrackedMenuItem(item.name)) return item;
      return {
        ...item,
        name: getMenuBaseLabel(item.name),
      };
    }

    const expectedName = getTotLimit(matchedStoreItem) > 0
      ? `${getBaristaStoreLabel(matchedStoreItem)} (TOTS)`
      : getBaristaStoreLabel(matchedStoreItem);

    if (item.name === expectedName) return item;

    return {
      ...item,
      name: expectedName,
    };
  });
}

export function getMenuStockStatus(items: MainStoreItem[], menuName: string) {
  const matchedStoreItem = findStoreItemForMenuName(items, menuName);
  if (!matchedStoreItem) {
    return {
      available: true,
      label: "Menu Item",
    };
  }

  if (isTotTrackedMenuItem(menuName)) {
    const remainingTots = getRemainingTots(matchedStoreItem);
    return {
      available: remainingTots > 0,
      label: `${remainingTots} tots left`,
    };
  }

  return {
    available: matchedStoreItem.stock > 0,
    label: `${matchedStoreItem.stock} ${matchedStoreItem.unit} left`,
  };
}
