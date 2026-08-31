export type CompanyStockCategory =
  | "linen"
  | "cutleries"
  | "cups-pots"
  | "glasses"
  | "plates-bowls"
  | "others"
  | "staff-utensils"
  | "reception"
  | "lights";

export interface CompanyStockItem {
  id: string;
  name: string;
  openingStock: string;
  received: string;
  issued: string;
  damaged: string;
  damageReason?: string;
  balance: string;
  category: CompanyStockCategory;
  createdAt: number;
}

export const STORAGE_COMPANY_STOCK = "lighthouse-company-stock";
