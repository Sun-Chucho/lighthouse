import { Role } from "@/app/lib/mock-data";

const ROLE_ALIASES: Record<string, Role> = {
  manager: "manager",
  hotelmanager: "manager",
  "hotel-manager": "manager",
  director: "director",
  md: "director",
  managingdirector: "director",
  "managing-director": "director",
  inventory: "inventory",
  im: "inventory",
  inventorymanager: "inventory",
  "inventory-manager": "inventory",
  cashier: "cashier",
  reception: "cashier",
  receptionist: "cashier",
  rb: "cashier",
  kitchen: "kitchen",
  kp: "kitchen",
  kitchenpos: "kitchen",
  "kitchen-pos": "kitchen",
  barista: "barista",
  bp: "barista",
  baristapos: "barista",
  "barista-pos": "barista",
};

function normalizeRoleKey(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "");
}

export function normalizeRole(value: string | null | undefined): Role | null {
  if (!value) return null;
  return ROLE_ALIASES[normalizeRoleKey(value)] ?? null;
}

export function readStoredRole(): Role | null {
  if (typeof window === "undefined") return null;
  return normalizeRole(localStorage.getItem("lighthouse-role"));
}
