export type KitchenMenuCategory =
  | "salad"
  | "soup"
  | "snacks"
  | "beef"
  | "fish"
  | "pork"
  | "local-food"
  | "pizza"
  | "burger"
  | "sandwich"
  | "pasta"
  | "dessert"
  | "drinks";

export interface KitchenMenuItem {
  id: string;
  name: string;
  price: number;
  category: KitchenMenuCategory;
  prepMinutes: number;
  description?: string;
  updatedAt?: number;
}

import { PUBLIC_KITCHEN_MENU } from "@/app/lib/public-kitchen-menu";

export const KITCHEN_CATEGORY_OPTIONS: Array<{ value: KitchenMenuCategory; label: string }> = [
  { value: "salad", label: "Salads" },
  { value: "soup", label: "Soups" },
  { value: "snacks", label: "Snacks" },
  { value: "beef", label: "Beef" },
  { value: "fish", label: "Fish" },
  { value: "pork", label: "Pork" },
  { value: "local-food", label: "Local Food" },
  { value: "pizza", label: "Pizza" },
  { value: "burger", label: "Burgers" },
  { value: "sandwich", label: "Sandwiches" },
  { value: "pasta", label: "Pasta" },
  { value: "dessert", label: "Desserts" },
  { value: "drinks", label: "Drinks" },
];

export const KITCHEN_CATEGORY_LABELS = Object.fromEntries(
  KITCHEN_CATEGORY_OPTIONS.map((option) => [option.value, option.label]),
) as Record<KitchenMenuCategory, string>;

export const DEFAULT_KITCHEN_MENU: KitchenMenuItem[] = PUBLIC_KITCHEN_MENU;

function isKitchenMenuCategory(value: unknown): value is KitchenMenuCategory {
  return KITCHEN_CATEGORY_OPTIONS.some((option) => option.value === value);
}

function isValidKitchenMenuItem(item: unknown): item is KitchenMenuItem {
  if (!item || typeof item !== "object") return false;
  const candidate = item as Partial<KitchenMenuItem>;
  return Boolean(
    candidate.id?.trim()
      && candidate.name?.trim()
      && typeof candidate.price === "number"
      && Number.isFinite(candidate.price)
      && candidate.price > 0
      && isKitchenMenuCategory(candidate.category)
      && typeof candidate.prepMinutes === "number"
      && Number.isFinite(candidate.prepMinutes)
      && candidate.prepMinutes > 0,
  );
}

export function isDefaultKitchenMenuItem() {
  return false;
}

export function mergeKitchenMenuItems(menuItems: KitchenMenuItem[]): KitchenMenuItem[] {
  const uniqueItems = new Map<string, KitchenMenuItem>();
  for (const item of menuItems) {
    if (isValidKitchenMenuItem(item)) uniqueItems.set(item.id, item);
  }
  return uniqueItems.size > 0 ? Array.from(uniqueItems.values()) : DEFAULT_KITCHEN_MENU;
}
