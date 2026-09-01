export const STORAGE_WEBSITE_MENU_ORDERS = "lighthouse-website-menu-orders";

export type MenuDepartment = "bar" | "kitchen";
export type WebsiteMenuOrderStatus = "new" | "accepted" | "rejected" | "completed";

export type PublicMenuItem = {
  id: string;
  name: string;
  price: number;
  category: string;
  department: MenuDepartment;
  description?: string;
  prepMinutes?: number;
};

export type WebsiteMenuOrderLine = {
  itemId: string;
  name: string;
  price: number;
  qty: number;
};

export type WebsiteMenuOrder = {
  id: string;
  reference: string;
  department: MenuDepartment;
  customerName: string;
  phone: string;
  destination: string;
  note: string;
  lines: WebsiteMenuOrderLine[];
  total: number;
  status: WebsiteMenuOrderStatus;
  createdAt: number;
  updatedAt: number;
};
