import { InventoryControlView } from "@/components/dashboard/inventory-control-view";

export default function BaristaStockPage() {
  return <InventoryControlView initialTab="barista-stock" visibleTabs={["barista-stock"]} />;
}
