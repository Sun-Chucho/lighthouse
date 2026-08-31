export const STAFF_ROLES = [
  "manager",
  "director",
  "reception",
  "inventory",
  "kitchen",
  "bar",
] as const;

export type StaffRole = (typeof STAFF_ROLES)[number];

export const STAFF_PORTAL_PATH = "/staff";
export const VISIBLE_STAFF_ROLES = [
  "manager",
  "reception",
  "inventory",
  "kitchen",
  "bar",
] as const satisfies readonly StaffRole[];

export type RoleConfig = {
  slug: string;
  label: string;
  shortLabel: string;
  description: string;
  initials: string;
};

export const ROLE_CONFIG: Record<StaffRole, RoleConfig> = {
  manager: {
    slug: "manager",
    label: "Hotel Manager",
    shortLabel: "Manager",
    description: "Full lodge oversight, rooms, staff, reporting, and operational control.",
    initials: "HM",
  },
  director: {
    slug: "login",
    label: "Managing Director",
    shortLabel: "Director",
    description: "Executive access to high-level lodge performance and reports.",
    initials: "MD",
  },
  reception: {
    slug: "rb",
    label: "Reception & Bookings",
    shortLabel: "Reception",
    description: "Room availability, reservations, guest arrivals, and front-desk operations.",
    initials: "RB",
  },
  inventory: {
    slug: "im",
    label: "Inventory Manager",
    shortLabel: "Inventory",
    description: "Stock oversight, movements, suppliers, and future procurement controls.",
    initials: "IM",
  },
  kitchen: {
    slug: "kp",
    label: "Kitchen Operations",
    shortLabel: "Kitchen",
    description: "Kitchen orders, preparation workflow, menu, and stock access.",
    initials: "KP",
  },
  bar: {
    slug: "bp",
    label: "Bar & POS",
    shortLabel: "Bar",
    description: "Bar orders, beverage service, menu, and stock access.",
    initials: "BP",
  },
};

const ROLE_ALIASES: Record<string, StaffRole> = {
  manager: "manager",
  director: "director",
  im: "inventory",
  inventory: "inventory",
  rb: "reception",
  reception: "reception",
  receptionist: "reception",
  kp: "kitchen",
  kitchen: "kitchen",
  bp: "bar",
  bar: "bar",
  barista: "bar",
};

export function normalizeStaffRole(value: unknown): StaffRole | null {
  if (typeof value !== "string") return null;
  return ROLE_ALIASES[value.trim().toLowerCase().replace(/[\s_-]+/g, "")] ?? null;
}

export function roleFromPathSegment(segment: string | undefined): StaffRole | null {
  const normalizedSegment = segment?.trim().toLowerCase();
  return STAFF_ROLES.find((role) => ROLE_CONFIG[role].slug === normalizedSegment) ?? null;
}

export function getRoleLoginPath(role: StaffRole): string {
  return `/${ROLE_CONFIG[role].slug}`;
}

export function getRoleHomePath(role: StaffRole): string {
  return `${getRoleLoginPath(role)}/dashboard`;
}
